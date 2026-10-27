// Shapes the project page components take, cut from what `getProjects()` returns.

import type { Project, ProjectPart } from "@/lib/projects";

/** One section part of a kind: `PartOf<"waffle">`. */
export type PartOf<K extends ProjectPart["kind"]> = Extract<
  ProjectPart,
  { kind: K }
>;

type Page = Project["page"];
export type Section = Page["sections"][number];
export type BuiltWithGroup = Page["builtWith"][number];
export type LogList = Page["log"];
export type AsideList = Page["aside"];
export type Action = Page["actions"][number];

/** A two-digit section number: 6 → "06". */
export const sectionNumber = (n: number) => String(n).padStart(2, "0");
