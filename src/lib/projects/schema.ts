// The shape of a project's config (src/content/projects/<id>.yaml) and of its collected values
// (src/data/collected/<id>.json). A typo or a missing field fails `astro check` and `astro build`.
//
// Plain TypeScript on zod, with no Astro runtime imports, so a Node script (the refresh command) can validate the
// same files: `astro/zod` is zod itself. Relative imports carry their `.ts` extension for the same reason.

import { z } from "astro/zod";
import { exprNames } from "./expr.ts";

// ── Small pieces ────────────────────────────────────────────────────────────────────────────────────────────────

const text = z.string().trim().min(1);
const url = z.url({ protocol: /^https?$/ });
const hex = z.string().regex(/^#[0-9a-f]{6}$/i, "a colour like #76beff");
const cssLength = z
  .string()
  .regex(/^(\d+(\.\d+)?(px|%|rem)|0)$/, "a CSS length like 320px or 100%");

/** A day, `2026-10-27`. YAML may hand it over as a Date (Astro parses timestamps), so both are accepted. */
const day = z.preprocess(
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.iso.date(),
);
const isoTime = z.iso.datetime({ offset: true });

/** `{name}` in any text is filled from the value of that name. */
export const PLACEHOLDER = /\{([a-z][A-Za-z0-9]*)\}/g;
const VALUE_NAME = /^[a-z][A-Za-z0-9]*$/;
const SHOT_NAME = /^[a-z][a-z0-9-]*$/;
const SOURCE_NAME = /^[a-z][A-Za-z0-9]*$/;
const PROJECT_ID = /^[a-z][a-z0-9-]*$/;

/** A field that holds exactly one placeholder, like `"{commits}"`. */
const onePlaceholder = z
  .string()
  .regex(/^\{[a-z][A-Za-z0-9]*\}$/, 'one placeholder, like "{roles}"');

// ── Media ───────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * An image slot. `{ shot }` names a live screenshot from `shots` (collected into R2 by the refresh command);
 * `{ asset }` is a file in src/assets/projects/, with `design: true` when it's a mockup rather than the real site.
 */
export const mediaRefSchema = z.union([
  z.strictObject({ shot: z.string().regex(SHOT_NAME) }),
  z.strictObject({
    asset: z
      .string()
      .regex(
        /^[a-z0-9-]+\.(webp|png|jpe?g|avif)$/,
        "a file name in src/assets/projects/",
      ),
    design: z.boolean().optional(),
  }),
]);

// ── Values: where each number comes from ─────────────────────────────────────────────────────────────────────

/** How a number prints. Numbers always get comma thousands separators ("14,959"). */
export const formatSchema = z.strictObject({
  /** Digits after the point; 0 by default. */
  decimals: z.int().min(0).max(3).optional(),
  /** Round down to a multiple of this: 1,908 with `floor: 100` prints 1,900. */
  floor: z.number().positive().optional(),
  /** A "+" right after the number (before `suffix`), for floored counts: "1,900+". */
  plus: z.literal(true).optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
});

/** Every value says what exactly it counts, in one plain line. */
const means = text;
/** Days since a value was read (or `checked`, for manual ones) before the refresh command reports it as stale. */
const maxAge = z.int().positive();
const format = formatSchema.optional();

const regexWithOneGroup = z.string().superRefine((p, ctx) => {
  try {
    const groups = new RegExp(`${p}|`).exec("")!.length - 1;
    if (groups !== 1)
      ctx.addIssue({
        code: "custom",
        message: `needs exactly one capture group, has ${groups}`,
      });
  } catch (e) {
    ctx.addIssue({
      code: "custom",
      message: `not a valid regex: ${(e as Error).message}`,
    });
  }
});

const github = z.discriminatedUnion("get", [
  /** Commits on the default branch. */
  z.strictObject({
    from: z.literal("github"),
    get: z.literal("commits"),
    means,
    maxAge,
    format,
  }),
  /** The date of the latest commit on the default branch. */
  z.strictObject({
    from: z.literal("github"),
    get: z.literal("lastCommit"),
    means,
    maxAge,
    format,
  }),
  /**
   * A dependency's version: from `file` (package.json by default; a pnpm-workspace.yaml reads its catalog), range
   * characters dropped, cut to `parts` numbers (1 → "19", 2 → "3.5", 3 → "1.7.3").
   */
  z.strictObject({
    from: z.literal("github"),
    get: z.literal("version"),
    package: text,
    file: text.optional(),
    parts: z.int().min(1).max(3).default(1),
    means,
    maxAge,
    format,
  }),
  /** Files in the repository matching `path`: a directory, or a glob like `docs/decisions/[0-9][0-9][0-9][0-9]-*.md`. */
  z.strictObject({
    from: z.literal("github"),
    get: z.literal("fileCount"),
    path: text,
    means,
    maxAge,
    format,
  }),
]);

/**
 * A number from the log of the latest successful run of `workflow` on the default branch: the first match of
 * `pattern`'s capture group, or with `sum` every match added up. `job` narrows it to the job of that name. The log
 * is read with its timestamps and colour codes stripped, and the pattern runs with the `g` and `m` flags, so `^`
 * is a line start and `\s+` can cross lines.
 */
const ci = z.strictObject({
  from: z.literal("ci"),
  workflow: z
    .string()
    .regex(/^[\w.-]+\.ya?ml$/, "a workflow file name, like ci.yml"),
  job: text.optional(),
  pattern: regexWithOneGroup,
  sum: z.literal(true).optional(),
  means,
  maxAge,
  format,
});

/**
 * A number from a JSON document at `url` (or a named `source`). `path` reads one field; `count` counts an array (or
 * an object's values), with `distinct` counting different values of one field instead. Paths are dots, and `.` is
 * the document itself; a segment `k=v` picks the first array item whose `k` is `v`, so
 * `parts.key=roles.rows.k=Countries.v` works. A string found at `path` gives its first number ("13,016 sponsors"
 * → 13016).
 */
const json = z
  .strictObject({
    from: z.literal("json"),
    source: z.string().regex(SOURCE_NAME).optional(),
    url: url.optional(),
    path: text.optional(),
    count: z.string().optional(),
    distinct: text.optional(),
    means,
    maxAge,
    format,
  })
  .refine(
    (v) => (v.source === undefined) !== (v.url === undefined),
    "needs either `source` or `url`",
  )
  .refine(
    (v) => (v.path === undefined) !== (v.count === undefined),
    "needs either `path` or `count`",
  )
  .refine(
    (v) => v.distinct === undefined || v.count !== undefined,
    "`distinct` goes with `count`",
  );

/** A number from a live page's HTML: the capture group of `pattern`. The last resort. */
const page = z.strictObject({
  from: z.literal("page"),
  url,
  pattern: regexWithOneGroup,
  means,
  maxAge,
  format,
});

/** Measured on a live URL: the JavaScript it loads (bytes, compressed), or its Lighthouse performance score. */
const measure = z.strictObject({
  from: z.literal("measure"),
  url,
  metric: z.enum(["jsBytes", "lighthouse"]),
  means,
  maxAge,
  format,
});

/**
 * Typed in by hand: where it was read (`sourceUrl`) and when (`checked`). Without `maxAge` it's a dated fact that
 * doesn't go stale (a first-sweep count); with it, the refresh command asks for a recheck after that many days.
 */
const manual = z.strictObject({
  from: z.literal("manual"),
  value: z.union([z.number(), text]),
  checked: day,
  sourceUrl: url.optional(),
  means,
  maxAge: maxAge.optional(),
  format,
});

/** Computed at build time from other values: names, numbers, + - * / and parentheses. */
const calc = z.strictObject({
  from: z.literal("calc"),
  expr: z
    .string()
    .regex(
      /^[A-Za-z0-9_.+\-*/()\s]+$/,
      "names, numbers, + - * / and parentheses only",
    ),
  means,
  format,
});

export const valueSchema = z.discriminatedUnion("from", [
  github,
  ci,
  json,
  page,
  measure,
  manual,
  calc,
]);

// ── Shots: screenshots and loops the refresh command records ────────────────────────────────────────────────

/** One step before the capture, in order. Selectors are Playwright's. */
export const shotStepSchema = z.union([
  z.strictObject({ goto: url }),
  z.strictObject({ click: text }),
  z.strictObject({ fill: text, value: z.string() }),
  /** A key, like "Enter" or "Escape". */
  z.strictObject({ press: text }),
  /** Milliseconds. */
  z.strictObject({ wait: z.int().positive().max(30_000) }),
  z.strictObject({ waitFor: text }),
  /** Pixels down, or a selector to scroll into view. */
  z.strictObject({ scroll: z.union([z.int(), text]) }),
  /** Types the text of one element into another: Ýeral's sign-in shows its code on the screen. */
  z.strictObject({ copy: text, into: text }),
]);

export const shotSchema = z.strictObject({
  url,
  /** desktop: 1440 × 900; phone: 390 × 844. */
  device: z.enum(["desktop", "phone"]),
  theme: z.enum(["dark", "light"]).optional(),
  /** The whole page, not just the first screen (Visaproof's panning README image). */
  full: z.literal(true).optional(),
  /** A muted loop instead of a still, with a poster frame. */
  video: z.strictObject({ seconds: z.number().positive().max(60) }).optional(),
  steps: z.array(shotStepSchema).min(1).optional(),
});

// ── Content: the export's structure, field for field ──────────────────────────────────────────────────────────

const link = z.strictObject({ label: text, href: url });

const stat = z.strictObject({ value: text, label: text, short: text });

const readmeSchema = z
  .strictObject({
    kind: text,
    host: text,
    image: mediaRefSchema,
    phoneImage: mediaRefSchema,
    alt: text,
    /** The image is a full page that pans from top to bottom. */
    panImage: z.boolean(),
    headline: text,
    description: text,
    short: text,
    /** For a project in development: the steps, and the index of the current one. */
    progress: z
      .strictObject({ steps: z.array(text).min(2), current: z.int().min(0) })
      .optional(),
    tech: z.array(text).min(1),
    stats: z.array(stat).length(3),
    secondaryLink: link,
  })
  .refine((r) => !r.progress || r.progress.current < r.progress.steps.length, {
    message: "`progress.current` is past the last step",
    path: ["progress", "current"],
  });

const meta = z.union([
  z.strictObject({ label: text, text }),
  z.strictObject({ label: text, links: z.array(link).min(1) }),
]);

const hero = z.strictObject({
  host: text,
  image: mediaRefSchema,
  alt: text,
  phoneImage: mediaRefSchema,
  phoneAlt: text,
});

/** A big number that counts up (`value`, a placeholder or a plain number), or `text` that just shows. */
const pageNumber = z.union([
  z.strictObject({
    value: z.union([z.number(), onePlaceholder]),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
    label: text,
  }),
  z.strictObject({ text, label: text }),
]);

const parts = {
  /**
   * 100 squares for shares of a whole. `counts` holds raw counts by key (placeholders or numbers); the resolver
   * turns them into squares and percentages, and the label's words come from each legend item's `alt`.
   */
  waffle: z
    .strictObject({
      kind: z.literal("waffle"),
      label: text,
      note: text,
      counts: z.record(
        z.string().regex(/^[a-z]+$/),
        z.union([z.number().nonnegative(), onePlaceholder]),
      ),
      legend: z
        .array(z.strictObject({ key: text, swatch: text, text, alt: text }))
        .min(2),
    })
    .refine(
      (w) => {
        const keys = Object.keys(w.counts);
        return (
          keys.length === w.legend.length &&
          w.legend.every((l) => keys.includes(l.key))
        );
      },
      {
        message: "every key in `counts` needs one legend item, and back",
        path: ["legend"],
      },
    ),
  flow: z.strictObject({
    kind: z.literal("flow"),
    items: z
      .array(
        z.strictObject({
          tag: text,
          title: text,
          body: text,
          highlight: z.boolean().optional(),
        }),
      )
      .min(2),
  }),
  feeds: z.strictObject({
    kind: z.literal("feeds"),
    items: z
      .array(z.strictObject({ when: text, title: text, body: text }))
      .min(1),
  }),
  states: z.strictObject({
    kind: z.literal("states"),
    img: mediaRefSchema,
    alt: text,
    caption: text,
    items: z
      .array(
        z.strictObject({
          label: text,
          when: text,
          evidence: text,
          bg: text,
          fg: text,
          icon: text,
          border: text,
          bs: z.enum(["solid", "dashed"]),
          r: cssLength,
        }),
      )
      .min(1),
  }),
  bars: z.strictObject({
    kind: z.literal("bars"),
    title: text,
    text,
    groups: z
      .array(
        z.strictObject({
          who: text,
          rows: z
            .array(
              z.strictObject({
                metric: text,
                value: text,
                width: text,
                color: text,
              }),
            )
            .min(1),
        }),
      )
      .min(1),
  }),
  cards: z.strictObject({
    kind: z.literal("cards"),
    min: cssLength,
    items: z
      .array(z.strictObject({ tag: text.optional(), title: text, body: text }))
      .min(1),
  }),
  figure: z.strictObject({
    kind: z.literal("figure"),
    host: text,
    hasHost: z.boolean(),
    maxw: cssLength,
    img: mediaRefSchema,
    alt: text,
    caption: text,
  }),
  gallery: z.strictObject({
    kind: z.literal("gallery"),
    items: z
      .array(
        z.strictObject({
          host: text,
          img: mediaRefSchema,
          alt: text,
          caption: text,
        }),
      )
      .min(2),
  }),
  table: z
    .strictObject({
      kind: z.literal("table"),
      label: text,
      head: z.array(text).min(2),
      cols: text,
      minw: cssLength,
      note: text,
      rows: z.array(z.array(text)).min(1),
    })
    .refine((t) => t.rows.every((r) => r.length === t.head.length), {
      message: "every row needs one cell per column in `head`",
      path: ["rows"],
    }),
  chips: z.strictObject({
    kind: z.literal("chips"),
    label: text,
    items: z.array(text).min(1),
  }),
  note: z.strictObject({ kind: z.literal("note"), text }),
};

export const partSchema = z.discriminatedUnion("kind", [
  parts.waffle,
  parts.flow,
  parts.feeds,
  parts.states,
  parts.bars,
  parts.cards,
  parts.figure,
  parts.gallery,
  parts.table,
  parts.chips,
  parts.note,
]);

const section = z.strictObject({
  number: z.string().regex(/^\d{2}$/),
  title: text,
  lead: text.optional(),
  text: text.optional(),
  parts: z.array(partSchema).min(1),
});

const builtWith = z.strictObject({
  group: text,
  items: z
    .array(z.strictObject({ name: text, version: text.optional() }))
    .min(1),
  note: text,
});

const pageSchema = z.strictObject({
  statusLabel: text,
  tagline: z.strictObject({ strong: text, rest: text }),
  meta: z.array(meta).min(1),
  hero,
  numbers: z.array(pageNumber).min(1),
  numbersNote: text,
  sections: z.array(section).min(1),
  builtWith: z.array(builtWith).min(1),
  log: z.strictObject({
    title: text,
    items: z
      .array(
        z.strictObject({
          label: text,
          note: text,
          state: z.enum(["done", "current", "next"]),
        }),
      )
      .min(1),
  }),
  aside: z.strictObject({ title: text, items: z.array(text).min(1) }),
  actions: z
    .array(z.strictObject({ label: text, href: url, primary: z.boolean() }))
    .min(1)
    .refine(
      (a) => a.filter((x) => x.primary).length === 1,
      "exactly one action is primary",
    ),
  /** The project the "next project" card links to. */
  next: z.string().regex(PROJECT_ID),
});

// ── A project ─────────────────────────────────────────────────────────────────────────────────────────────────

const projectFields = z.strictObject({
  /** Position in the list, the pages' "next" order and the palette. */
  order: z.int().positive(),
  name: text,
  status: z.enum(["live", "development"]),
  /** The live site, for links and checks. */
  site: url,
  /** The public GitHub repository, `owner/name`. */
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "owner/name"),
  accent: z.strictObject({ dark: hex, light: hex }),
  /** The palette's `cd <id>` description; the status is added in code. */
  palette: text,
  list: z.strictObject({
    dir: text,
    mode: z.string().regex(/^[d-]([r-][w-][x-]){3}$/, "like drwxr-xr-x"),
    commits: z.union([z.number(), onePlaceholder]),
    stack: text,
  }),
  readme: readmeSchema,
  page: pageSchema,
  /** Named URLs that values reuse (`source: stats`). */
  sources: z.record(z.string().regex(SOURCE_NAME), url).optional(),
  values: z
    .record(z.string().regex(VALUE_NAME, "a camelCase name"), valueSchema)
    .optional(),
  shots: z
    .record(z.string().regex(SHOT_NAME, "a kebab-case name"), shotSchema)
    .optional(),
});

