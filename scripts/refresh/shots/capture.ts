// Takes a shot in Chromium: a still (PNG at twice the pixels) or a loop (frames from Chrome's screencast, with
// their times). Steps run first; then the page settles: network quiet, fonts and images loaded, carets hidden.

import type { BrowserContext, Page } from "playwright";
import type { ShotConfig } from "../../../src/lib/projects/schema.ts";
import { browser, DEVICES } from "../browser.ts";

type Step = NonNullable<ShotConfig["steps"]>[number];

/** WebP stops at 16,383 pixels a side; a full page longer than that is cut there. */
export const MAX_SIDE = 16_383;

export type Frame = { jpeg: Buffer; seconds: number };

/**
 * Random numbers from a fixed seed, so a page that draws something random (pass's password) looks the same each
 * week: the capture's hash stays the same and nothing new is uploaded.
 */
function seedRandom() {
  let s = 0x2f6b_4d1a;
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

async function runStep(page: Page, step: Step) {
  const timeout = 20_000;
  // Waiting for something can take longer: a loop may wait for a moment in a running video.
  const waitTimeout = 90_000;
  if ("goto" in step) await page.goto(step.goto, { waitUntil: "load" });
  else if ("click" in step)
    await page.locator(step.click).first().click({ timeout });
  else if ("fill" in step)
    await page.locator(step.fill).first().fill(step.value, { timeout });
  else if ("press" in step) await page.keyboard.press(step.press);
  else if ("wait" in step) await page.waitForTimeout(step.wait);
  else if ("waitFor" in step)
    await page
      .locator(step.waitFor)
      .first()
      .waitFor({ state: "visible", timeout: waitTimeout });
  else if ("scroll" in step) {
    if (typeof step.scroll === "number") await page.mouse.wheel(0, step.scroll);
    else
      await page
        .locator(step.scroll)
        .first()
        .scrollIntoViewIfNeeded({ timeout });
  } else if ("copy" in step) {
    const text = (
      await page.locator(step.copy).first().innerText({ timeout })
    ).trim();
    if (!text) throw new Error(`"${step.copy}" is empty, nothing to copy`);
    await page.locator(step.into).first().fill(text, { timeout });
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
  for (const [i, step] of (shot.steps ?? []).entries()) {
    try {
      await runStep(page, step);
    } catch (e) {
      const first = (e as Error).message.split("\n")[0];
      throw new Error(`step ${i + 1} (${describe(step)}): ${first}`, {
        cause: e,
      });
    }
  }
  if (shot.steps) await settle(page, quiet);
  return page;
}

/** A still PNG, at twice the CSS pixels. */
export async function captureStill(shot: ShotConfig): Promise<Buffer> {
  const context = await open(shot, false);
  try {
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
  } finally {
    await context.close();
  }
}

/** A loop: Chrome's screencast frames for `video.seconds`, from the moment the page (and its steps) are ready. */
export async function captureLoop(
  shot: ShotConfig,
): Promise<{ frames: Frame[]; width: number; height: number }> {
  const seconds = shot.video!.seconds;
  const { width, height } = DEVICES[shot.device].viewport;
  const context = await open(shot, true);
  try {
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
    await page.waitForTimeout(seconds * 1000);
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
  } finally {
    await context.close();
  }
}
