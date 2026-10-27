// The projects, ready for pages: every `{placeholder}` filled, every media ref resolved, sorted by `order`.
//
//   const projects = await getProjects();          // the list, the READMEs, the palette
//   const project = await getProject("visaproof"); // one page
//
// Config: src/content/projects/<id>.yaml (schema.ts). Values: values.ts. Media: media.ts.

import { getCollection } from "astro:content";
import { resolveMedia, type Media } from "./media.ts";
import { heroSource } from "./share.ts";
import type {
  Collected,
  CollectedOg,
  MediaRef,
  Part,
  ProjectConfig,
} from "./schema.ts";
import {
  formatNumber,
  interpolate,
  numberWord,
  resolveValues,
  squaresOf,
  type Value,
} from "./values.ts";

export type { Media } from "./media.ts";
export { imageSrcset, imageUrl } from "./media.ts";
export type { Value } from "./values.ts";
export { formatDay, formatNumber, numberWord } from "./values.ts";

/** Config types with every media ref resolved. Strings stay strings, now with their placeholders filled. */
type Resolved<T> = T extends MediaRef
  ? Media
  : T extends (infer U)[]
    ? Resolved<U>[]
    : T extends object
      ? { [K in keyof T]: Resolved<T[K]> }
      : T;

type Config = ProjectConfig;
type WaffleConfig = Extract<Part, { kind: "waffle" }>;
type BarsConfig = Extract<Part, { kind: "bars" }>;
type TableConfig = Extract<Part, { kind: "table" }>;
type SectionConfig = Config["page"]["sections"][number];
type FigureConfig = Config["page"]["numbers"][number];

/** 100 squares: raw counts by key, the squares each gets (they add up to 100), and the legend with percentages. */
export type Waffle = {
  kind: "waffle";
  /** The `role="img"` name: the config's label plus each share's squares and words. */
  label: string;
  note: string;
  total: number;
  counts: Record<string, number>;
  squares: Record<string, number>;
  legend: {
    key: string;
    swatch: string;
    strong: string;
    text: string;
    squares: number;
    count: number;
  }[];
};

/** Bars with their values printed (`value`) and each bar's CSS width from the raw number ("33%"). */
export type Bars = Omit<Resolved<BarsConfig>, "groups"> & {
  groups: {
    who: string;
    rows: { metric: string; value: string; width: string; color: string }[];
  }[];
};

/** A table with its rows, typed in or from a table value. */
export type Table = Omit<Resolved<TableConfig>, "rows"> & { rows: string[][] };

export type ProjectPart =
  | Exclude<Resolved<Part>, { kind: "waffle" | "bars" | "table" }>
  | Waffle
  | Bars
  | Table;

/**
 * A big number on a project page. `text` is the final form (no JavaScript, reduced motion); with `count`, the page
 * counts up to `count.to`, printing it with `formatNumber(n, decimals)` between `prefix` and `suffix`.
 */
export type Figure = {
  label: string;
  text: string;
  count?: { to: number; decimals: number; prefix: string; suffix: string };
};

export type Project = {
  id: string;
  /** `/projects/<id>/`: with the slash, the page's address on Cloudflare Pages and in the sitemap (no redirect). */
  path: string;
  order: number;
  name: string;
  status: Config["status"];
  /** The status in words: "live" or "in development". */
  statusText: string;
  site: string;
  /** `owner/name` and its URL on GitHub. */
  repo: string;
  repoUrl: string;
  accent: Config["accent"];
  /** The palette's `cd` description, without the status. */
  palette: string;
  list: Resolved<Config["list"]>;
  readme: Resolved<Config["readme"]>;
  page: Omit<Resolved<Config["page"]>, "numbers" | "sections"> & {
    path: string;
    numbers: Figure[];
    sections: (Omit<Resolved<SectionConfig>, "parts"> & {
      parts: ProjectPart[];
    })[];
    /** The id of the project the "next project" card links to: the next by `order`, the first after the last. */
    next: string;
  };
  /** Every value by name, with its raw number, date and source; `checked` is the last refresh's day. */
  values: Record<string, Value>;
  /** When the refresh last checked every value (ISO); `values.checked.text` prints it as "27 Oct". */
  refreshedAt?: string;
  /** The share card the refresh made for the hero in use (see share.ts); none until it has. */
  og?: CollectedOg;
};

export const statusText = (status: Config["status"]) =>
  status === "live" ? "live" : "in development";

/**
 * A project's colours as an inline style, for an element with `data-project`: each one per theme (`--acc-dark`,
 * `--acc-light`, …), and tokens.css picks --acc, --acc2 and --on-acc for the theme on show.
 */
