// pnpm test:layout [--url <url>] [--page <path>]… [--width <px>]… [--shots <dir>]
//
// The layout sweep: every page of the built site (the home page, each project's page, the 404 page) at every width
// from 320 to 1920px, 10px apart, plus both sides of each width in src/'s `@media` rules, with reduced motion so
// nothing is caught mid-animation. At each width checks.ts looks for a page that scrolls sideways, boxes and text
// that stick out of their boxes or are cut off, rows that wrap badly, overlapping siblings and, on a phone, tap
// targets under 24×24px; allowed.ts lists what does one of those on purpose. Every finding is printed with its page,
// widths, selector and reason, and the command then fails.
//
// The layout doesn't depend on the theme, so the sweep runs in the dark one. It serves dist/ itself (`astro preview`
// on a free port, stopped at the end), so build first; or give it a running server with --url. --shots also saves
// full-page screenshots of each page at 390, 800, 1024, 1280 and 1440px, dark and light, to look at.

import { mkdir, readdir, readFile } from "node:fs/promises";
import { createServer, type AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { preview } from "astro";
import { chromium, type Browser, type Page } from "playwright";
import { ALLOWED } from "./allowed.ts";
import { findProblems, type Finding } from "./checks.ts";

const ROOT = new URL("../../", import.meta.url);
const FROM = 320;
const TO = 1920;
const STEP = 10;
/** The site's phone layout: tap targets are checked up to here. */
const PHONE = 800;
const HEIGHT = 900;
const SHOT_WIDTHS = [390, 800, 1024, 1280, 1440];

const { values: flags } = parseArgs({
  options: {
    url: { type: "string" },
    page: { type: "string", multiple: true },
    width: { type: "string", multiple: true },
    shots: { type: "string" },
    help: { type: "boolean", short: "h", default: false },
  },
});

if (flags.help) {
  console.log(`pnpm test:layout [--url <url>] [--page <path>]… [--width <px>]… [--shots <dir>]

  --url    a server that already serves the build (by default dist/ is served on a free port)
  --page   only this path, e.g. /projects/rebuffer/ (more than once for more)
  --width  only this width in px, for the sweep and the shots (more than once for more)
  --shots  save full-page screenshots, dark and light, at ${SHOT_WIDTHS.join(", ")}px (or --width) to this folder`);
  process.exit(0);
}

interface Target {
  path: string;
  name: string;
  status: number;
}

/** The home page, each project's page (one per src/content/projects/<id>.yaml) and the 404 page. */
async function pages(): Promise<Target[]> {
  const files = await readdir(new URL("src/content/projects/", ROOT));
  const ids = files
    .filter((f) => f.endsWith(".yaml"))
    .map((f) => f.slice(0, -".yaml".length))
    .sort();
  return [
    { path: "/", name: "home", status: 200 },
    ...ids.map((id) => ({ path: `/projects/${id}/`, name: id, status: 200 })),
    { path: "/no-such-page/", name: "404", status: 404 },
  ];
}

/** Both sides of every width in an `@media` rule under src/: `max-width: 800px` gives 800 and 801. */
async function breakpoints(): Promise<number[]> {
  const dir = new URL("src/", ROOT);
  const files = (await readdir(dir, { recursive: true })).filter((f) =>
    /\.(astro|css)$/.test(f),
  );
  const found = new Set<number>();
  for (const file of files) {
    const source = await readFile(new URL(file, dir), "utf8");
    for (const [rule] of source.matchAll(/@media[^{]+/g))
      for (const [, name, op, n] of rule.matchAll(
        /(min-width|max-width|width)\s*(:|<=|>=|<|>)\s*(\d+)px/g,
      )) {
        const w = Number(n);
        const upTo = name === "max-width" || op === "<=" || op === ">";
        found.add(upTo ? w : w - 1).add(upTo ? w + 1 : w);
      }
  }
  return [...found];
}

async function widths(): Promise<number[]> {
  if (flags.width) return flags.width.map(Number).sort((a, b) => a - b);
  const all = new Set(await breakpoints());
  for (let w = FROM; w <= TO; w += STEP) all.add(w);
  return [...all].filter((w) => w >= FROM && w <= TO).sort((a, b) => a - b);
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const { port } = server.address() as AddressInfo;
  await new Promise((done) => server.close(done));
  return port;
}

interface Hit extends Finding {
  page: string;
  widths: number[];
}

async function sweep(
  page: Page,
  target: Target,
  list: number[],
  hits: Map<string, Hit>,
) {
  const allowed = ALLOWED.map(({ selector, kinds }) => ({ selector, kinds }));
  for (const width of list) {
    await page.setViewportSize({ width, height: HEIGHT });
    const found = await page.evaluate(findProblems, {
      allowed,
      phone: width <= PHONE,
    });
    for (const f of found) {
      const key = `${target.path} ${f.kind} ${f.selector}`;
      const hit = hits.get(key);
      if (hit) hit.widths.push(width);
      else hits.set(key, { ...f, page: target.path, widths: [width] });
    }
  }
}

/** Full-page screenshots, dark and light, with every lazy image loaded first. */
async function shots(page: Page, target: Target, list: number[], dir: string) {
  await page.evaluate(async () => {
    const images = [...document.images];
    for (const img of images) img.loading = "eager";
    const loaded = Promise.all(
      images.map((img) => img.decode().catch(() => undefined)),
    );
    // A slow image doesn't hold the shots up: it's the layout they're for.
    await Promise.race([loaded, new Promise((done) => setTimeout(done, 8000))]);
  });
  for (const colorScheme of ["dark", "light"] as const) {
    await page.emulateMedia({ colorScheme });
    for (const width of list) {
      await page.setViewportSize({ width, height: HEIGHT });
      await page.screenshot({
        path: `${dir}/${target.name}-${width}-${colorScheme}.png`,
        fullPage: true,
      });
    }
  }
}

async function run(
  browser: Browser,
  base: string,
  targets: Target[],
  list: number[],
): Promise<Hit[]> {
  const shotWidths = flags.width ? list : SHOT_WIDTHS;
  if (flags.shots) await mkdir(flags.shots, { recursive: true });
  const hits = new Map<string, Hit>();
  const started = performance.now();

  // One context per page, all at once; the widths one after another in each.
  await Promise.all(
    targets.map(async (target) => {
      const context = await browser.newContext({
        viewport: { width: list[0], height: HEIGHT },
        reducedMotion: "reduce",
        colorScheme: "dark",
      });
      try {
        const page = await context.newPage();
        const response = await page.goto(new URL(target.path, base).href);
        if (response?.status() !== target.status)
          throw new Error(
            `${target.path} answered ${response?.status()}, not ${target.status}`,
          );
        await page.evaluate(() => document.fonts.ready);
        await sweep(page, target, list, hits);
        if (flags.shots) await shots(page, target, shotWidths, flags.shots);
      } finally {
        await context.close();
      }
    }),
  );

  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  console.log(
    `${targets.length} pages × ${list.length} widths (${list[0]}–${list.at(-1)}px) in ${seconds} s`,
  );
  return [...hits.values()];
}

/** The widths a finding was seen at, as ranges of neighbours in the sweep: "1004–1270, 1600px". */
function ranges(seen: number[], list: number[]): string {
  const out: string[] = [];
  let start = seen[0];
  for (let i = 1; i <= seen.length; i++) {
    const prev = seen[i - 1];
    if (i < seen.length && list.indexOf(seen[i]) === list.indexOf(prev) + 1)
      continue;
    out.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = seen[i];
  }
  return `${out.join(", ")}px`;
}

function report(hits: Hit[], targets: Target[], list: number[]) {
  if (!hits.length) {
    console.log("No layout problems.");
    return;
  }
  for (const { path } of targets) {
    const found = hits.filter((h) => h.page === path);
    if (!found.length) continue;
    console.log(`\n${path}`);
    for (const h of found)
      console.log(
        `  ${h.kind.padEnd(10)} ${ranges(h.widths, list)}  ${h.selector}\n${" ".repeat(13)}${h.reason}`,
      );
  }
  console.log(
    `\n${hits.length} layout problem${hits.length === 1 ? "" : "s"}. Fix them, or add them to scripts/layout/allowed.ts with the reason they're fine.`,
  );
}

const server = flags.url
  ? undefined
  : await preview({
      root: fileURLToPath(ROOT),
      logLevel: "error",
      server: { host: "127.0.0.1", port: await freePort(), open: false },
    });
const base = flags.url ?? `http://127.0.0.1:${server!.port}`;
const targets = (await pages()).filter(
  (t) => !flags.page || flags.page.includes(t.path),
);
const list = await widths();
const browser = await chromium.launch();
try {
  const hits = await run(browser, base, targets, list);
  report(hits, targets, list);
  if (hits.length) process.exitCode = 1;
} finally {
  await browser.close();
  await server?.stop();
}
