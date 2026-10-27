// One shot from config to collected entry: capture, hash, then reuse the old entry when the hash is the same, or
// encode and upload (or, without R2 credentials, save under .cache/refresh/).

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type {
  CollectedImage,
  CollectedVideo,
  ShotConfig,
} from "../../../src/lib/projects/schema.ts";
import { CACHE_DIR } from "../config.ts";
import { MEDIA_URL, saveLocally, upload } from "../r2.ts";
import { captureLoop, captureStill } from "./capture.ts";
import {
  contentHash,
  encodeImage,
  encodeLoop,
  type EncodedImage,
} from "./encode.ts";

export type ShotEntry = CollectedImage | CollectedVideo;

export type ShotResult = {
  entry: ShotEntry;
  /** The hash matched the old entry, which is kept as it was. */
  same: boolean;
  /** Files encoded, files sent to R2 (0 when they were there or saved locally), and where local ones went. */
  files: number;
  /** The capture at full size: the still, or the loop's poster frame (the share image is cut from it). */
  still: Buffer;
  sent: number;
  savedTo?: string;
};

/** The time a capture gets, steps and loop included; encoding and uploading come after and aren't counted. */
const CAPTURE_LIMIT = 4 * 60_000;

/** The raw capture, for looking at: .cache/refresh/raw/<project>/<shot>.<ext>. */
async function keepRaw(project: string, file: string, body: Buffer) {
  const dir = new URL(`raw/${project}/`, CACHE_DIR);
  await mkdir(dir, { recursive: true });
  await writeFile(new URL(file, dir), body);
}

function imageEntry(
  enc: EncodedImage,
  base: string,
  asOf: string,
  source: string,
): CollectedImage {
  return {
    kind: "image",
    width: enc.width,
    height: enc.height,
    base,
    widths: enc.widths,
    formats: enc.formats,
    asOf,
    source,
  };
}

/** A shot from config to collected entry. Only the capture has a time limit. */
export async function takeShot(
  project: string,
  name: string,
  shot: ShotConfig,
  old: ShotEntry | undefined,
  publish: boolean,
): Promise<ShotResult> {
  const prefix = `portfolio/${project}`;
  const asOf = new Date().toISOString();

  if (!shot.video) {
    const png = await captureStill(shot, CAPTURE_LIMIT);
    await keepRaw(project, `${name}.png`, png);
    const key = `${name}.${contentHash([png])}`;
    const base = `${MEDIA_URL}/${prefix}/${key}`;
    if (old?.kind === "image" && old.base === base)
      return { entry: old, same: true, files: 0, sent: 0, still: png };
    const enc = await encodeImage(png, key);
    const entry = imageEntry(enc, base, asOf, shot.url);
    if (!publish)
      return {
        entry,
        same: false,
        files: enc.files.length,
        sent: 0,
        savedTo: await saveLocally(prefix, enc.files),
        still: png,
      };
    return {
      entry,
      same: false,
      files: enc.files.length,
      sent: await upload(prefix, enc.files),
      still: png,
    };
  }

  const { frames } = await captureLoop(shot, CAPTURE_LIMIT);
  const still = frames.at(-1)!.jpeg;
  const key = `${name}.${contentHash(frames.flatMap((f) => [f.jpeg, f.seconds.toFixed(4)]))}`;
  const base = `${MEDIA_URL}/${prefix}/${key}`;
  if (old?.kind === "video" && old.poster.base === base)
    return { entry: old, same: true, files: 0, sent: 0, still };
  const enc = await encodeLoop(frames, key);
  const mp4 = enc.files.find((f) => f.name.endsWith(".mp4"))!;
  await keepRaw(project, `${name}.mp4`, mp4.body);
  await keepRaw(
    project,
    `${name}.poster.webp`,
    enc.poster.files.find((f) => f.name.endsWith(`${enc.width}.webp`))!.body,
  );
  const entry: CollectedVideo = {
    kind: "video",
    width: enc.width,
    height: enc.height,
    poster: imageEntry(enc.poster, base, asOf, shot.url),
    sources: enc.files.map((f) => ({
      type: f.type,
      url: `${MEDIA_URL}/${prefix}/${f.name}`,
    })),
    asOf,
    source: shot.url,
  };
  const files = [...enc.files, ...enc.poster.files];
  if (!publish)
    return {
      entry,
      same: false,
      files: files.length,
      sent: 0,
      savedTo: await saveLocally(prefix, files),
      still,
    };
  return {
    entry,
    same: false,
    files: files.length,
    sent: await upload(prefix, files),
    still,
  };
}

export const rawDir = () => fileURLToPath(new URL("raw/", CACHE_DIR));
