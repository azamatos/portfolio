// What the layout sweep (index.ts) lets pass, and why: each entry is a CSS selector, the checks it skips (checks.ts)
// and the reason. An element that matches the selector, or sits inside one that does, is skipped for those checks.

import type { Kind } from "./checks.ts";

export const ALLOWED: { selector: string; kinds: Kind[]; why: string }[] = [
  {
    // parts/Table.astro
    selector: ".scroll[role='region']",
    kinds: ["scroll"],
    why: "A table scrolls sideways in its own region when its column is narrower than the table's `minw` (the design: it scrolls on a phone).",
  },
  {
    // PageHead.astro
    selector: ".meta dd a",
    kinds: ["sticks-out"],
    why: "The head's links reach 2px above and below their line (margin -2px, padding 2px) for a 25px tap target, without moving the text.",
  },
];
