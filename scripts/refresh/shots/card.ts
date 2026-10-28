// The share cards (og:image), 1200 × 630: plain HTML with inline styles and flexbox, in the frame language of the
// owner's og-source.html, rendered by Chromium. The site's card has the owner's name, role and photo (round, in a
// ring); a project's card has its name, status, headline and two numbers, and its hero screenshot in a browser frame.
// Fonts come from src/assets/fonts, the photo from src/assets/photo.jpg (the resume's, 328 × 328, shown at about its
// own size) and the wave from public/hero.svg, inlined, so the HTML is the card's whole input: og.ts names the file
// after a hash of it.

import { readFile } from "node:fs/promises";
import { browser } from "../browser.ts";
import { ROOT } from "../config.ts";

export const CARD = { width: 1200, height: 630 } as const;

/** The browser frame's screen on a project card: the hero screenshot is resized to exactly this, from its top. */
export const SCREEN = { width: 598, height: 374 } as const;
/** Stands in for the screenshot's data URL until the card is rendered, so the hash covers the HTML without it. */
export const SHOT_SRC = "about:shot";

export type SiteCard = {
  name: string;
  role: string;
  line: string;
  email: string;
  availability: string;
};

export type ProjectCard = {
  name: string;
  headline: string;
  live: boolean;
  status: string;
  host: string;
  accent: string;
  /** A mockup, not the live site: tagged "design" in the frame, like the page does. */
  design: boolean;
  numbers: { value: string; label: string }[];
};

const MINT = "#68edc0";
const AMBER = "#f2c14e";
const MONO = "'Space Mono', monospace";

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const file = (path: string) => readFile(new URL(path, ROOT));
const dataUrl = async (path: string, type: string) =>
  `data:${type};base64,${(await file(path)).toString("base64")}`;

async function head(): Promise<string> {
  const face = async (family: string, weight: number, name: string) =>
    `@font-face{font-family:'${family}';font-weight:${weight};src:url(${await dataUrl(`src/assets/fonts/${name}`, "font/woff2")}) format('woff2')}`;
  const faces = await Promise.all([
    face("Geist", 400, "Geist-Regular.woff2"),
    face("Geist", 500, "Geist-Medium.woff2"),
    face("Space Mono", 400, "SpaceMono-Regular.woff2"),
  ]);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>${faces.join("")}body{margin:0}*{box-sizing:border-box}</style></head>`;
}

const arrow = (size: number, color: string) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" style="display:block;flex:none"><path d="M5 16h19M17 9l7 7-7 7" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** `→ ~ azamatos▮`, top left on both cards. */
const mark = `<div style="position:absolute;left:64px;top:50px;display:flex;align-items:center;gap:14px;font-family:${MONO};font-size:28px;line-height:1;letter-spacing:-0.01em">${arrow(26, MINT)}<span style="color:#5bc8c0">~</span><span style="color:#f0f4f3">azamatos</span><span style="width:16px;height:32px;margin-left:-10px;background:${MINT}"></span></div>`;

const wave = async (style: string) =>
  `<img src="${await dataUrl("public/hero.svg", "image/svg+xml")}" alt="" style="position:absolute;${style};filter:grayscale(1) invert(1)">`;

const dot = (color: string, size = 8) =>
  `<span style="width:${size}px;height:${size}px;border-radius:50%;background:${color};flex:none"></span>`;

const page = (body: string) =>
  `<body><div style="position:relative;width:${CARD.width}px;height:${CARD.height}px;overflow:hidden;background:#010101;color:#fff;font-family:Geist,sans-serif">${body}</div></body></html>`;

export async function siteCardHtml(c: SiteCard): Promise<string> {
  const photo = await dataUrl("src/assets/photo.jpg", "image/jpeg");
  return (
    (await head()) +
    page(
      (await wave(
        "left:-420px;top:250px;width:1300px;height:460px;opacity:0.45",
      )) +
        mark +
        `<div style="position:absolute;right:64px;top:41px;display:flex;align-items:center;gap:10px;height:46px;padding:0 18px;border:1px solid rgba(255,255,255,0.14);border-radius:12px;background:rgba(255,255,255,0.03);font-size:18px;color:#e6e6e6"><svg width="18" height="18" viewBox="0 0 24 24" style="display:block"><rect x="3" y="5" width="18" height="14" rx="2.5" fill="none" stroke="#a6a6a6" stroke-width="1.8"/><path d="m4 7 8 6 8-6" fill="none" stroke="#a6a6a6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>${esc(c.email)}</div>` +
        `<div style="position:absolute;left:64px;top:150px;width:496px;display:flex;flex-direction:column;gap:22px"><p style="margin:0;font-family:${MONO};font-size:16px;letter-spacing:0.1em;text-transform:uppercase;color:${MINT}">${esc(c.role)}</p><h1 style="margin:0;font-size:66px;font-weight:500;line-height:1.02;letter-spacing:-0.05em">${esc(c.name)}</h1><p style="margin:0;font-size:24px;line-height:1.38;letter-spacing:-0.015em;color:#a6a6a6">${esc(c.line)}</p></div>` +
        `<div style="position:absolute;left:770px;top:140px;display:flex;width:340px;height:340px;padding:6px;border:1px solid rgba(255,255,255,0.14);border-radius:50%;background:#0b0c0e"><img src="${photo}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover"></div>` +
        `<div style="position:absolute;left:64px;bottom:44px;display:flex;align-items:center;gap:12px;height:40px;padding:0 18px 0 14px;border:1px solid rgba(255,255,255,0.14);border-radius:999px;background:#0a0a0b;font-size:15px;letter-spacing:-0.01em;color:#c4c4c4;white-space:nowrap"><span style="width:10px;height:10px;border-radius:50%;background:${MINT};box-shadow:0 0 0 4px rgba(104,237,192,0.18)"></span>${esc(c.availability)}</div>`,
    )
  );
}