export function accentStyle(accent: Config["accent"]): string {
  const { dark, light, acc2, onAcc } = accent;
  const colours = { acc: { dark, light }, acc2, "on-acc": onAcc };
  return Object.entries(colours)
    .map(
      ([name, c]) => `--${name}-dark: ${c.dark}; --${name}-light: ${c.light}`,
    )
    .join("; ");
}

type Ctx = {
  id: string;
  values: Map<string, Value>;
  collected: Collected | undefined;
};

const at = (ctx: Ctx, path: string) => `${ctx.id}: ${path}`;

/** The value a one-placeholder field like "{roles}" names. */
function valueOf(field: string, ctx: Ctx, path: string): Value {
  const name = field.slice(1, -1);
  const v = ctx.values.get(name);
  if (!v) throw new Error(`${at(ctx, path)}: unknown placeholder ${field}`);
  return v;
}

/** The number a one-placeholder field names. */
function numberOf(field: string, ctx: Ctx, path: string): number {
  const n = valueOf(field, ctx, path).raw;
  if (typeof n !== "number")
    throw new Error(`${at(ctx, path)}: ${field} isn't a number`);
  return n;
}

function resolveWaffle(w: WaffleConfig, ctx: Ctx, path: string): Waffle {
  const counts: Record<string, number> = {};
  for (const [key, c] of Object.entries(w.counts))
    counts[key] = numberOf(c, ctx, `${path}.counts.${key}`);
  const shares = squaresOf(counts);
  const legend = w.legend.map((l, i) => ({
    key: l.key,
    swatch: l.swatch,
    strong: shares[l.key].percent,
    text: interpolate(l.text, ctx.values, at(ctx, `${path}.legend[${i}].text`)),
    squares: shares[l.key].squares,
    count: counts[l.key],
  }));
  const said = w.legend
    .map((l) => `${shares[l.key].squares} ${l.alt}`)
    .join(", ");
  return {
    kind: "waffle",
    label: `${interpolate(w.label, ctx.values, at(ctx, `${path}.label`))}: ${said}`,
    note: interpolate(w.note, ctx.values, at(ctx, `${path}.note`)),
    total: Object.values(counts).reduce((a, b) => a + b, 0),
    counts,
    squares: Object.fromEntries(
      Object.entries(shares).map(([k, s]) => [k, s.squares]),
    ),
    legend,
  };
}

function resolveBars(b: BarsConfig, ctx: Ctx, path: string): Bars {
  const fill = (s: string, where: string) =>
    interpolate(s, ctx.values, at(ctx, `${path}.${where}`));
  return {
    kind: "bars",
    title: fill(b.title, "title"),
    text: fill(b.text, "text"),
    groups: b.groups.map((g, i) => ({
      who: fill(g.who, `groups[${i}].who`),
      rows: g.rows.map((r, j) => {
        const where = `${path}.groups[${i}].rows[${j}].value`;
        const n = numberOf(r.value, ctx, where);
        if (n < 0 || n > 100)
          throw new Error(`${at(ctx, where)}: ${n} isn't from 0 to 100`);
        return {
          metric: fill(r.metric, `groups[${i}].rows[${j}].metric`),
          value: valueOf(r.value, ctx, where).text,
          width: `${Number(n.toFixed(2))}%`,
          color: r.color,
        };
      }),
    })),
  };
}

function resolveTable(t: TableConfig, ctx: Ctx, path: string): Table {
  const { rows, ...rest } = t;
  // Field by field: the object itself would come back here, being a table.
  const resolved = Object.fromEntries(
    Object.entries(rest).map(([k, v]) => [
      k,
      resolveDeep(v, ctx, `${path}.${k}`),
    ]),
  ) as Omit<Table, "rows">;
  if (typeof rows !== "string")
    return {
      ...resolved,
      rows: resolveDeep(rows, ctx, `${path}.rows`) as string[][],
    };
  const v = valueOf(rows, ctx, `${path}.rows`);
  if (!v.rows)
    throw new Error(`${at(ctx, `${path}.rows`)}: ${rows} isn't a table value`);
  if (v.rows.length === 0)
    throw new Error(`${at(ctx, `${path}.rows`)}: ${rows} has no rows`);
  for (const [i, r] of v.rows.entries())
    if (r.length !== t.head.length)
      throw new Error(
        `${at(ctx, `${path}.rows`)}: row ${i + 1} of ${rows} has ${r.length} cells, \`head\` has ${t.head.length}`,
      );
  return { ...resolved, rows: v.rows };
}

function resolveFigure(f: FigureConfig, ctx: Ctx, path: string): Figure {
  const label = interpolate(f.label, ctx.values, at(ctx, `${path}.label`));
  if ("text" in f)
    return {
      label,
      text: interpolate(f.text, ctx.values, at(ctx, `${path}.text`)),
    };
  const before = f.prefix ?? "";
  const after = f.suffix ?? "";
  const v = valueOf(f.value, ctx, `${path}.value`);
  if (v.number === undefined) return { label, text: before + v.text + after };
  const count = {
    to: v.number,
    decimals: v.decimals,
    prefix: before + v.prefix,
    suffix: v.suffix + after,
  };
  return {
    label,
    text: count.prefix + formatNumber(count.to, count.decimals) + count.suffix,
    count,
  };
}

