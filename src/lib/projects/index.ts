// The projects, ready for pages: every `{placeholder}` filled, every media ref resolved, sorted by `order`.
//
//   const projects = await getProjects();          // the list, the READMEs, the palette
//   const project = await getProject("visaproof"); // one page
//
// Config: src/content/projects/<id>.yaml (schema.ts). Values: values.ts. Media: media.ts.

import { getCollection } from "astro:content";
import { resolveMedia, type Media } from "./media.ts";
import type { Collected, MediaRef, Part, ProjectConfig } from "./schema.ts";
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
export { formatNumber, numberWord } from "./values.ts";

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

export type ProjectPart = Exclude<Resolved<Part>, { kind: "waffle" }> | Waffle;

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
  /** `/projects/<id>` */
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
  list: Omit<Config["list"], "commits"> & { commits: string };
  readme: Resolved<Config["readme"]>;
  page: Omit<Resolved<Config["page"]>, "numbers" | "sections"> & {
    path: string;
    numbers: Figure[];
    sections: (Omit<Resolved<SectionConfig>, "parts"> & {
      parts: ProjectPart[];
    })[];
  };
  /** Every value by name, with its raw number, date and source. */
  values: Record<string, Value>;
  /** When the refresh command last ran for this project. */
  refreshedAt?: string;
};

export const statusText = (status: Config["status"]) =>
  status === "live" ? "live" : "in development";

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

function resolveWaffle(w: WaffleConfig, ctx: Ctx, path: string): Waffle {
  const counts: Record<string, number> = {};
  for (const [key, c] of Object.entries(w.counts)) {
    const n =
      typeof c === "number" ? c : valueOf(c, ctx, `${path}.counts.${key}`).raw;
    if (typeof n !== "number")
      throw new Error(
        `${at(ctx, `${path}.counts.${key}`)}: ${c} isn't a number`,
      );
    counts[key] = n;
  }
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

function resolveFigure(f: FigureConfig, ctx: Ctx, path: string): Figure {
  const label = interpolate(f.label, ctx.values, at(ctx, `${path}.label`));
  if ("text" in f)
    return {
      label,
      text: interpolate(f.text, ctx.values, at(ctx, `${path}.text`)),
    };
  const before = f.prefix ?? "";
  const after = f.suffix ?? "";
  if (typeof f.value === "number") {
    const count = { to: f.value, decimals: 0, prefix: before, suffix: after };
    return { label, text: before + formatNumber(f.value) + after, count };
  }
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

/** Fills every string and resolves every media ref and waffle, anywhere in the content. */
function resolveDeep(o: unknown, ctx: Ctx, path: string): unknown {
  if (typeof o === "string") return interpolate(o, ctx.values, at(ctx, path));
  if (Array.isArray(o))
    return o.map((v, i) => resolveDeep(v, ctx, `${path}[${i}]`));
  if (o && typeof o === "object") {
    if ("shot" in o || "asset" in o)
      return resolveMedia(o as MediaRef, ctx.id, ctx.collected, at(ctx, path));
    if ("kind" in o && o.kind === "waffle")
      return resolveWaffle(o as WaffleConfig, ctx, path);
    return Object.fromEntries(
      Object.entries(o).map(([k, v]) => [
        k,
        resolveDeep(v, ctx, `${path}.${k}`),
      ]),
    );
  }
  return o;
}

function resolveProject(
  id: string,
  config: Config,
  collected: Collected | undefined,
): Project {
  const values = resolveValues(id, config, collected);
  const ctx: Ctx = { id, values, collected };
  const path = `/projects/${id}`;
  const { numbers, sections, ...page } = config.page;
  const { commits, ...list } = config.list;
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
    list: {
      ...(resolveDeep(list, ctx, "list") as Omit<Config["list"], "commits">),
      commits:
        typeof commits === "number"
          ? formatNumber(commits)
          : interpolate(commits, values, at(ctx, "list.commits")),
    },
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
    },
    values: Object.fromEntries(values),
    refreshedAt: collected?.refreshedAt,
  };
}

/** Every project, resolved and sorted by `order`. Fails the build on anything that doesn't resolve. */
export async function getProjects(): Promise<Project[]> {
  const [configs, collected] = await Promise.all([
    getCollection("projects"),
    getCollection("collected"),
  ]);
  const byId = new Map(collected.map((c) => [c.id, c.data]));
  const projects = configs
    .map((c) => resolveProject(c.id, c.data, byId.get(c.id)))
    .sort((a, b) => a.order - b.order);

  const ids = new Set(projects.map((p) => p.id));
  for (const [i, p] of projects.entries()) {
    if (i > 0 && projects[i - 1].order === p.order)
      throw new Error(
        `${p.id}: order ${p.order} is taken by ${projects[i - 1].id}`,
      );
    if (!ids.has(p.page.next) || p.page.next === p.id)
      throw new Error(
        `${p.id}: page.next "${p.page.next}" isn't another project`,
      );
  }
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
