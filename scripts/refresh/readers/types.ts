import type { ValueConfig } from "../../../src/lib/projects/schema.ts";

/** What a reader found, and where: a URL a person can open to see the same number. */
export type Reading = { value: number | string; source: string };

/** The values the refresh command fetches; `manual` and `calc` aren't fetched. */
export type FetchedConfig = Exclude<ValueConfig, { from: "manual" | "calc" }>;

export type Def<F extends FetchedConfig["from"]> = Extract<
  FetchedConfig,
  { from: F }
>;

/** "13,016 sponsors" → 13016; "96.89" → 96.89. Throws when there's no number. */
export function firstNumber(s: string, what: string): number {
  const m = /-?\d[\d,]*(?:\.\d+)?/.exec(s);
  if (!m) throw new Error(`no number in ${what}: "${s.slice(0, 80)}"`);
  return Number(m[0].replaceAll(",", ""));
}

const cache = new Map<string, Promise<unknown>>();

/** One fetch per key and run, shared by every value that needs it (two values from one CI log, one JSON file). */
export function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load();
    cache.set(key, p);
  }
  return p;
}
