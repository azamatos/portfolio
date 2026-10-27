// Loads the project configs and their collected values the way the site does: the same YAML options as Astro and
// the same zod schemas, so a config that passes here passes the build.

import { readdir, readFile } from "node:fs/promises";
import { parseDocument } from "yaml";
import { z } from "astro/zod";
import {
  collectedSchema,
  projectSchema,
  type Collected,
  type ProjectConfig,
} from "../../src/lib/projects/schema.ts";

export const ROOT = new URL("../../", import.meta.url);
export const CONFIG_DIR = new URL("src/content/projects/", ROOT);
export const COLLECTED_DIR = new URL("src/data/collected/", ROOT);
/** Encoded shots when they aren't uploaded, and the raw captures. Git-ignored. */
export const CACHE_DIR = new URL(".cache/refresh/", ROOT);

/** Astro's YAML options (@astrojs/internal-helpers/yaml): timestamps become Dates, `<<` merge keys work. */
export function parseYaml(source: string): unknown {
  const doc = parseDocument(source, {
    customTags: ["timestamp"],
    merge: true,
    schema: "core",
  });
  if (doc.errors.length > 0) throw doc.errors[0];
  return doc.contents === null ? undefined : doc.toJS();
}

export async function projectIds(): Promise<string[]> {
  const files = await readdir(CONFIG_DIR);
  return files
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.slice(0, -".yaml".length))
    .sort();
}

export async function loadProject(id: string): Promise<ProjectConfig> {
  const file = new URL(`${id}.yaml`, CONFIG_DIR);
  const parsed = projectSchema.safeParse(
    parseYaml(await readFile(file, "utf8")),
  );
  if (!parsed.success)
    throw new Error(
      `src/content/projects/${id}.yaml:\n${z.prettifyError(parsed.error)}`,
    );
  return parsed.data;
}

export async function loadCollected(
  id: string,
): Promise<Collected | undefined> {
  let text: string;
  try {
    text = await readFile(new URL(`${id}.json`, COLLECTED_DIR), "utf8");
  } catch {
    return undefined;
  }
  const parsed = collectedSchema.safeParse(JSON.parse(text));
  if (!parsed.success)
    throw new Error(
      `src/data/collected/${id}.json:\n${z.prettifyError(parsed.error)}`,
    );
  return parsed.data;
}
