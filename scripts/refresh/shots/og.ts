// A project page's share image (og:image): a 1200 × 630 JPEG cut from the top of the page's hero shot, uploaded to
// R2 next to the shots. Its name hashes the hero shot's base (itself a hash of the capture) and the settings below, so
// an unchanged hero keeps the image it has without fetching or encoding anything. A local hero's share image is made
// by the build instead (src/lib/projects/share.ts, the same cut).

import sharp from "sharp";
import type { CollectedOg } from "../../../src/lib/projects/schema.ts";
import { MEDIA_URL, saveLocally, upload } from "../r2.ts";
import { contentHash, type OutFile } from "./encode.ts";
import type { ShotEntry } from "./index.ts";

/** Bump when the cut or the encoding changes, so the new image gets a new name. */
const OG_ENCODING = "og-v1";
const WIDTH = 1200;
const HEIGHT = 630;
const QUALITY = 82;

export type OgResult = {
  og: CollectedOg;
  /** The hash matched the old entry, which is kept as it was. */
  same: boolean;
  /** 1 when the file was sent to R2 (0 when it was there, or saved locally), and where a local one went. */
  sent: number;
  savedTo?: string;
};

/** The full-size still a shot shows: the image, or a loop's poster. */
const stillOf = (entry: ShotEntry) =>
  entry.kind === "image" ? entry : entry.poster;

/** The widest WebP of a collected still, from media.azamatos.com. */
async function download(entry: ShotEntry): Promise<Buffer> {
  const img = stillOf(entry);
  const url = `${img.base}.${Math.max(...img.widths)}.webp`;
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`share image: ${url} answered ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** 1200 × 630 from the top of the still, scaled to the width. */
export async function cutOg(still: Buffer): Promise<Buffer> {
  return sharp(still)
    .resize({
      width: WIDTH,
      height: HEIGHT,
      fit: "cover",
      position: "top",
      kernel: "lanczos3",
    })
    .flatten({ background: "#000000" })
    .jpeg({ quality: QUALITY, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

/**
 * The share image for the hero shot `shot` (its collected `entry`). `still` is this run's capture of it, when there
 * is one; otherwise the collected file is downloaded, only if the image has to be made.
 */
export async function shareImage(
  project: string,
  shot: string,
  entry: ShotEntry,
  old: CollectedOg | undefined,
  still: Buffer | undefined,
  publish: boolean,
): Promise<OgResult> {
  const prefix = `portfolio/${project}`;
  const from = stillOf(entry).base;
  const name = `og.${contentHash([OG_ENCODING, from])}.jpg`;
  const url = `${MEDIA_URL}/${prefix}/${name}`;
  if (old?.url === url) return { og: old, same: true, sent: 0 };

  const body = await cutOg(still ?? (await download(entry)));
  const file: OutFile = { name, body, type: "image/jpeg" };
  const og: CollectedOg = {
    url,
    width: WIDTH,
    height: HEIGHT,
    shot,
    from,
    asOf: new Date().toISOString(),
  };
  if (!publish)
    return {
      og,
      same: false,
      sent: 0,
      savedTo: await saveLocally(prefix, [file]),
    };
  return { og, same: false, sent: await upload(prefix, [file]) };
}
