// Share images (og:image), 1200 × 630 cards from card.ts, uploaded to R2 next to the shots:
//   - a project's card: name, status, headline, two of its README numbers and its hero screenshot in a browser frame,
//     recorded as `og` in the project's collected file
//   - the site's card, for the home and 404 pages: the projects as the terminal lists them, the role and the line
//     from src/site.ts, recorded in src/data/collected/_site.json
// A card's file name hashes its HTML (fonts, text and colours) and where its screenshot came from, so an unchanged card
// keeps its file without rendering or fetching anything, and a new number or status makes a new one.

import { readFile, writeFile } from "node:fs/promises";
import { format } from "prettier";
import sharp from "sharp";
import { z } from "astro/zod";
import {
  collectedSiteSchema,
  type Collected,
  type CollectedOg,
  type CollectedSite,
  type ProjectConfig,
} from "../../../src/lib/projects/schema.ts";
import { heroSource } from "../../../src/lib/projects/share.ts";
import {
  interpolate,
  resolveValues,
  statusText,
} from "../../../src/lib/projects/values.ts";
import { SITE } from "../../../src/site.ts";
import { COLLECTED_DIR, ROOT } from "../config.ts";
import { MEDIA_URL, saveLocally, upload } from "../r2.ts";
import {
  CARD,
  projectCardHtml,
  renderCard,
  SCREEN,
  SHOT_SRC,
  siteCardHtml,
} from "./card.ts";
import { contentHash, type OutFile } from "./encode.ts";
import type { ShotEntry } from "./index.ts";

/** Part of every card's hash: bump it when the encoding below changes, so every card gets a new name. */
const OG_ENCODING = "og-card-v1";

export type OgResult<T> = {
  og: T;
  /** The hash matched the old entry, which is kept as it was. */
  same: boolean;
  /** 1 when the file was sent to R2 (0 when it was there, or saved locally), and where a local one went. */
  sent: number;
  savedTo?: string;
};

/**
 * A card with a screenshot is a high-quality JPEG (about 70 KB, against 195 KB as a PNG, with no visible loss); the
 * site's card, flat colour and text, stays a PNG (about 120 KB), so its text has no JPEG fringes at all.
 */
const ENCODERS = {
  jpg: (png: Buffer) =>
    sharp(png)
      .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer(),
  png: async (png: Buffer) => png,
};
const TYPES = { jpg: "image/jpeg", png: "image/png" } as const;

/** Renders a card unless `old` already is the one `parts` hash to, then uploads it (or saves it locally). */
async function publishCard<T extends { url: string }>(
  prefix: string,
  ext: keyof typeof ENCODERS,
  parts: (string | Buffer)[],
  html: () => Promise<string>,
  old: T | undefined,
  entry: (url: string) => T,
  publish: boolean,
): Promise<OgResult<T>> {
  const name = `og.${contentHash([OG_ENCODING, ...parts])}.${ext}`;
  const url = `${MEDIA_URL}/${prefix}/${name}`;
  if (old?.url === url) return { og: old, same: true, sent: 0 };
  const body = await ENCODERS[ext](await renderCard(await html()));
  const file: OutFile = { name, body, type: TYPES[ext] };
  const og = entry(url);
  if (!publish)
    return {
      og,
      same: false,
      sent: 0,
      savedTo: await saveLocally(prefix, [file]),
    };
  return { og, same: false, sent: await upload(prefix, [file]) };
}

// ── A project's card ────────────────────────────────────────────────────────────────────────────────────────────

/** The full-size still a shot shows: the image, or a loop's poster. */
const stillOf = (entry: ShotEntry) =>
  entry.kind === "image" ? entry : entry.poster;

