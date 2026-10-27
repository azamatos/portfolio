// TEMPORARY, until the refresh command records every shot (phase 2).
//
// A shot that isn't in src/data/collected/<id>.json yet shows the design export's image for that slot:
// src/assets/projects/fallback/<id>-<shot>.webp. To remove it: delete this file, the fallback/ folder and the one
// call marked "fallback" in media.ts. Then a missing shot fails the build instead.

import type { ImageMetadata } from "astro";
import type { Media } from "./media.ts";

const files = import.meta.glob<ImageMetadata>(
  "/src/assets/projects/fallback/*.webp",
  {
    eager: true,
    import: "default",
  },
);

/**
 * Fallbacks that are design mockups rather than the real site, so the page tags them "design": the export's Visaproof
 * and Ýeral images are designs; Rebuffer's and pass's are screenshots of the live sites.
 */
const DESIGN = new Set([
  "visaproof-search-full",
  "visaproof-search",
  "visaproof-job",
  "visaproof-job-phone",
  "yeral-calendar",
  "yeral-phone-calendar",
]);

export function shotFallback(project: string, shot: string): Media | undefined {
  const name = `${project}-${shot}`;
  const image = files[`/src/assets/projects/fallback/${name}.webp`];
  return (
    image && { kind: "asset", image, design: DESIGN.has(name), fallback: true }
  );
}
