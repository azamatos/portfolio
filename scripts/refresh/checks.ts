// Checks that aren't readings: values past their `maxAge`, and links on the pages that don't answer.

import type { ProjectConfig } from "../../src/lib/projects/schema.ts";
import { USER_AGENT } from "./readers/web.ts";

const DAY = 86_400_000;

/** Whole days from `iso` (a day or a time) to `now`. */
export const ageInDays = (iso: string, now: Date) =>
  Math.floor((now.getTime() - new Date(iso).getTime()) / DAY);

/** Manual values whose `checked` date is older than their `maxAge`. */
export function staleManual(
  config: ProjectConfig,
  now: Date,
): { name: string; message: string }[] {
  const out: { name: string; message: string }[] = [];
  for (const [name, def] of Object.entries(config.values ?? {})) {
    if (def.from !== "manual" || def.maxAge === undefined) continue;
    const age = ageInDays(def.checked, now);
    if (age > def.maxAge)
      out.push({
        name,
        message: `checked ${def.checked}, ${age} days ago (maxAge ${def.maxAge}): check it${
          def.sourceUrl ? ` at ${def.sourceUrl}` : ""
        }, then update \`value\` and \`checked\` in the config`,
      });
  }
  return out;
}

/** Every `href` in the config, plus the site and the values' source links. */
export function linksIn(config: ProjectConfig): string[] {
  const found = new Set<string>([
    config.site,
    `https://github.com/${config.repo}`,
  ]);
  const walk = (o: unknown) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object")
      for (const [k, v] of Object.entries(o)) {
        if ((k === "href" || k === "sourceUrl") && typeof v === "string")
          found.add(v);
        else walk(v);
      }
  };
  walk(config);
  return [...found];
}

/** The status a link answers with after redirects, or an error. GET, since some servers refuse HEAD. */
async function status(url: string): Promise<number> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
        signal: AbortSignal.timeout(30_000),
      });
      await res.body?.cancel();
      if (res.status >= 500 && attempt < 2) continue;
      return res.status;
    } catch (e) {
      if (attempt >= 2) throw e;
    }
  }
}

/** Links that don't answer 2xx (after redirects), with what they answered. */
export async function brokenLinks(
  urls: string[],
): Promise<{ url: string; message: string }[]> {
  const broken: { url: string; message: string }[] = [];
  const queue = [...urls];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        const code = await status(url);
        if (code >= 400) broken.push({ url, message: `answered ${code}` });
      } catch (e) {
        broken.push({
          url,
          message: `didn't answer: ${(e as Error).cause ?? (e as Error).message}`,
        });
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return broken.sort((a, b) => a.url.localeCompare(b.url));
}
