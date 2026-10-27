// `json` and `page` values: a number from a live JSON document or HTML page.

import { firstNumber, once, type Def, type Reading } from "./types.ts";

export const USER_AGENT =
  "Mozilla/5.0 (compatible; azamatos-portfolio-refresh; +https://azamatos.com)";

async function get(url: string, accept: string): Promise<Response> {
  const res = await fetch(url, {
    headers: { accept, "user-agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return res;
}

const fetchJson = (url: string) =>
  once(
    `json ${url}`,
    async () => (await get(url, "application/json")).json() as Promise<unknown>,
  );

/**
 * A field at a dot path. `.` is the document; `k=v` picks the first array item whose `k` is `v`; a number picks an
 * array index; anything else is an object key.
 */
export function pick(doc: unknown, path: string): unknown {
  if (path === ".") return doc;
  let at = doc;
  const walked: string[] = [];
  for (const segment of path.split(".")) {
    walked.push(segment);
    const eq = segment.indexOf("=");
    if (Array.isArray(at) && eq > 0) {
      const [k, v] = [segment.slice(0, eq), segment.slice(eq + 1)];
      at = at.find(
        (item) =>
          item &&
          typeof item === "object" &&
          String((item as Record<string, unknown>)[k]) === v,
      );
    } else if (Array.isArray(at) && /^\d+$/.test(segment))
      at = at[Number(segment)];
    else if (at && typeof at === "object")
      at = (at as Record<string, unknown>)[segment];
    else at = undefined;
    if (at === undefined) throw new Error(`nothing at "${walked.join(".")}"`);
  }
  return at;
}

export async function readJson(
  def: Def<"json">,
  url: string,
): Promise<Reading> {
  const doc = await fetchJson(url);
  if (def.path !== undefined) {
    const found = pick(doc, def.path);
    if (typeof found === "number") return { value: found, source: url };
    if (typeof found === "string")
      return { value: firstNumber(found, def.path), source: url };
    throw new Error(
      `"${def.path}" is ${JSON.stringify(found)?.slice(0, 60)}, not a number`,
    );
  }
  const list = pick(doc, def.count!);
  if (!list || typeof list !== "object")
    throw new Error(`"${def.count}" is not a list`);
  const items = Array.isArray(list) ? list : Object.values(list);
  if (def.distinct === undefined) return { value: items.length, source: url };
  const seen = new Set(
    items.map((item) => {
      const v = pick(item, def.distinct!);
      return typeof v === "object" ? JSON.stringify(v) : String(v);
    }),
  );
  return { value: seen.size, source: url };
}

export async function readPage(def: Def<"page">): Promise<Reading> {
  const html = await once(`page ${def.url}`, async () =>
    (await get(def.url, "text/html")).text(),
  );
  const m = new RegExp(def.pattern, "m").exec(html);
  if (!m) throw new Error(`/${def.pattern}/ matches nothing on ${def.url}`);
  return {
    value: firstNumber(m[1], `the match "${m[0].trim().slice(0, 80)}"`),
    source: def.url,
  };
}
