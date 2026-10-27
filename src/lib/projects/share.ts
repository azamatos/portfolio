// A project page's link preview image (og:image): the card the refresh command renders (scripts/refresh/shots/og.ts)
// and records as `og` in the collected file; until there's one for the hero the page shows, the page keeps the site's.
//
// Type-only imports, so the refresh command can import `heroSource` as well.

import type { Project } from "./index.ts";
import type { Collected, MediaRef } from "./schema.ts";

/** A link preview's image: an absolute URL, its size and type, and what it shows. */
export type ShareImage = {
  url: string;
  width: number;
  height: number;
  type: string;
  alt: string;
};

/** The MIME type of a share image, from its file name. */
export const imageType = (url: string) =>
  /\.png$/i.test(url) ? "image/png" : "image/jpeg";

/**
 * Where a share card's screenshot comes from, which ties the card to the hero the page shows: the hero shot's base in
 * R2, or the local file the page shows in its place (an `asset`, or a shot's fallback while it isn't collected).
 */
export function heroSource(
  id: string,
  hero: MediaRef,
  shots: Collected["shots"] | undefined,
): string {
  if ("asset" in hero) return `src/assets/projects/${hero.asset}`;
  const shot = shots?.[hero.shot];
  if (shot) return shot.kind === "video" ? shot.poster.base : shot.base;
  return `src/assets/projects/fallback/${id}-${hero.shot}.webp`; // fallback: goes with fallback.ts
}

/** The card, when the refresh has made one for the hero the page shows. */
export function shareImage(project: Project): ShareImage | undefined {
  const { og } = project;
  if (!og) return undefined;
  return {
    url: og.url,
    width: og.width,
    height: og.height,
    type: imageType(og.url),
    alt: `${project.name}, ${project.statusText}: ${project.readme.headline} Screenshot: ${project.page.hero.alt}`,
  };
}