/** Fills every string and resolves every media ref, waffle, bars and table, anywhere in the content. */
function resolveDeep(o: unknown, ctx: Ctx, path: string): unknown {
  if (typeof o === "string") return interpolate(o, ctx.values, at(ctx, path));
  if (Array.isArray(o))
    return o.map((v, i) => resolveDeep(v, ctx, `${path}[${i}]`));
  if (o && typeof o === "object") {
    if ("shot" in o || "asset" in o)
      return resolveMedia(o as MediaRef, ctx.id, ctx.collected, at(ctx, path));
    if ("kind" in o && o.kind === "waffle")
      return resolveWaffle(o as WaffleConfig, ctx, path);
    if ("kind" in o && o.kind === "bars")
      return resolveBars(o as BarsConfig, ctx, path);
    if ("kind" in o && o.kind === "table")
      return resolveTable(o as TableConfig, ctx, path);
    return Object.fromEntries(
      Object.entries(o).map(([k, v]) => [
        k,
        resolveDeep(v, ctx, `${path}.${k}`),
      ]),
    );
  }
  return o;
}

/** The collected share image, if it shows the hero the page shows now. */
function ogOf(config: Config, collected: Collected | undefined) {
  const og = collected?.og;
  return og?.from === heroSource(config.page.hero.image, collected?.shots)
    ? og
    : undefined;
}

function resolveProject(
  id: string,
  config: Config,
  collected: Collected | undefined,
  next: string,
): Project {
  const values = resolveValues(id, config, collected);
  const ctx: Ctx = { id, values, collected };
  const path = `/projects/${id}/`;
  const { numbers, sections, ...page } = config.page;
  return {
    id,
    path,
    order: config.order,
    name: config.name,
    status: config.status,
    statusText: statusText(config.status),
    site: config.site,
    repo: config.repo,
    repoUrl: `https://github.com/${config.repo}`,
    accent: config.accent,
    palette: config.palette,
    list: resolveDeep(config.list, ctx, "list") as Project["list"],
    readme: resolveDeep(config.readme, ctx, "readme") as Project["readme"],
    page: {
      ...(resolveDeep(page, ctx, "page") as Omit<
        Resolved<Config["page"]>,
        "numbers" | "sections"
      >),
      path,
      numbers: numbers.map((f, i) =>
        resolveFigure(f, ctx, `page.numbers[${i}]`),
      ),
      sections: resolveDeep(
        sections,
        ctx,
        "page.sections",
      ) as Project["page"]["sections"],
      next,
    },
    values: Object.fromEntries(values),
    refreshedAt: collected?.refreshedAt,
    og: ogOf(config, collected),
  };
}

/** Every project, resolved and sorted by `order`. Fails the build on anything that doesn't resolve. */
export async function getProjects(): Promise<Project[]> {
  const [configs, collected] = await Promise.all([
    getCollection("projects"),
    getCollection("collected"),
  ]);
  const byId = new Map(collected.map((c) => [c.id, c.data]));
  const sorted = [...configs].sort((a, b) => a.data.order - b.data.order);
  for (const [i, c] of sorted.entries())
    if (i > 0 && sorted[i - 1].data.order === c.data.order)
      throw new Error(
        `${c.id}: order ${c.data.order} is taken by ${sorted[i - 1].id}`,
      );
  const projects = sorted.map((c, i) =>
    resolveProject(
      c.id,
      c.data,
      byId.get(c.id),
      sorted[(i + 1) % sorted.length].id,
    ),
  );

  const ids = new Set(projects.map((p) => p.id));
  for (const id of byId.keys())
    if (!ids.has(id))
      throw new Error(`src/data/collected/${id}.json belongs to no project`);
  return projects;
}

/** One project by id; unknown ids fail. */
export async function getProject(id: string): Promise<Project> {
  const project = (await getProjects()).find((p) => p.id === id);
  if (!project) throw new Error(`no project "${id}"`);
  return project;
}

/** The Projects section's heading, its subtitle counted from the statuses, and the desktop hint. */
export async function projectsIntro() {
  const projects = await getProjects();
  const live = projects.filter((p) => p.status === "live").length;
  const building = projects.length - live;
  const said = [
    live && `${numberWord(live)} live`,
    building && `${numberWord(building)} in development`,
  ].filter(Boolean);
  return {
    title: "Projects",
    subtitle: `Built and run by me: ${said.join(", ")}.`,
    hint: "pick a row to read its README",
  };
}
