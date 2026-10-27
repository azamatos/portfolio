// pnpm data:refresh [project] [--no-shots] [--loops] [--dry-run]
//
// Reads every project's values from their sources, takes its screenshots and loops, checks ages and links, and
// writes src/data/collected/<id>.json. A value that can't be read keeps its last good entry and goes into
// `problems`; the command then exits with an error, after writing what it could. After an upload run, media in R2
// that nothing uses any more is deleted once it's 30 days old. See README.md, "Project data".

import { parseArgs } from "node:util";
import type {
  Collected,
  ProjectConfig,
} from "../../src/lib/projects/schema.ts";
import { resolveValues } from "../../src/lib/projects/values.ts";
import { closeBrowser } from "./browser.ts";
import { ageInDays, brokenLinks, linksIn, staleManual } from "./checks.ts";
import { cleanUp } from "./cleanup.ts";
import { loadCollected, loadProject, projectIds } from "./config.ts";
import { writeCollected } from "./output.ts";
import { missingCredentials } from "./r2.ts";
import { isFetched, readValues } from "./readers/index.ts";
import { rawDir, takeShot, type ShotEntry } from "./shots/index.ts";

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "no-shots": { type: "boolean", default: false },
    loops: { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (flags.help) {
  console.log(`pnpm data:refresh [project] [--no-shots] [--loops] [--dry-run]

  project     one id from src/content/projects/ (all of them by default)
  --no-shots  read values and check links, keep the shots as they are
  --loops     record the loops again too (by default only a loop that isn't collected yet is recorded)
  --dry-run   read and capture everything, write and upload nothing (files go to .cache/refresh/)

R2 uploads need R2_ACCOUNT_ID, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (.env locally).
GitHub reads use GITHUB_TOKEN, or the GitHub CLI's sign-in.`);
  process.exit(0);
}

const dryRun = flags["dry-run"];
const shotsWanted = !flags["no-shots"];
const missing = missingCredentials();
const publish = !dryRun && missing.length === 0;
const inActions = process.env.GITHUB_ACTIONS === "true";

const all = await projectIds();
const targets = positionals.length ? positionals : all;
for (const id of targets)
  if (!all.includes(id)) {
    console.error(`No project "${id}". Projects: ${all.join(", ")}.`);
    process.exit(2);
  }

type Value = Collected["values"][string]["value"];
type Problem = Collected["problems"][number];

const show = (v: Value) =>
  typeof v === "number"
    ? v.toLocaleString("en-US")
    : Array.isArray(v)
      ? `a table of ${v.length} rows`
      : v;
const same = (a: Value, b: Value) => JSON.stringify(a) === JSON.stringify(b);
const pad = (s: string, n: number) => s + " ".repeat(Math.max(1, n - s.length));

if (shotsWanted && !publish)
  console.log(
    dryRun
      ? "Dry run: nothing is written or uploaded; encoded shots go to .cache/refresh/."
      : `Upload skipped: ${missing.join(", ")} not set. Shots are encoded into .cache/refresh/ and the collected files keep their old shots.`,
  );
else if (dryRun) console.log("Dry run: nothing is written.");

const totals = {
  read: 0,
  fetched: 0,
  shots: 0,
  newShots: 0,
  uploaded: 0,
  skipped: 0,
  loopsKept: 0,
  links: 0,
  problems: 0,
  written: 0,
  crashed: 0,
};

/** One project: read, shoot, check, write. Returns its problems. */
async function refresh(id: string): Promise<Problem[]> {
  const config: ProjectConfig = await loadProject(id);
  const before = await loadCollected(id);
  const now = new Date();
  const problems: Problem[] = [];
  const problem = (p: Problem, line = `✗ ${pad(p.name, 16)}${p.message}`) => {
    problems.push(p);
    console.log(`  ${line}`);
  };
  console.log(`\n${config.name} (${id})`);

  // Values
  const readings = await readValues(config);
  const values: Collected["values"] = {};
  for (const [name, def] of Object.entries(config.values ?? {})) {
    if (!isFetched(def)) continue;
    totals.fetched++;
    const got = readings.get(name)!;
    const old = before?.values[name];
    if (got instanceof Error) {
      if (old) values[name] = old;
      const stale = old && ageInDays(old.asOf, now) > def.maxAge;
      const kept = old
        ? `kept ${show(old.value)} from ${old.asOf.slice(0, 10)}${stale ? `, older than its maxAge of ${def.maxAge} days` : ""}`
        : "no value yet";
      problem({ name, message: `${got.message} (${kept})` });
      continue;
    }
    // A count that falls to 0 is more likely a broken source than a real 0.
    if (
      got.value === 0 &&
      typeof old?.value === "number" &&
      old.value !== 0 &&
      !def.allowZero
    ) {
      values[name] = old;
      problem({
        name,
        message: `read 0, down from ${show(old.value)}: kept ${show(old.value)} from ${old.asOf.slice(0, 10)} (set \`allowZero: true\` if 0 is right)`,
      });
      continue;
    }
    totals.read++;
    values[name] = { value: got.value, asOf: got.asOf, source: got.source };
    const was =
      old && !same(old.value, got.value) ? `  (was ${show(old.value)})` : "";
    console.log(
      `  ✓ ${pad(name, 16)}${pad(show(got.value) + was, 28)}${def.from}`,
    );
    const age = ageInDays(got.asOf, now);
    if (age > def.maxAge)
      problem({
        name,
        message: `the newest is from ${got.asOf.slice(0, 10)}, ${age} days ago (maxAge ${def.maxAge}): ${got.source}`,
      });
  }
  for (const p of staleManual(config, now)) problem(p);

  // Shots
  const shots: Record<string, ShotEntry> = {};
  const skipped: Collected["skipped"] = [];
  const keepOld = (name: string) => {
    const old = before?.shots[name];
    if (old) shots[name] = old;
    // Not taken this time: what the last run said about it still holds.
    for (const p of before?.problems ?? [])
      if (p.name === `shot ${name}`) problem(p);
  };
  for (const [name, shot] of Object.entries(config.shots ?? {})) {
    const old = before?.shots[name];
    // A skip comes from the config, so it's listed with --no-shots too.
    if (shot.skip) {
      if (old) shots[name] = old;
      skipped.push({ name, reason: shot.skip });
      totals.skipped++;
      console.log(`  - shot ${pad(name, 14)}skipped: ${shot.skip}`);
      continue;
    }
    if (!shotsWanted) {
      keepOld(name);
      continue;
    }
    if (shot.video && old && !flags.loops) {
      keepOld(name);
      totals.loopsKept++;
      console.log(
        `  = shot ${pad(name, 14)}loop kept from ${old.asOf.slice(0, 10)} (--loops records it again)`,
      );
      continue;
    }
    totals.shots++;
    try {
      const r = await takeShot(id, name, shot, old, publish);
      const size = `${r.entry.width}×${r.entry.height}${r.entry.kind === "video" ? " loop" : ""}`;
      if (r.same) {
        shots[name] = r.entry;
        console.log(`  ✓ shot ${pad(name, 14)}${pad(size, 18)}unchanged`);
        continue;
      }
      totals.newShots++;
      totals.uploaded += r.sent;
      if (publish) shots[name] = r.entry;
      else if (old) shots[name] = old;
      const where = publish
        ? `${r.sent} of ${r.files} files uploaded`
        : `${r.files} files in ${r.savedTo}`;
      console.log(`  ✓ shot ${pad(name, 14)}${pad(size, 18)}${where}`);
    } catch (e) {
      if (old) shots[name] = old;
      const message = (e as Error).message.split("\n")[0];
      problem(
        {
          name: `shot ${name}`,
          message: `${message}${old ? " (kept the last one)" : ""}`,
        },
        `✗ shot ${pad(name, 14)}${message}`,
      );
    }
  }
  // Links
  const links = linksIn(config);
  totals.links += links.length;
  const broken = await brokenLinks(links);
  for (const b of broken)
    problem(
      { name: "link", message: `${b.url} ${b.message}` },
      `✗ link ${b.url} ${b.message}`,
    );
  if (!broken.length) console.log(`  ✓ ${links.length} links answer`);

  // Every value resolves the way the build will resolve it (calc inputs included).
  const after: Collected = {
    refreshedAt: now.toISOString(),
    values,
    shots,
    skipped,
    problems,
  };
  try {
    resolveValues(id, config, after);
  } catch (e) {
    problem(
      { name: "values", message: (e as Error).message },
      `✗ ${(e as Error).message}`,
    );
  }

  if (dryRun) console.log(`  ~ src/data/collected/${id}.json not written`);
  else {
    await writeCollected(id, after);
    totals.written++;
    console.log(`  → wrote src/data/collected/${id}.json`);
  }
  return problems;
}

const report = (id: string, problems: Problem[]) => {
  totals.problems += problems.length;
  if (inActions)
    for (const p of problems)
      console.log(
        `::error title=${id}: ${p.name}::${p.message.replace(/\n/g, " ")}`,
      );
};

try {
  for (const id of targets) {
    try {
      report(id, await refresh(id));
    } catch (e) {
      // One project's failure doesn't stop the others; its file stays as it was.
      totals.crashed++;
      const message = (e as Error).message;
      console.log(`\n✗ ${id}: ${message.split("\n")[0]}`);
      report(id, [{ name: "refresh", message }]);
    }
  }
} finally {
  await closeBrowser();
}

console.log(
  `\n${totals.read} of ${totals.fetched} values read` +
    (shotsWanted
      ? `, ${totals.shots} shots taken (${totals.newShots} new, ${totals.uploaded} files uploaded)` +
        (totals.loopsKept ? `, ${totals.loopsKept} loops kept` : "")
      : "") +
    (totals.skipped ? `, ${totals.skipped} skipped` : "") +
    `, ${totals.links} links checked, ${totals.written} files written, ${totals.problems} problem${totals.problems === 1 ? "" : "s"}.`,
);
if (shotsWanted) console.log(`Raw captures: ${rawDir()}`);

let failed = totals.problems > 0;

// Cleanup: only after a run that could upload, and only when every project got through.
if (publish && shotsWanted && totals.crashed === 0) {
  try {
    const c = await cleanUp(false);
    console.log(
      `R2: ${c.stored} files under portfolio/, ${c.used} in use, ${c.deleted.length} unused for 30 days deleted.`,
    );
    for (const key of c.deleted) console.log(`  - ${key}`);
  } catch (e) {
    console.log(`✗ R2 cleanup: ${(e as Error).message}`);
    if (inActions)
      console.log(`::error title=R2 cleanup::${(e as Error).message}`);
    failed = true;
  }
}

if (shotsWanted && !dryRun && missing.length && process.env.CI) {
  console.error(
    `R2 credentials missing in CI (${missing.join(", ")}): shots weren't uploaded.`,
  );
  failed = true;
}
if (failed) process.exitCode = 1;
