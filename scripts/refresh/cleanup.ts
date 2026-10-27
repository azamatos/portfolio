// Deletes media nothing uses any more: objects under portfolio/ in R2 that are older than 30 days and that no
// collected file references. "Collected file" means the working tree's src/data/collected/*.json, HEAD's and
// origin/main's, and every version committed in the last 30 days: a deploy of any of them may still be live (a
// preview, a rollback), and a run on another branch may have files main doesn't. It needs the whole history, so a
// shallow clone or a missing origin/main stops it, and the refresh runs it only in the weekly job on main.

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

/**
 * The texts of every collected file whose media must stay: the working tree's, then HEAD's, origin/main's and each
 * version committed in the last 30 days.
 */
async function collectedTexts(): Promise<string[]> {
  const texts: string[] = [];
  for (const file of await readdir(COLLECTED_DIR))
    if (file.endsWith(".json"))
      texts.push(await readFile(new URL(file, COLLECTED_DIR), "utf8"));
  if ((await git("rev-parse", "--is-shallow-repository")).trim() !== "false")
    throw new Error(
      "a shallow clone can't list the last 30 days' collected files (check out with fetch-depth: 0); nothing deleted",
    );
  try {
    await git("rev-parse", "--verify", "--quiet", "origin/main");
  } catch {
    throw new Error(
      "no origin/main to keep the live files of; nothing deleted",
    );
  }
  const recent = await git(
    "rev-list",
    `--since=${MIN_AGE_DAYS}.days`,
    "HEAD",
    "origin/main",
    "--",
    "src/data/collected",
  );
  const commits = new Set(["HEAD", "origin/main", ...recent.split("\n")]);
  commits.delete("");
  for (const commit of commits) {
    const files = (
      await git("ls-tree", "--name-only", commit, "src/data/collected/")
    )
      .split("\n")
      .filter((f) => f.endsWith(".json"));
    for (const file of files)
      texts.push(await git("show", `${commit}:${file}`));
  }
  return texts;
}

export type Cleanup = {
  stored: number;
  used: number;
  /** The collected file versions read: the working tree's and those of the commits kept. */
  versions: number;
  deleted: string[];
};

/** Deletes unused objects older than 30 days (with `dryRun`, only lists them). */
export async function cleanUp(dryRun: boolean): Promise<Cleanup> {
  const used = new Set<string>();
  const texts = await collectedTexts();
  for (const text of texts) keysIn(JSON.parse(text), used);
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
    versions: texts.length,
    deleted: unused.map((o) => o.key),
  };
}
