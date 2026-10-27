// The ⌘K command palette's commands. The `cd <project>` rows come from the projects; the rest are fixed here.

import { numberWord, type Project } from "@/lib/projects";
import { SITE } from "@/site";

export type PaletteAction =
  /** Go to a page or a section of one. */
  | { type: "link"; href: string; external?: true }
  /** Copy the text instead of closing. */
  | { type: "copy"; text: string }
  /** Switch the theme in place. */
  | { type: "theme"; theme: "light" | "dark" | "system" };

export type PaletteCommand = {
  group: "go" | "do" | "set" | "open";
  verb: string;
  arg: string;
  description: string;
  action: PaletteAction;
};

/** `https://github.com/azamatos` → `github.com/azamatos`. */
const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "");

export function paletteCommands(projects: Project[]): PaletteCommand[] {
  return [
    {
      group: "go",
      verb: "ls",
      arg: "projects",
      description: `all ${numberWord(projects.length)} projects`,
      action: { type: "link", href: "/#projects" },
    },
    ...projects.map(
      (p): PaletteCommand => ({
        group: "go",
        verb: "cd",
        arg: p.id,
        description: `${p.palette} · ${p.statusText}`,
        action: { type: "link", href: p.path },
      }),
    ),
    {
      group: "go",
      verb: "cd",
      arg: "~",
      description: "back to the top of the home page",
      action: { type: "link", href: "/" },
    },
    {
      group: "do",
      verb: "cat",
      arg: "resume.pdf",
      description: `download my resume, ${SITE.resume.pages} pages`,
      action: { type: "link", href: SITE.resume.url },
    },
    {
      group: "do",
      verb: "mail",
      arg: SITE.email,
      description: "copy the address",
      action: { type: "copy", text: SITE.email },
    },
    {
      group: "set",
      verb: "theme",
      arg: "light",
      description: "a light page",
      action: { type: "theme", theme: "light" },
    },
    {
      group: "set",
      verb: "theme",
      arg: "dark",
      description: "a dark page",
      action: { type: "theme", theme: "dark" },
    },
    {
      group: "set",
      verb: "theme",
      arg: "system",
      description: "follow this device",
      action: { type: "theme", theme: "system" },
    },
    {
      group: "open",
      verb: "open",
      arg: "github",
      description: bare(SITE.links.github),
      action: { type: "link", href: SITE.links.github, external: true },
    },
    {
      group: "open",
      verb: "open",
      arg: "linkedin",
      description: bare(SITE.links.linkedin).replace(/^linkedin\.com\//, ""),
      action: { type: "link", href: SITE.links.linkedin, external: true },
    },
    {
      group: "open",
      verb: "open",
      arg: "telegram",
      description: `@${bare(SITE.links.telegram).replace(/^t\.me\//, "")}`,
      action: { type: "link", href: SITE.links.telegram, external: true },
    },
  ];
}