type Path = (string | number)[];

/** Every string in the content, with where it sits. */
function* strings(o: unknown, path: Path): Generator<[string, Path]> {
  if (typeof o === "string") yield [o, path];
  else if (Array.isArray(o))
    for (const [i, v] of o.entries()) yield* strings(v, [...path, i]);
  else if (o && typeof o === "object")
    for (const [k, v] of Object.entries(o)) yield* strings(v, [...path, k]);
}

/** Every media ref in the content, with where it sits. */
function* mediaRefs(
  o: unknown,
  path: Path,
): Generator<[{ shot?: string; asset?: string }, Path]> {
  if (Array.isArray(o))
    for (const [i, v] of o.entries()) yield* mediaRefs(v, [...path, i]);
  else if (o && typeof o === "object") {
    if ("shot" in o || "asset" in o) yield [o as { shot?: string }, path];
    else
      for (const [k, v] of Object.entries(o)) yield* mediaRefs(v, [...path, k]);
  }
}

/** The placeholders in a string, or an error for a stray brace. */
export function placeholdersIn(s: string): { names: string[]; stray: boolean } {
  const names = [...s.matchAll(PLACEHOLDER)].map((m) => m[1]);
  const stray = /[{}]/.test(s.replace(PLACEHOLDER, ""));
  return { names, stray };
}

