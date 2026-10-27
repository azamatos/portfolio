// Values: from config (manual, calc) or the collected file, formatted for text. Plain TypeScript, no Astro imports,
// so the refresh command can format and check the same way the site does.

import { evalExpr } from "./expr.ts";
import {
  PLACEHOLDER,
  type Collected,
  type ProjectConfig,
  type ValueConfig,
  type ValueFormat,
} from "./schema.ts";

/** A value ready for text: `text` goes into sentences; `number` and the rest let a figure count up to it. */
export type Value = {
  name: string;
  from: ValueConfig["from"];
  /** As read or computed, before formatting. */
  raw: number | string;
  /** As printed: "14,959", "1,900+", "96.9 KB". */
  text: string;
  /** For numbers: the value after `floor` and rounding, which `text` shows. */
  number?: number;
  decimals: number;
  /** What goes before and after the number in `text` (with "+" for `plus`). */
  prefix: string;
  suffix: string;
  means: string;
  /** When it was read, checked or computed (ISO), and where. Missing for calc. */
  asOf?: string;
  source?: string;
};

const formatters = new Map<number, Intl.NumberFormat>();

/** A number with comma thousands separators and fixed decimals: 14959 → "14,959". */
export function formatNumber(n: number, decimals = 0): string {
  let f = formatters.get(decimals);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(decimals, f);
  }
  return f.format(n);
}

/** Applies a value's format: floor, rounding, prefix, "+" and suffix. */
export function formatValue(raw: number | string, format: ValueFormat = {}) {
  const decimals = format.decimals ?? 0;
  const prefix = format.prefix ?? "";
  const suffix = (format.plus ? "+" : "") + (format.suffix ?? "");
  if (typeof raw === "string")
    return { text: prefix + raw + suffix, decimals, prefix, suffix };
  // 1e-9 keeps 1100 / 100 from flooring to 10.999…
  const floored = format.floor
    ? Math.floor(raw / format.floor + 1e-9) * format.floor
    : raw;
  const number = Number(floored.toFixed(decimals));
  return {
    text: prefix + formatNumber(number, decimals) + suffix,
    number,
    decimals,
    prefix,
    suffix,
  };
}

/** Numbers as words for copy, up to twelve: 3 → "three". */
export function numberWord(n: number): string {
  const words = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
  ];
  return words[n] ?? formatNumber(n);
}

/**
 * Every value of one project, by name. Manual values come from the config, calc values are computed here, and the
 * rest come from the collected file; a value that isn't collected yet fails with what to run.
 */
export function resolveValues(
  id: string,
  config: ProjectConfig,
  collected: Collected | undefined,
): Map<string, Value> {
  const defs = config.values ?? {};
  const out = new Map<string, Value>();

  const get = (name: string, chain: string[] = []): Value => {
    const done = out.get(name);
    if (done) return done;
    const def = defs[name];
    if (!def)
      throw new Error(
        `${id}: unknown value "${name}"${chain.length ? ` (used by ${chain.at(-1)})` : ""}`,
      );

    let raw: number | string;
    let asOf: string | undefined;
    let source: string | undefined;
    if (def.from === "manual") {
      raw = def.value;
      asOf = def.checked;
      source = def.sourceUrl;
    } else if (def.from === "calc") {
      raw = evalExpr(def.expr, (used) => {
        const v = get(used, [...chain, name]);
        if (typeof v.raw !== "number")
          throw new Error(
            `${id}: value "${name}" does math with "${used}", which isn't a number ("${v.raw}")`,
          );
        return v.raw;
      });
    } else {
      const got = collected?.values[name];
      if (!got)
        throw new Error(
          `${id}: value "${name}" isn't in src/data/collected/${id}.json yet. Run \`pnpm data:refresh ${id}\`.`,
        );
      ({ value: raw, asOf, source } = got);
    }

    const value: Value = {
      name,
      from: def.from,
      raw,
      ...formatValue(raw, def.format),
      means: def.means,
      asOf,
      source,
    };
    out.set(name, value);
    return value;
  };

  for (const name of Object.keys(defs)) get(name);
  return out;
}

/** Fills `{name}` placeholders with formatted values. `where` names the field for the error. */
export function interpolate(
  s: string,
  values: Map<string, Value>,
  where: string,
): string {
  return s.replace(PLACEHOLDER, (_, name: string) => {
    const v = values.get(name);
    if (!v) throw new Error(`${where}: unknown placeholder {${name}}`);
    return v.text;
  });
}

/**
 * Shares of a whole as 100 squares: the largest remainders get the leftover squares, so they always add up to 100.
 * Percentages under 10 keep one decimal ("2.5%"), the rest none ("78%").
 */
export function squaresOf(
  counts: Record<string, number>,
): Record<string, { squares: number; percent: string }> {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total <= 0) throw new Error("the counts add up to nothing");
  const rows = Object.entries(counts).map(([key, n]) => {
    const exact = (n / total) * 100;
    return { key, exact, squares: Math.floor(exact) };
  });
  let left = 100 - rows.reduce((a, r) => a + r.squares, 0);
  for (const r of [...rows].sort(
    (a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)),
  )) {
    if (left-- <= 0) break;
    r.squares++;
  }
  return Object.fromEntries(
    rows.map((r) => [
      r.key,
      {
        squares: r.squares,
        percent: `${formatNumber(r.exact, r.exact < 10 ? 1 : 0)}%`,
      },
    ]),
  );
}
