// A project page's link preview image (og:image), 1200 × 630, cut from the top of the page's hero screenshot:
//   - a hero shot in R2: the JPEG the refresh command cut and uploaded (`og` in the collected file)
//   - a local hero (Ýeral's design shot while its live shots are skipped): cut here, by the build, the same way
// A hero shot collected before its share image gets none: the page keeps the site's default.

import { getImage } from "astro:assets";
import type { Project } from "./index.ts";

/** The share image's size and JPEG quality; scripts/refresh/shots/og.ts cuts it the same way. */
export const SHARE = { width: 1200, height: 630, quality: 82 } as const;

export async function shareImage(project: Project, site: URL) {
  const { hero } = project.page;
  const alt = hero.alt;
  if (project.og)
    return {
      url: project.og.url,
      width: project.og.width,
      height: project.og.height,
      alt,
    };
  if (hero.image.kind !== "asset") return undefined;
  const image = await getImage({
    src: hero.image.image,
    width: SHARE.width,
    height: SHARE.height,
    fit: "cover",
    position: "top",
    format: "jpeg",
    quality: SHARE.quality,
  });
  return {
    url: new URL(image.src, site).href,
    width: SHARE.width,
    height: SHARE.height,
    alt,
  };
}
