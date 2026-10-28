// Takes a shot in Chromium: a still (PNG at twice the pixels) or a loop (frames from Chrome's screencast, with
// their times). Steps run first; then the page settles: network quiet, fonts and images loaded, carets hidden. A
// capture that runs past its time limit has its browser context closed, which stops whatever it was waiting for.

import type { BrowserContext, Page } from "playwright";
import type { ShotConfig } from "../../../src/lib/projects/schema.ts";
import { browser, DEVICES } from "../browser.ts";

type Step = NonNullable<ShotConfig["steps"]>[number];

/** WebP stops at 16,383 pixels a side; a full page longer than that is cut there. */
export const MAX_SIDE = 16_383;

export type Frame = { jpeg: Buffer; seconds: number };

/**
 * Random numbers from a fixed seed, so a page that draws something random (pass's password) looks the same each
 * week: the capture's hash stays the same and nothing new is uploaded. The `restartRandom` step starts the numbers
 * over, so a loop that comes back to its first screen draws what it drew then.
 */
function seedRandom() {
  const SEED = 0x2f6b_4d1a;
  let s = SEED;
  Object.defineProperty(window, "__restartRandom", {
    value: () => {
      s = SEED;
    },
  });
  const next = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Math.random = next;
  const fill = <T extends ArrayBufferView | null>(array: T): T => {
    if (array) {
      const bytes = new Uint8Array(
        array.buffer,
        array.byteOffset,
        array.byteLength,
      );
      for (let i = 0; i < bytes.length; i++)
        bytes[i] = Math.floor(next() * 256);
    }
    return array;
  };
  crypto.getRandomValues = fill as typeof crypto.getRandomValues;
}

async function open(
  shot: ShotConfig,
  motion: boolean,
): Promise<BrowserContext> {
  const device = DEVICES[shot.device];
  const context = await (
    await browser()
  ).newContext({
    ...device,
    // Loops are recorded at the screen's own size: smaller frames keep the screencast smooth.
    deviceScaleFactor: motion ? 1 : device.deviceScaleFactor,
    colorScheme: shot.theme ?? "light",
    reducedMotion: motion ? "no-preference" : "reduce",
    locale: "en-GB",
    timezoneId: "UTC",
  });
  await context.addInitScript(seedRandom);
  return context;
}

/** Opens a context for the shot and runs `use` in it; past `limit` ms, closes the context and fails. */
async function withContext<T>(
  shot: ShotConfig,
  motion: boolean,
  limit: number,
  use: (context: BrowserContext) => Promise<T>,
): Promise<T> {
  const context = await open(shot, motion);
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`the capture took longer than ${limit / 1000} s`));
      context.close().catch(() => {});
    }, limit);
  });
  try {
    return await Promise.race([use(context), timeout]);
  } finally {
    clearTimeout(timer);
    await context.close().catch(() => {});
  }
}

/**
 * CSS for the rest of the shot. A constructed sheet, since a page's CSP can block a <style> element; it belongs to
 * the document, so it stays through a client-side router's page changes. CSS with no rule the browser accepts fails.
 */
async function addStyle(page: Page, css: string) {
  await page.evaluate((css) => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    if (!sheet.cssRules.length)
      throw new Error("the CSS has no rule the browser accepts");
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  }, css);
}

async function runStep(page: Page, step: Step) {
  const timeout = 20_000;
  // Waiting for something can take longer: a loop may wait for a moment in a running video.
  const waitTimeout = 90_000;
  if ("click" in step)
    await page.locator(step.click).first().click({ timeout });
  else if ("fill" in step)
    await page.locator(step.fill).first().fill(step.value, { timeout });
  else if ("waitFor" in step)
    await page
      .locator(step.waitFor)
      .first()
      .waitFor({ state: "visible", timeout: waitTimeout });
  else if ("copy" in step) {
    const text = (
      await page.locator(step.copy).first().innerText({ timeout })
    ).trim();
    if (!text) throw new Error(`"${step.copy}" is empty, nothing to copy`);
    await page.locator(step.into).first().fill(text, { timeout });
  } else if ("hide" in step) {
    // A style rule rather than the elements' own style: it also hides what the page adds later (a notice that shows
    // once a check finishes). A selector that isn't CSS leaves the rule out, and the step fails.
    await addStyle(page, `${step.hide} { display: none !important; }`);
  } else if ("style" in step) await addStyle(page, step.style);
  else if ("follow" in step) {
    // A click on a link that isn't on screen: the page's router, if it has one, takes it like any other.
    const href = new URL(step.follow, page.url()).href;
    await page.evaluate((href) => {
      const a = document.createElement("a");
      a.href = href;
      document.body.append(a);
      a.click();
      a.remove();
    }, href);
    await page.waitForURL(href, { timeout });
  } else if ("wait" in step) await page.waitForTimeout(step.wait * 1000);
  else if ("restartRandom" in step)
    await page.evaluate(() =>
      (window as unknown as { __restartRandom: () => void }).__restartRandom(),
    );
}