export const projectSchema = projectFields.superRefine((p, ctx) => {
  const values = p.values ?? {};
  const shots = p.shots ?? {};
  const sources = p.sources ?? {};
  const content = { list: p.list, readme: p.readme, page: p.page };

  // Every placeholder names a value, and every brace belongs to a placeholder.
  for (const [s, path] of strings(content, [])) {
    const { names, stray } = placeholdersIn(s);
    if (stray)
      ctx.addIssue({
        code: "custom",
        path,
        message: `a "{" or "}" that isn't a placeholder: "${s}"`,
      });
    for (const name of names)
      if (!(name in values))
        ctx.addIssue({
          code: "custom",
          path,
          message: `unknown placeholder {${name}}: add it to \`values\``,
        });
  }

  // Every shot is defined.
  for (const [ref, path] of mediaRefs(content, []))
    if (ref.shot !== undefined && !(ref.shot in shots))
      ctx.addIssue({
        code: "custom",
        path: [...path, "shot"],
        message: `unknown shot "${ref.shot}": add it to \`shots\``,
      });

  // Sources exist; calc names exist and don't go round in a circle.
  const calcNames: Record<string, string[]> = {};
  for (const [name, v] of Object.entries(values)) {
    if (v.from === "json" && v.source !== undefined && !(v.source in sources))
      ctx.addIssue({
        code: "custom",
        path: ["values", name, "source"],
        message: `unknown source "${v.source}"`,
      });
    if (v.from !== "calc") continue;
    try {
      calcNames[name] = exprNames(v.expr);
      for (const used of calcNames[name])
        if (!(used in values))
          ctx.addIssue({
            code: "custom",
            path: ["values", name, "expr"],
            message: `unknown value "${used}"`,
          });
    } catch (e) {
      ctx.addIssue({
        code: "custom",
        path: ["values", name, "expr"],
        message: (e as Error).message,
      });
    }
  }
  const visiting = new Set<string>();
  const cyclic = (name: string): boolean => {
    if (visiting.has(name)) return true;
    visiting.add(name);
    const found = (calcNames[name] ?? []).some(cyclic);
    visiting.delete(name);
    return found;
  };
  for (const name of Object.keys(calcNames))
    if (cyclic(name))
      ctx.addIssue({
        code: "custom",
        path: ["values", name, "expr"],
        message: "uses itself, through other values",
      });
});

