// Media refs → something a page can render: a local image (`astro:assets`) or a collected screenshot or loop in R2.

import type { ImageMetadata } from "astro";
import { shotFallback } from "./fallback.ts";
import type {
  Collected,
  CollectedImage,
  CollectedVideo,
  MediaRef,
} from "./schema.ts";

export type Media =
  /** A file in src/assets/projects/, for <Image>. `design`: a mockup, tagged "design" on the page. */
  | { kind: "asset"; image: ImageMetadata; design: boolean; fallback?: true }
  /** A screenshot in R2; build URLs with `imageUrl`/`imageSrcset`. */
  | CollectedImage
  /** A muted loop in R2, with a poster image. */
  | CollectedVideo;

const assets = import.meta.glob<ImageMetadata>(
  "/src/assets/projects/*.{webp,png,jpg,jpeg,avif}",
  {
    eager: true,
    import: "default",
  },
);

export function resolveMedia(
  ref: MediaRef,
  project: string,
  collected: Collected | undefined,
  where: string,
): Media {
  if ("asset" in ref) {
    const image = assets[`/src/assets/projects/${ref.asset}`];
    if (!image)
      throw new Error(`${where}: no file src/assets/projects/${ref.asset}`);
    return { kind: "asset", image, design: ref.design ?? false };
  }
  const shot = collected?.shots[ref.shot] ?? shotFallback(project, ref.shot); // fallback: remove with fallback.ts
  if (!shot)
    throw new Error(
      `${where}: shot "${ref.shot}" isn't collected yet. Run \`pnpm data:refresh ${project}\`.`,
    );
  return shot;
}

/** One file of a collected screenshot: `${base}.${width}.${format}`. */
export const imageUrl = (
  img: CollectedImage,
  width: number,
  format: CollectedImage["formats"][number],
) => `${img.base}.${width}.${format}`;

/** A `srcset` with every width of one format. */
export const imageSrcset = (
  img: CollectedImage,
  format: CollectedImage["formats"][number],
) => img.widths.map((w) => `${imageUrl(img, w, format)} ${w}w`).join(", ");
