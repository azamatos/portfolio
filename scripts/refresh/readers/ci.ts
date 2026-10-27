// `ci` values: a number, a piece of text or a Markdown table from the log of the latest successful run of a
// workflow on the default branch, dated when that run ended.

import { rest, restText } from "../github.ts";
import { firstNumber, once, type Def, type Reading } from "./types.ts";

type Run = { id: number; html_url: string; updated_at: string };
type Job = {
  id: number;
  name: string;
  html_url: string;
  completed_at: string | null;
};

// Each log line starts with a timestamp ("2026-10-27T12:19:01.1234567Z "); colour codes are ESC [ … m.
const TIMESTAMP = /^\uFEFF?\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z ?/gm;
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

/** A job log as plain text: no timestamps, no colour codes. */
export const cleanLog = (log: string) =>
  log.replace(TIMESTAMP, "").replace(ANSI, "").replace(/\r\n?/g, "\n");

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

/**
 * The rows of the first Markdown table in `log` whose header has every one of `columns` (exact names, any case),
 * cut to those columns in that order.
 */
export function tableIn(log: string, columns: string[]): string[][] {
  const lines = log.split("\n");
  const seen: string[] = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!/^\s*\|.*\|\s*$/.test(lines[i])) continue;
    if (!/^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(lines[i + 1])) continue;
    const head = cells(lines[i]).map((c) => c.toLowerCase());
    seen.push(cells(lines[i]).join(", "));
    const at = columns.map((c) => head.indexOf(c.toLowerCase()));
    if (at.includes(-1)) continue;
    const rows: string[][] = [];
    for (
      let j = i + 2;
      j < lines.length && /^\s*\|.*\|\s*$/.test(lines[j]);
      j++
    ) {
      const row = cells(lines[j]);
      rows.push(at.map((k) => row[k] ?? ""));
    }
    if (rows.length === 0) throw new Error("the table has no rows");
    return rows;
  }
  throw new Error(
    `no table with the columns ${columns.join(", ")}` +
      (seen.length
        ? ` (tables found: ${seen.map((s) => `"${s}"`).join("; ")})`
        : ""),
  );
}

export async function readCi(
  repo: string,
  branch: string,
  def: Def<"ci">,
): Promise<Reading> {
  const run = await once(`run ${repo} ${def.workflow} ${branch}`, async () => {
    const { workflow_runs } = await rest<{ workflow_runs: Run[] }>(
      `/repos/${repo}/actions/workflows/${def.workflow}/runs?branch=${encodeURIComponent(branch)}&status=success&per_page=1`,
    );
    if (!workflow_runs[0])
      throw new Error(`no successful run of ${def.workflow} on ${branch}`);
    return workflow_runs[0];
  });
  const jobs = await once(`jobs ${repo} ${run.id}`, async () => {
    const { jobs } = await rest<{ jobs: Job[] }>(
      `/repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`,
    );
    return jobs;
  });
  // When the run ended: its last job's end.
  const ends = jobs
    .map((j) => j.completed_at)
    .filter((t): t is string => t !== null)
    .sort();
  const asOf = new Date(ends.at(-1) ?? run.updated_at).toISOString();

  const picked = def.job ? jobs.filter((j) => j.name === def.job) : jobs;
  if (picked.length === 0)
    throw new Error(
      `no job "${def.job}" in ${run.html_url} (jobs: ${jobs.map((j) => `"${j.name}"`).join(", ")})`,
    );
  const logs = await Promise.all(
    picked.map((job) =>
      once(`log ${repo} ${job.id}`, async () =>
        cleanLog(await restText(`/repos/${repo}/actions/jobs/${job.id}/logs`)),
      ),
    ),
  );
  const log = logs.join("\n");
  const source = picked.length === 1 ? picked[0].html_url : run.html_url;
  const where = `the log of ${def.job ? `"${def.job}"` : "any job"}, ${run.html_url}`;

  if (def.table) {
    try {
      return { value: tableIn(log, def.table), source, asOf };
    } catch (e) {
      throw new Error(`${(e as Error).message} in ${where}`, { cause: e });
    }
  }

  const matches = [...log.matchAll(new RegExp(def.pattern!, "gm"))];
  if (matches.length === 0)
    throw new Error(`/${def.pattern}/ matches nothing in ${where}`);
  if (def.text) {
    const text = matches[0][1]?.trim();
    if (!text) throw new Error(`/${def.pattern}/ captures nothing in ${where}`);
    return { value: text, source, asOf };
  }
  const numbers = (def.sum ? matches : matches.slice(0, 1)).map((m) =>
    firstNumber(m[1], `the match "${m[0].trim()}"`),
  );
  const value = numbers.reduce((a, b) => a + b, 0);
  return { value: Number(value.toFixed(6)), source, asOf };
}
