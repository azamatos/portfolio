// Writes src/data/collected/<id>.json: keys in the config's order, formatted as Prettier would, and only when
// something besides the dates changed, so a week with nothing new makes no commit.

import { writeFile } from "node:fs/promises";
import { format } from "prettier";
import {
  collectedSchema,
  type Collected,
} from "../../src/lib/projects/schema.ts";
import { COLLECTED_DIR } from "./config.ts";

type Entry = Collected["values"][string];
type Shot = Collected["shots"][string];

/** A collected file with its keys in a fixed order. */
export function ordered(c: Collected): Collected {
  const value = (v: Entry): Entry => ({
    value: v.value,
    asOf: v.asOf,
    source: v.source,
  });
  const image = (s: Extract<Shot, { kind: "image" }>) => ({
    kind: s.kind,
    width: s.width,
    height: s.height,
    base: s.base,
    widths: s.widths,
    formats: s.formats,
    asOf: s.asOf,
    source: s.source,
  });
  const shot = (s: Shot): Shot =>
    s.kind === "image"
      ? image(s)
      : {
          kind: s.kind,
          width: s.width,
          height: s.height,
          poster: image(s.poster),
          sources: s.sources.map((x) => ({ type: x.type, url: x.url })),
          asOf: s.asOf,
          source: s.source,
        };
  return {
    refreshedAt: c.refreshedAt,
    values: Object.fromEntries(
      Object.entries(c.values).map(([k, v]) => [k, value(v)]),
    ),
    shots: Object.fromEntries(
      Object.entries(c.shots).map(([k, s]) => [k, shot(s)]),
    ),
    problems: c.problems.map((p) => ({ name: p.name, message: p.message })),
  };
}

/** The file without its dates: what decides whether it's written. */
function withoutDates(c: Collected | undefined): string {
  if (!c) return "";
  return JSON.stringify(ordered(c), (key, v) =>
    key === "asOf" || key === "refreshedAt" ? undefined : v,
  );
}

export const changed = (before: Collected | undefined, after: Collected) =>
  withoutDates(before) !== withoutDates(after);

export async function writeCollected(
  id: string,
  data: Collected,
): Promise<void> {
  const valid = collectedSchema.parse(data);
  const text = await format(JSON.stringify(ordered(valid)), { parser: "json" });
  await writeFile(new URL(`${id}.json`, COLLECTED_DIR), text);
}
