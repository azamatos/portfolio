// pnpm data:refresh [project] [--no-shots] [--dry-run]
//
// Reads every project's values from their sources, takes its screenshots and loops, checks ages and links, and
// writes src/data/collected/<id>.json. A value that can't be read keeps its last good entry and goes into
// `problems`; the command then exits with an error, after writing what it could. See README.md, "Project data".

import { parseArgs } from "node:util";
import type { Collected } from "../../src/lib/projects/schema.ts";
import { resolveValues } from "../../src/lib/projects/values.ts";
import { closeBrowser } from "./browser.ts";
import { ageInDays, brokenLinks, linksIn, staleManual } from "./checks.ts";
import { loadCollected, loadProject, projectIds } from "./config.ts";
import { changed, writeCollected } from "./output.ts";
import { missingCredentials } from "./r2.ts";
import { isFetched, readValues } from "./readers/index.ts";
import { rawDir, takeShot, type ShotEntry } from "./shots/index.ts";

const { values: flags, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "no-shots": { type: "boolean", default: false },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (flags.help) {
  console.log(`pnpm data:refresh [project] [--no-shots] [--dry-run]

  project     one id from src/content/projects/ (all of them by default)
  --no-shots  read values and check links, keep the shots as they are
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

const show = (v: number | string) =>
  typeof v === "number" ? v.toLocaleString("en-US") : v;
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
  links: 0,
  problems: 0,
  written: 0,
};

try {
  for (const id of targets) {
    const config = await loadProject(id);
    const before = await loadCollected(id);
    const now = new Date();
    const asOf = now.toISOString();
    const problems: Collected["problems"] = [];
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
        problems.push({ name, message: `${got.message} (${kept})` });
        console.log(`  ✗ ${pad(name, 16)}${got.message} (${kept})`);
        continue;
      }
      totals.read++;
      values[name] = { value: got.value, asOf, source: got.source };
      const was =
        old && old.value !== got.value ? `  (was ${show(old.value)})` : "";
      console.log(
        `  ✓ ${pad(name, 16)}${pad(show(got.value) + was, 28)}${def.from}`,
      );
    }
    for (const p of staleManual(config, now)) {
      problems.push(p);
      console.log(`  ✗ ${pad(p.name, 16)}${p.message}`);
    }

    // Shots
    const shots: Record<string, ShotEntry> = {};
    for (const [name, shot] of Object.entries(config.shots ?? {})) {
      const old = before?.shots[name];
      if (!shotsWanted) {
        if (old) shots[name] = old;
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
        if (publish) shots[name] = r.entry;
        else if (old) shots[name] = old;
        const where = publish
          ? `${r.sent} of ${r.files} files uploaded`
          : `${r.files} files in ${r.savedTo}`;
        console.log(`  ✓ shot ${pad(name, 14)}${pad(size, 18)}${where}`);
      } catch (e) {
        if (old) shots[name] = old;
        const message = (e as Error).message.split("\n")[0];
        problems.push({
          name: `shot ${name}`,
          message: `${message}${old ? " (kept the last one)" : ""}`,
        });
        console.log(`  ✗ shot ${pad(name, 14)}${message}`);
      }
    }

    // Links
    const links = linksIn(config);
    totals.links += links.length;
    const broken = await brokenLinks(links);
    for (const b of broken) {
      problems.push({ name: "link", message: `${b.url} ${b.message}` });
      console.log(`  ✗ link ${b.url} ${b.message}`);
    }
    if (!broken.length) console.log(`  ✓ ${links.length} links answer`);

    // Every value resolves the way the build will resolve it (calc inputs included).
    const after: Collected = { refreshedAt: asOf, values, shots, problems };
    try {
      resolveValues(id, config, after);
    } catch (e) {
      problems.push({ name: "values", message: (e as Error).message });
      console.log(`  ✗ ${(e as Error).message}`);
    }

    totals.problems += problems.length;
    if (inActions)
      for (const p of problems)
        console.log(
          `::error title=${id}: ${p.name}::${p.message.replace(/\n/g, " ")}`,
        );

    if (!changed(before, after))
      console.log(`  = src/data/collected/${id}.json unchanged`);
    else if (dryRun)
      console.log(`  ~ src/data/collected/${id}.json would change`);
    else {
      await writeCollected(id, after);
      totals.written++;
      console.log(`  → wrote src/data/collected/${id}.json`);
    }
  }
} finally {
  await closeBrowser();
}

console.log(
  `\n${totals.read} of ${totals.fetched} values read` +
    (shotsWanted ? `, ${totals.shots} shots (${totals.newShots} new)` : "") +
    `, ${totals.links} links checked, ${totals.written} files written, ${totals.problems} problem${totals.problems === 1 ? "" : "s"}.`,
);
if (shotsWanted) console.log(`Raw captures: ${rawDir()}`);

let failed = totals.problems > 0;
if (shotsWanted && !dryRun && missing.length && process.env.CI) {
  console.error(
    `R2 credentials missing in CI (${missing.join(", ")}): shots weren't uploaded.`,
  );
  failed = true;
}
if (failed) process.exitCode = 1;
