// Turns captures into the files the site serves: AVIF and WebP stills in several widths (sharp), and loops as
// WebM (VP9) and MP4 (H.264, faststart) without sound (ffmpeg). Names carry a hash of the capture, so a file never
// changes once it's uploaded and can be cached for a year.

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import type { Frame } from "./capture.ts";

/** Bump when the settings below change, so new files get new names. */
const ENCODING = "v1";
const WIDTHS = [480, 960, 1440, 2880];
const FORMATS = ["avif", "webp"] as const;
export const FPS = 30;

export type Format = (typeof FORMATS)[number];
export type OutFile = { name: string; body: Buffer; type: string };

export type EncodedImage = {
  width: number;
  height: number;
  widths: number[];
  formats: Format[];
  files: OutFile[];
};

export type EncodedVideo = {
  width: number;
  height: number;
  poster: EncodedImage;
  files: OutFile[];
};

const TYPES: Record<string, string> = {
  avif: "image/avif",
  webp: "image/webp",
  webm: "video/webm",
  mp4: "video/mp4",
};

/** The first 10 hex characters of a SHA-256 over the capture and the encoder settings. */
export function contentHash(parts: (Buffer | string)[]): string {
  const h = createHash("sha256").update(ENCODING);
  for (const p of parts) h.update(p);
  return h.digest("hex").slice(0, 10);
}

/** Widths up to the image's own: 480, 960, 1440, 2880, and its own width when that's in between. */
export function widthsFor(native: number): number[] {
  const below = WIDTHS.filter((w) => w < native);
  return [...below, native];
}

/** Every width as AVIF and WebP, named `<prefix>.<width>.<format>`. */
export async function encodeImage(
  png: Buffer,
  prefix: string,
): Promise<EncodedImage> {
  const { width, height } = await sharp(png).metadata();
  if (!width || !height) throw new Error("the capture has no size");
  const widths = widthsFor(width);
  const files = await Promise.all(
    widths.flatMap((w) =>
      FORMATS.map(async (format): Promise<OutFile> => {
        const resized = sharp(png).resize({ width: w, kernel: "lanczos3" });
        const body =
          format === "avif"
            ? await resized
                .avif({ quality: 62, effort: 5, chromaSubsampling: "4:4:4" })
                .toBuffer()
            : await resized
                .webp({ quality: 82, effort: 5, smartSubsample: true })
                .toBuffer();
        return { name: `${prefix}.${w}.${format}`, body, type: TYPES[format] };
      }),
    ),
  );
  return { width, height, widths, formats: [...FORMATS], files };
}

async function ffmpeg(args: string[]) {
  try {
    await promisify(execFile)(
      "ffmpeg",
      ["-hide_banner", "-loglevel", "error", "-y", ...args],
      {
        maxBuffer: 16 * 1024 * 1024,
      },
    );
  } catch (e) {
    const err = e as Error & { code?: string; stderr?: string };
    if (err.code === "ENOENT")
      throw new Error(
        "ffmpeg isn't installed (brew install ffmpeg, or apt-get install ffmpeg)",
        { cause: e },
      );
    throw new Error(
      `ffmpeg: ${(err.stderr || err.message).trim().split("\n").slice(-3).join(" ")}`,
      { cause: e },
    );
  }
}

/** The frames as a constant-rate loop in WebM and MP4, plus the last frame as the poster. */
export async function encodeLoop(
  frames: Frame[],
  prefix: string,
): Promise<EncodedVideo> {
  const dir = await mkdtemp(join(tmpdir(), "refresh-loop-"));
  try {
    const list = ["ffconcat version 1.0"];
    for (const [i, f] of frames.entries()) {
      const file = `f${String(i).padStart(5, "0")}.jpg`;
      await writeFile(join(dir, file), f.jpeg);
      list.push(`file ${file}`, `duration ${f.seconds.toFixed(4)}`);
    }
    // The concat demuxer drops the last duration unless the last file is listed again.
    list.push(`file f${String(frames.length - 1).padStart(5, "0")}.jpg`);
    await writeFile(join(dir, "frames.txt"), list.join("\n") + "\n");

    const seconds = frames.reduce((a, f) => a + f.seconds, 0);
    const input = ["-f", "concat", "-safe", "0", "-i", join(dir, "frames.txt")];
    // JPEG frames are full range; video players expect TV range.
    const scale = `scale=trunc(iw/2)*2:trunc(ih/2)*2:in_range=pc:out_range=tv`;
    const common = [
      "-vf",
      `fps=${FPS},${scale},format=yuv420p`,
      "-color_range",
      "tv",
      "-pix_fmt",
      "yuv420p",
      "-t",
      seconds.toFixed(3),
      "-an",
      "-map_metadata",
      "-1",
      "-fflags",
      "+bitexact",
    ];
    await ffmpeg([
      ...input,
      ...common,
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "0",
      "-crf",
      "36",
      "-row-mt",
      "1",
      "-deadline",
      "good",
      "-cpu-used",
      "2",
      join(dir, "loop.webm"),
    ]);
    await ffmpeg([
      ...input,
      ...common,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      "24",
      "-profile:v",
      "high",
      "-movflags",
      "+faststart",
      join(dir, "loop.mp4"),
    ]);

    const posterPng = await sharp(frames.at(-1)!.jpeg).png().toBuffer();
    const poster = await encodeImage(posterPng, prefix);
    return {
      width: poster.width,
      height: poster.height,
      poster,
      files: [
        {
          name: `${prefix}.webm`,
          body: await readFile(join(dir, "loop.webm")),
          type: TYPES.webm,
        },
        {
          name: `${prefix}.mp4`,
          body: await readFile(join(dir, "loop.mp4")),
          type: TYPES.mp4,
        },
      ],
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