export type ProjectConfig = z.infer<typeof projectSchema>;
export type ValueConfig = z.infer<typeof valueSchema>;
export type ValueFormat = z.infer<typeof formatSchema>;
export type ShotConfig = z.infer<typeof shotSchema>;
export type MediaRef = z.infer<typeof mediaRefSchema>;
export type Part = z.infer<typeof partSchema>;

// ── Collected values: src/data/collected/<id>.json, written only by the refresh command ───────────────────────

const size = z.int().positive();

/** A screenshot in R2, in several widths and formats: `${base}.${width}.${format}`. */
export const collectedImageSchema = z.strictObject({
  kind: z.literal("image"),
  width: size,
  height: size,
  base: url,
  widths: z.array(size).min(1),
  formats: z.array(z.enum(["avif", "webp"])).min(1),
  asOf: isoTime,
  /** The page it was taken from. */
  source: url,
});

/** A loop in R2, with a still frame as its poster. */
export const collectedVideoSchema = z.strictObject({
  kind: z.literal("video"),
  width: size,
  height: size,
  poster: collectedImageSchema,
  sources: z
    .array(z.strictObject({ type: z.string().regex(/^video\//), url }))
    .min(1),
  asOf: isoTime,
  source: url,
});

export const collectedSchema = z.strictObject({
  refreshedAt: isoTime,
  values: z.record(
    z.string().regex(VALUE_NAME),
    z.strictObject({
      value: z.union([z.number(), z.string()]),
      asOf: isoTime,
      /** Where it was read: a URL, or a log's run URL. */
      source: url,
    }),
  ),
  shots: z.record(
    z.string().regex(SHOT_NAME),
    z.discriminatedUnion("kind", [collectedImageSchema, collectedVideoSchema]),
  ),
  /** What the last refresh couldn't read or check; each kept its last good value. */
  problems: z.array(z.strictObject({ name: text, message: text })),
});

export type Collected = z.infer<typeof collectedSchema>;
export type CollectedImage = z.infer<typeof collectedImageSchema>;
export type CollectedVideo = z.infer<typeof collectedVideoSchema>;
