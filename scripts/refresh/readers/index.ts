// Reads every fetched value of one project. The GitHub query runs first (it also gives the default branch the CI
// reader needs); the rest run side by side, except Lighthouse runs, which go one at a time.

import type { ProjectConfig } from "../../../src/lib/projects/schema.ts";
import { readCi } from "./ci.ts";
import { readGithub } from "./github.ts";
import { readMeasure } from "./measure.ts";
import type { Def, FetchedConfig, Reading } from "./types.ts";
import { readJson, readPage } from "./web.ts";

export type { Reading } from "./types.ts";

export const isFetched = (def: { from: string }): def is FetchedConfig =>
  def.from !== "manual" && def.from !== "calc";

/** Each fetched value's reading, or the error that stopped it. */
export async function readValues(
  config: ProjectConfig,
): Promise<Map<string, Reading | Error>> {
  const defs = Object.entries(config.values ?? {}).filter(
    (e): e is [string, FetchedConfig] => isFetched(e[1]),
  );
  const results = new Map<string, Reading | Error>();
  const of = <F extends FetchedConfig["from"]>(from: F) =>
    defs.filter((e): e is [string, Def<F>] => e[1].from === from);

  let branch: string | Error = new Error("no GitHub values");
  const github = of("github");
  const ci = of("ci");
  if (github.length || ci.length) {
    try {
      const got = await readGithub(config.repo, github);
      branch = got.branch;
      for (const [name, r] of got.readings) results.set(name, r);
    } catch (e) {
      branch = e as Error;
      for (const [name] of github) results.set(name, e as Error);
    }
  }

  const settle = async (name: string, read: () => Promise<Reading>) => {
    try {
      results.set(name, await read());
    } catch (e) {
      results.set(name, e as Error);
    }
  };

  await Promise.all([
    ...ci.map(([name, def]) =>
      settle(name, async () => {
        if (branch instanceof Error)
          throw new Error(`no default branch: ${branch.message}`);
        return readCi(config.repo, branch, def);
      }),
    ),
    ...of("json").map(([name, def]) =>
      settle(name, () =>
        readJson(def, def.url ?? config.sources![def.source!]),
      ),
    ),
    ...of("page").map(([name, def]) => settle(name, () => readPage(def))),
  ]);
  for (const [name, def] of of("measure"))
    await settle(name, () => readMeasure(def));
  return results;
}
