// `measure` values, taken on the live URL: the compressed JavaScript a page loads, or its Lighthouse performance
// score. Lighthouse runs through `pnpm dlx` on Playwright's Chromium, so it isn't a dependency of the site.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { browser, chromiumPath, DEVICES } from "../browser.ts";
import type { Def, Reading } from "./types.ts";

const LIGHTHOUSE = "lighthouse@13.5.0";

/** Bytes over the network (compressed) of every script a phone loads for `url`, until the network is quiet. */
async function jsBytes(url: string): Promise<number> {
  const context = await (await browser()).newContext({ ...DEVICES.phone });
  try {
    const page = await context.newPage();
    const sizes: Promise<number>[] = [];
    page.on("requestfinished", (req) => {
      if (req.resourceType() === "script")
        sizes.push(req.sizes().then((s) => s.responseBodySize));
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
    return (await Promise.all(sizes)).reduce((a, b) => a + b, 0);
  } finally {
    await context.close();
  }
}

/** Lighthouse's performance score, 0–100, with its default phone settings. */
async function lighthouse(url: string): Promise<number> {
  const { stdout } = await promisify(execFile)(
    "pnpm",
    [
      "dlx",
      LIGHTHOUSE,
      url,
      "--only-categories=performance",
      "--output=json",
      "--quiet",
      "--chrome-flags=--headless=new --no-sandbox",
    ],
    {
      env: { ...process.env, CHROME_PATH: chromiumPath() },
      maxBuffer: 64 * 1024 * 1024,
      timeout: 180_000,
    },
  );
  const report = JSON.parse(stdout) as {
    categories: { performance: { score: number | null } };
    runtimeError?: { message: string };
  };
  const score = report.categories.performance.score;
  if (score === null)
    throw new Error(
      `Lighthouse gave no score for ${url}${report.runtimeError ? `: ${report.runtimeError.message}` : ""}`,
    );
  return Math.round(score * 100);
}

export async function readMeasure(def: Def<"measure">): Promise<Reading> {
  const value =
    def.metric === "jsBytes"
      ? await jsBytes(def.url)
      : await lighthouse(def.url);
  return { value, source: def.url, asOf: new Date().toISOString() };
}