async function runSteps(page: Page, steps: Step[], during = "") {
  for (const [i, step] of steps.entries()) {
    try {
      await runStep(page, step);
    } catch (e) {
      const first = (e as Error).message.split("\n")[0];
      throw new Error(`${during}step ${i + 1} (${describe(step)}): ${first}`, {
        cause: e,
      });
    }
  }
}

const describe = (step: Step) =>
  Object.entries(step)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join(", ");

/**
 * Network quiet (or 15 s), web fonts in, images on screen decoded (or 10 s). A loop doesn't wait for the network:
 * a page that plays video never goes quiet, and the time would come out of the loop.
 */
async function settle(page: Page, quiet = true) {
  await page.waitForLoadState("load");
  if (quiet)
    await page
      .waitForLoadState("networkidle", { timeout: 15_000 })
      .catch(() => {});
  await page.evaluate(async () => {
    const onScreen = (img: HTMLImageElement) => {
      const r = img.getBoundingClientRect();
      return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
    };
    const ready = Promise.all([
      document.fonts.ready,
      // A lazy image off screen never loads, so only the ones in view are waited for.
      ...[...document.images]
        .filter(onScreen)
        .map((img) => img.decode().catch(() => undefined)),
    ]);
    await Promise.race([ready, new Promise((r) => setTimeout(r, 10_000))]);
  });
}

/** Scrolls to the bottom and back, so lazy images and on-scroll content load before a full-page capture. */
async function wakeWholePage(page: Page) {
  await page.evaluate(async () => {
    const step = Math.max(400, window.innerHeight / 2);
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
}

async function prepare(
  context: BrowserContext,
  shot: ShotConfig,
  quiet: boolean,
): Promise<Page> {
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(60_000);
  const res = await page.goto(shot.url, { waitUntil: "load" });
  if (res && !res.ok()) throw new Error(`${shot.url} answered ${res.status()}`);
  await settle(page, quiet);
  await runSteps(page, shot.steps ?? []);
  if (shot.steps) await settle(page, quiet);
  return page;
}

/** A still PNG, at twice the CSS pixels, or an error after `limit` ms. */
export function captureStill(shot: ShotConfig, limit: number): Promise<Buffer> {
  return withContext(shot, false, limit, async (context) => {
    const page = await prepare(context, shot, true);
    if (shot.full) {
      await wakeWholePage(page);
      await settle(page);
    }
    const scale = DEVICES[shot.device].deviceScaleFactor;
    const height = await page.evaluate(
      () => document.documentElement.scrollHeight,
    );
    const width = DEVICES[shot.device].viewport.width;
    const tooTall = shot.full && height * scale > MAX_SIDE;
    return await page.screenshot({
      type: "png",
      animations: "disabled",
      caret: "hide",
      fullPage: shot.full === true,
      clip: tooTall
        ? { x: 0, y: 0, width, height: Math.floor(MAX_SIDE / scale) }
        : undefined,
    });
  });
}

/**
 * A loop: Chrome's screencast frames for `video.seconds`, from the moment the page (and its steps) are ready, or an
 * error after `limit` ms. The loop's own steps (`video.steps`) run while it records and must end in that time.
 */
export function captureLoop(
  shot: ShotConfig,
  limit: number,
): Promise<{ frames: Frame[]; width: number; height: number }> {
  const seconds = shot.video!.seconds;
  const { width, height } = DEVICES[shot.device].viewport;
  return withContext(shot, true, limit, async (context) => {
    const page = await prepare(context, shot, false);
    const cdp = await context.newCDPSession(page);
    const raw: { jpeg: Buffer; t: number }[] = [];
    cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
      raw.push({
        jpeg: Buffer.from(data, "base64"),
        t: metadata.timestamp ?? Date.now() / 1000,
      });
      cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: 95,
      maxWidth: width,
      maxHeight: height,
      everyNthFrame: 1,
    });
    const start = Date.now() / 1000;
    await runSteps(page, shot.video!.steps ?? [], "during the loop, ");
    const left = start + seconds - Date.now() / 1000;
    if (left < 0)
      throw new Error(
        `the loop's steps took ${(seconds - left).toFixed(1)} s, longer than its ${seconds} s`,
      );
    await page.waitForTimeout(left * 1000);
    await cdp.send("Page.stopScreencast");
    if (raw.length < 2)
      throw new Error(`the screencast gave ${raw.length} frames`);
    // Each frame lasts until the next one; the last one until the end of the loop.
    const t0 = Math.max(raw[0].t, start - 0.001);
    const frames = raw.map((f, i) => ({
      jpeg: f.jpeg,
      seconds: Math.max(
        0,
        (i + 1 < raw.length ? raw[i + 1].t : t0 + seconds) - Math.max(f.t, t0),
      ),
    }));
    return { frames: frames.filter((f) => f.seconds > 0), width, height };
  });
}
