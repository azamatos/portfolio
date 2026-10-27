// `ci` values: a number from the log of the latest successful run of a workflow on the default branch.

import { rest, restText } from "../github.ts";
import { firstNumber, once, type Def, type Reading } from "./types.ts";

type Run = { id: number; html_url: string };
type Job = { id: number; name: string; html_url: string };

// Each log line starts with a timestamp ("2026-10-27T12:19:01.1234567Z "); colour codes are ESC [ … m.
const TIMESTAMP = /^\uFEFF?\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z ?/gm;
// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

/** A job log as plain text: no timestamps, no colour codes. */
export const cleanLog = (log: string) =>
  log.replace(TIMESTAMP, "").replace(ANSI, "").replace(/\r\n?/g, "\n");

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

  const matches = [...logs.join("\n").matchAll(new RegExp(def.pattern, "gm"))];
  if (matches.length === 0)
    throw new Error(
      `/${def.pattern}/ matches nothing in the log of ${def.job ? `"${def.job}"` : "any job"}, ${run.html_url}`,
    );
  const numbers = (def.sum ? matches : matches.slice(0, 1)).map((m) =>
    firstNumber(m[1], `the match "${m[0].trim()}"`),
  );
  const value = numbers.reduce((a, b) => a + b, 0);
  return {
    value: Number(value.toFixed(6)),
    source: picked.length === 1 ? picked[0].html_url : run.html_url,
  };
}
