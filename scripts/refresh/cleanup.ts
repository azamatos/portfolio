// Deletes media nothing uses any more: objects under portfolio/ in R2 that no collected file references and that
// are older than 30 days. "Collected file" means the working tree's src/data/collected/*.json and the committed ones
// (git HEAD), so a shot replaced in this run stays until the commit that drops it has been the live site for a week.

import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { COLLECTED_DIR, ROOT } from "./config.ts";
import { deleteObject, listObjects, MEDIA_URL } from "./r2.ts";

const PREFIX = "portfolio/";
const MIN_AGE_DAYS = 30;
const DAY = 86_400_000;

/** Every R2 key a collected file points at: each width and format of an image, and each loop file. */
export function keysIn(doc: unknown, keys = new Set<string>()): Set<string> {
  const add = (url: unknown) => {
    if (typeof url === "string" && url.startsWith(`${MEDIA_URL}/`))
      keys.add(url.slice(MEDIA_URL.length + 1));
  };
  if (Array.isArray(doc)) for (const v of doc) keysIn(v, keys);
  else if (doc && typeof doc === "object") {
    const o = doc as Record<string, unknown>;
    if (
      o.kind === "image" &&
      Array.isArray(o.widths) &&
      Array.isArray(o.formats)
    )
      for (const w of o.widths)
        for (const f of o.formats) add(`${String(o.base)}.${w}.${f}`);
    add(o.url);
    for (const v of Object.values(o)) keysIn(v, keys);
  }
  return keys;
}

const git = async (...args: string[]) =>
  (
    await promisify(execFile)("git", args, {
      cwd: new URL(".", ROOT),
      maxBuffer: 16 * 1024 * 1024,
    })
  ).stdout;

/** The collected files' texts: the working tree's, then the committed ones (none outside a git checkout). */
async function collectedTexts(): Promise<string[]> {
  const texts: string[] = [];
  for (const file of await readdir(COLLECTED_DIR))
    if (file.endsWith(".json"))
      texts.push(await readFile(new URL(file, COLLECTED_DIR), "utf8"));
  try {
    const committed = (
      await git("ls-tree", "--name-only", "HEAD", "src/data/collected/")
    )
      .split("\n")
      .filter((f) => f.endsWith(".json"));
    for (const file of committed) texts.push(await git("show", `HEAD:${file}`));
  } catch {
    // Not a git checkout: the working tree's files are all there is.
  }
  return texts;
}

export type Cleanup = { stored: number; used: number; deleted: string[] };

/** Deletes unused objects older than 30 days (with `dryRun`, only lists them). */
export async function cleanUp(dryRun: boolean): Promise<Cleanup> {
  const used = new Set<string>();
  for (const text of await collectedTexts()) keysIn(JSON.parse(text), used);
  const stored = await listObjects(PREFIX);
  // Files in R2 that nothing references means reading the collected files went wrong, not that all are unused.
  if (used.size === 0 && stored.length > 0)
    throw new Error("no collected file references any media; nothing deleted");
  const now = Date.now();
  const unused = stored.filter(
    (o) =>
      !used.has(o.key) && now - o.lastModified.getTime() > MIN_AGE_DAYS * DAY,
  );
  if (!dryRun) for (const o of unused) await deleteObject(o.key);
  return {
    stored: stored.length,
    used: used.size,
    deleted: unused.map((o) => o.key),
  };
}
