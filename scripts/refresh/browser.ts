// One Chromium for the whole run, started on first use: the screenshots, the loops and the share cards share it.

import { chromium, devices, type Browser } from "playwright";

let browserPromise: Promise<Browser> | undefined;

export function browser(): Promise<Browser> {
  browserPromise ??= chromium.launch();
  return browserPromise;
}

export async function closeBrowser() {
  if (browserPromise) await (await browserPromise).close();
  browserPromise = undefined;
}

/** The two devices a shot can use. Both render at twice the pixels, like the screens they're shown on. */
export const DEVICES = {
  desktop: {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  },
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: devices["Pixel 7"].userAgent,
  },
} as const;
