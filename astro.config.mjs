// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { readdirSync, readFileSync } from "node:fs";
import { URL } from "node:url";

// The sitemap's lastmod: a project page changes with every refresh of its data (its numbers and "checked" day), and
// the home page shows those numbers too, so it takes the latest.
const COLLECTED = "./src/data/collected";
const refreshed = Object.fromEntries(
  readdirSync(COLLECTED)
    .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
    .map((f) => [
      `/projects/${f.slice(0, -".json".length)}/`,
      JSON.parse(readFileSync(`${COLLECTED}/${f}`, "utf8")).refreshedAt,
    ]),
);
const latest = Object.values(refreshed).sort().at(-1);

// https://astro.build/config
export default defineConfig({
  site: "https://azamatos.com",

  integrations: [
    sitemap({
      serialize(item) {
        const path = new URL(item.url).pathname;
        const lastmod = path === "/" ? latest : refreshed[path];
        return lastmod ? { ...item, lastmod } : item;
      },
    }),
  ],

  // The CSS is a few KB, so inline it on every page instead of a render-blocking file.
  build: {
    inlineStylesheets: "always",
  },

  server: {
    port: 4000,
    open: true,
  },

  fonts: [
    {
      provider: fontProviders.local(),
      name: "Geist",
      cssVariable: "--font-geist",
      fallbacks: ["sans-serif"],
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/Geist-Regular.woff2"],
            weight: 400,
            style: "normal",
          },
          {
            src: ["./src/assets/fonts/Geist-Medium.woff2"],
            weight: 500,
            style: "normal",
          },
        ],
      },
    },
    {
      provider: fontProviders.local(),
      name: "Space Mono",
      cssVariable: "--font-space-mono",
      fallbacks: ["monospace"],
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/SpaceMono-Regular.woff2"],
            weight: 400,
            style: "normal",
          },
        ],
      },
    },
  ],
});
