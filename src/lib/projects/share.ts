// How a project page is shared and found: its title and description, its link preview image (og:image) and its
// schema.org nodes. The image is the card the refresh command renders (scripts/refresh/shots/og.ts) and records as
// `og` in the collected file; until there's one for the hero the page shows, the page keeps the site's.
//
// Type-only imports and src/site.ts, so the refresh command can import `heroSource` as well.

import { SITE } from "../../site.ts";
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

/** The Person every page describes (BaseLayout), for other nodes to point at. */
export const PERSON_ID = `${SITE.url}/#person`;

/** The MIME type of a share image, from its file name. */
export const imageType = (url: string) =>
  /\.png$/i.test(url) ? "image/png" : "image/jpeg";

/**
 * Where a share card's screenshot comes from, which ties the card to the hero the page shows: the hero shot's base in
 * R2, or the file in src/assets/projects/ for an `asset`. None for a shot that isn't collected.
 */
export function heroSource(
  hero: MediaRef,
  shots: Collected["shots"] | undefined,
): string | undefined {
  if ("asset" in hero) return `src/assets/projects/${hero.asset}`;
  const shot = shots?.[hero.shot];
  return shot && (shot.kind === "video" ? shot.poster.base : shot.base);
}

/**
 * The card, when the refresh has made one for the hero the page shows. Its alt ends with the hero's: a screenshot's
 * says so, and a design's alt says it's a design, as every design alt does.
 */
export function shareImage(project: Project): ShareImage | undefined {
  const { og } = project;
  if (!og) return undefined;
  const { image, alt } = project.page.hero;
  const design = image.kind === "asset" && image.design;
  return {
    url: og.url,
    width: og.width,
    height: og.height,
    type: imageType(og.url),
    alt: `${project.name}, ${project.statusText}: ${project.readme.headline} ${design ? "" : "Screenshot: "}${alt}`,
  };
}

/** "Visaproof: Developer jobs in Europe, with the visa answer first": the name and the headline, which say it all. */
export const projectTitle = (p: Project) =>
  `${p.name}: ${p.readme.headline.replace(/\.$/, "")}`;

/**
 * 120 to 160 characters, as search results show them: the tagline when it's that long, else the tagline and the
 * first sentence of the short README text, else the headline and that text. The tagline when none fits.
 */
export function projectDescription(p: Project): string {
  const tagline = `${p.page.tagline.strong} ${p.page.tagline.rest}`;
  const [first] = p.readme.short.split(/(?<=[.!?])\s+/);
  return (
    [
      tagline,
      `${tagline} ${first}`,
      `${p.readme.headline} ${p.readme.short}`,
    ].find((d) => d.length >= 120 && d.length <= 160) ?? tagline
  );
}

/** The project as source code with a live site, by the Person, and the page's place: Home → Projects → name. */
export function projectJsonLd(p: Project, page: string, image?: ShareImage) {
  return [
    {
      "@type": "SoftwareSourceCode",
      "@id": `${page}#project`,
      name: p.name,
      description: p.readme.short,
      url: p.site,
      codeRepository: p.repoUrl,
      author: { "@id": PERSON_ID },
      ...(image && { image: image.url }),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { name: "Home", item: `${SITE.url}/` },
        { name: "Projects", item: `${SITE.url}/#projects` },
        { name: p.name, item: page },
      ].map((crumb, i) => ({ "@type": "ListItem", position: i + 1, ...crumb })),
    },
  ];
}