/** A collected still from media.azamatos.com, in the smallest WebP that's twice the frame's screen. */
async function download(entry: ShotEntry): Promise<Buffer> {
  const img = stillOf(entry);
  const width =
    img.widths.find((w) => w >= SCREEN.width * 2) ?? Math.max(...img.widths);
  const url = `${img.base}.${width}.webp`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`share image: ${url} answered ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * The hero the card shows, as the page does: the collected shot, or an `asset` in src/assets/projects/, tagged
 * "design" when it's a mockup. None for a shot that isn't collected.
 */
async function heroOf(
  config: ProjectConfig,
  shots: Collected["shots"],
  stills: Map<string, Buffer>,
) {
  const ref = config.page.hero.image;
  const from = heroSource(ref, shots);
  if (!from) return undefined;
  if ("shot" in ref) {
    const entry = shots[ref.shot];
    return {
      from,
      shot: ref.shot,
      design: false,
      local: undefined,
      still: async () => stills.get(from) ?? (await download(entry)),
    };
  }
  const local = await readFile(new URL(from, ROOT));
  return {
    from,
    shot: undefined,
    design: ref.design ?? false,
    local,
    still: async () => local,
  };
}

/** The screenshot at the frame's screen size, from its top, as a data URL for the card. */
async function screen(still: Buffer): Promise<string> {
  const png = await sharp(still)
    .resize({
      width: SCREEN.width,
      height: SCREEN.height,
      fit: "cover",
      position: "top",
      kernel: "lanczos3",
    })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

/**
 * The share card of one project, from its config and this run's collected values and shots. `stills` holds this run's
 * captures by their entry's base; a hero that wasn't captured is downloaded, and only when the card has to be made.
 * Undefined when the hero is a shot that isn't collected.
 */
export async function shareImage(
  id: string,
  config: ProjectConfig,
  collected: Collected,
  old: CollectedOg | undefined,
  stills: Map<string, Buffer>,
  publish: boolean,
): Promise<OgResult<CollectedOg> | undefined> {
  const hero = await heroOf(config, collected.shots, stills);
  if (!hero) return undefined;
  const values = resolveValues(id, config, collected);
  const fill = (s: string, where: string) =>
    interpolate(s, values, `${id}: ${where}`);
  const live = config.status === "live";
  const html = await projectCardHtml({
    name: config.name,
    headline: fill(config.readme.headline, "readme.headline"),
    live,
    status: statusText(config.status),
    host: config.page.hero.host,
    accent: config.accent.dark,
    design: hero.design,
    numbers: config.readme.stats.slice(0, 2).map((s, i) => ({
      value: fill(s.value, `readme.stats[${i}].value`),
      label: fill(s.short, `readme.stats[${i}].short`),
    })),
  });
  return publishCard(
    `portfolio/${id}`,
    "jpg",
    [html, hero.from, ...(hero.local ? [hero.local] : [])],
    async () => html.replace(SHOT_SRC, await screen(await hero.still())),
    old,
    (url) => ({
      url,
      width: CARD.width,
      height: CARD.height,
      ...(hero.shot && { shot: hero.shot }),
      from: hero.from,
      asOf: new Date().toISOString(),
    }),
    publish,
  );
}

// ── The site's card ─────────────────────────────────────────────────────────────────────────────────────────────

const SITE_FILE = new URL("_site.json", COLLECTED_DIR);
type SiteOg = CollectedSite["og"];

export async function loadSite(): Promise<CollectedSite | undefined> {
  let text: string;
  try {
    text = await readFile(SITE_FILE, "utf8");
  } catch {
    return undefined;
  }
  const parsed = collectedSiteSchema.safeParse(JSON.parse(text));
  if (!parsed.success)
    throw new Error(
      `src/data/collected/_site.json:\n${z.prettifyError(parsed.error)}`,
    );
  return parsed.data;
}

export async function writeSite(data: CollectedSite): Promise<void> {
  const valid = collectedSiteSchema.parse(data);
  await writeFile(
    SITE_FILE,
    await format(JSON.stringify(valid), { parser: "json" }),
  );
}

/** "Senior full-stack engineer: 8+ years in …" → "8+ years in …": the share line without the role it starts with. */
const lineOf = (s: string) => {
  const rest = s.replace(/^[^:]*:\s*/, "");
  return rest.charAt(0).toUpperCase() + rest.slice(1);
};

/** The site's card: the owner's name, role, line and photo, from src/site.ts. */
export async function siteShareImage(
  old: SiteOg | undefined,
  publish: boolean,
): Promise<OgResult<SiteOg>> {
  const html = await siteCardHtml({
    name: SITE.name,
    role: SITE.role,
    line: lineOf(SITE.shareDescription),
    email: SITE.email,
    availability: SITE.availability,
  });
  return publishCard(
    "portfolio/site",
    "png",
    [html],
    async () => html,
    old,
    (url) => ({
      url,
      width: CARD.width,
      height: CARD.height,
      asOf: new Date().toISOString(),
    }),
    publish,
  );
}