export async function projectCardHtml(c: ProjectCard): Promise<string> {
  const status = c.live ? MINT : AMBER;
  const numbers = c.numbers
    .map(
      (n) =>
        `<div style="display:flex;flex-direction:column;gap:8px"><span style="font-size:44px;font-weight:500;line-height:1;letter-spacing:-0.045em;color:#fff;white-space:nowrap">${esc(n.value)}</span><span style="font-size:17px;line-height:1.2;color:#a6a6a6;white-space:nowrap">${esc(n.label)}</span></div>`,
    )
    .join("");
  const tag = c.design
    ? `<span style="position:absolute;right:14px;padding:2px 10px;border:1px solid rgba(242,193,78,0.4);border-radius:999px;font-family:${MONO};font-size:13px;line-height:1.5;color:${AMBER}">design</span>`
    : "";
  const frameWidth = SCREEN.width + 2;
  return (
    (await head()) +
    page(
      (await wave(
        "left:-460px;top:300px;width:1300px;height:460px;opacity:0.3",
      )) +
        `<div style="position:absolute;left:${1136 - frameWidth - 80}px;top:60px;width:${frameWidth + 160}px;height:560px;background:radial-gradient(closest-side,${c.accent}38,transparent)"></div>` +
        mark +
        `<div style="position:absolute;left:64px;top:144px;width:430px;display:flex;flex-direction:column;align-items:flex-start;gap:24px"><span style="display:flex;align-items:center;gap:10px;padding:6px 16px 6px 14px;border:1px solid ${status}66;border-radius:999px;font-family:${MONO};font-size:15px;line-height:1.5;color:${status}">${dot(status)}${esc(c.status)}</span><h1 style="margin:0;font-size:84px;font-weight:500;line-height:1;letter-spacing:-0.055em">${esc(c.name)}</h1><p style="margin:0;font-size:27px;line-height:1.34;letter-spacing:-0.02em;color:#a6a6a6;text-wrap:balance">${esc(c.headline)}</p></div>` +
        `<div style="position:absolute;left:64px;bottom:52px;display:flex;gap:44px">${numbers}</div>` +
        `<div style="position:absolute;right:64px;top:128px;width:${frameWidth}px;display:flex;flex-direction:column;overflow:hidden;border:1px solid ${c.accent}59;border-radius:16px;background:#0b0c0e;box-shadow:0 40px 120px rgba(0,0,0,0.5)"><div style="position:relative;display:flex;align-items:center;justify-content:center;height:40px;border-bottom:1px solid rgba(255,255,255,0.08)"><div style="position:absolute;left:16px;display:flex;gap:7px">${dot("#2a2c30", 10).repeat(3)}</div><span style="display:flex;align-items:center;gap:8px;padding:3px 14px;border-radius:6px;background:rgba(255,255,255,0.05);font-family:${MONO};font-size:13px;line-height:1.5;color:#a6a6a6">${arrow(13, c.accent)}${esc(c.host)}</span>${tag}</div><img src="${SHOT_SRC}" alt="" width="${SCREEN.width}" height="${SCREEN.height}" style="display:block"></div>`,
    )
  );
}

/** The card as a PNG at 1:1: the size link previews ask for. */
export async function renderCard(html: string): Promise<Buffer> {
  const page = await (
    await browser()
  ).newPage({
    viewport: { width: CARD.width, height: CARD.height },
    deviceScaleFactor: 1,
  });
  try {
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({ type: "png" });
  } finally {
    await page.close();
  }
}
