// What the layout sweep (index.ts) looks for in a page at one width. `findProblems` runs in the page: Playwright
// sends its source to page.evaluate, so it uses nothing from outside its own body.
//
//   overflow    the page scrolls sideways: something reaches past the edge of the viewport
//   scroll      a box whose content scrolls inside it (sideways or down)
//   sticks-out  a box reaches past its parent's box, or its parent cuts it off (an absolutely placed box is placed on
//               purpose and isn't checked)
//   text        text runs past the edge of its box, or a box around it cuts it off (an ellipsis is on purpose)
//   wrap        a row of like siblings that wrapped badly: a connector (an arrow, a dot) with nothing on one side of
//               it, the last row's items stretched much wider than the ones above, or one item alone on the last row
//               of a grid
//   overlap     two sibling boxes over each other
//   target      on a phone, a link or button under 24×24px with another one within 24px of its centre (WCAG 2.5.8;
//               a link inside a sentence is exempt)
//
// An element that matches an allowed selector (allowed.ts) for a kind, or sits inside one, is skipped for it.

export type Kind =
  | "overflow"
  | "scroll"
  | "sticks-out"
  | "text"
  | "wrap"
  | "overlap"
  | "target";

export interface Finding {
  kind: Kind;
  selector: string;
  reason: string;
}

export interface Options {
  allowed: { selector: string; kinds: Kind[] }[];
  /** A phone's width (800px and narrower): tap targets are checked. */
  phone: boolean;
}

export async function findProblems({
  allowed,
  phone,
}: Options): Promise<Finding[]> {
  // Two frames, so the last resize is laid out.
  await new Promise((done) =>
    requestAnimationFrame(() => requestAnimationFrame(done)),
  );

  /** px: what rounding can account for. */
  const SLACK = 1;
  const MIN_TARGET = 24;
  /** A connector is an aria-hidden arrow or dot between the items of a row: an icon or one of these. */
  const CONNECTOR = /^[→←↑↓·•|/›»⟶]$/;

  const vw = document.documentElement.clientWidth;
  const findings: Finding[] = [];

  const styles = new Map<Element, CSSStyleDeclaration>();
  const style = (el: Element) => {
    let s = styles.get(el);
    if (!s) styles.set(el, (s = getComputedStyle(el)));
    return s;
  };
  const rects = new Map<Element, DOMRect>();
  const rect = (el: Element) => {
    let r = rects.get(el);
    if (!r) rects.set(el, (r = el.getBoundingClientRect()));
    return r;
  };
  const px = (n: number) => Math.round(n);

  const shown = (el: Element) => {
    const r = rect(el);
    return (
      r.width > 1 &&
      r.height > 1 &&
      el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    );
  };
  const SKIP = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "BR"]);
  const all = [...document.body.querySelectorAll("*")].filter(
    (el) =>
      !SKIP.has(el.tagName) &&
      !(el instanceof SVGElement && !(el instanceof SVGSVGElement)) &&
      shown(el),
  );
  const visible = new Set(all);

  const inFlow = (el: Element) =>
    !["absolute", "fixed"].includes(style(el).position);
  const inline = (el: Element) =>
    ["inline", "contents"].includes(style(el).display);
  const lays = (el: Element) =>
    ["flex", "inline-flex", "grid", "inline-grid"].includes(style(el).display);
  /** The box an element is laid out in (past display: contents). */
  const parentBox = (el: Element) => {
    let p = el.parentElement;
    while (p && style(p).display === "contents") p = p.parentElement;
    return p && p !== document.body && p !== document.documentElement
      ? p
      : null;
  };
  const scrolls = (overflow: string) => ["auto", "scroll"].includes(overflow);

  /** The padding box (inside the borders), or the content box. */
  const inner = (el: Element, content = false) => {
    const r = rect(el);
    const s = style(el);
    const n = (v: string) => parseFloat(v) || 0;
    const pad = content ? 1 : 0;
    return {
      left: r.left + n(s.borderLeftWidth) + pad * n(s.paddingLeft),
      right: r.right - n(s.borderRightWidth) - pad * n(s.paddingRight),
      top: r.top + n(s.borderTopWidth) + pad * n(s.paddingTop),
      bottom: r.bottom - n(s.borderBottomWidth) - pad * n(s.paddingBottom),
    };
  };

  /** A short CSS selector: up to four steps, from an id or the section it's in. */
  const selectorOf = (el: Element): string => {
    const steps: string[] = [];
    let e: Element | null = el;
    for (; e && e !== document.body && steps.length < 4; e = e.parentElement) {
      if (e.id) {
        steps.unshift(`#${CSS.escape(e.id)}`);
        return steps.join(" > ");
      }
      const self: Element = e;
      const classes = [...self.classList].slice(0, 2);
      let step = self.tagName.toLowerCase();
      if (classes.length)
        step += `.${classes.map((c) => CSS.escape(c)).join(".")}`;
      // Numbered when a sibling has the same tag and classes.
      const sameTag = [...(self.parentElement?.children ?? [])].filter(
        (k) => k.tagName === self.tagName,
      );
      const twins = sameTag.filter((k) =>
        classes.every((c) => k.classList.contains(c)),
      );
      if (twins.length > 1)
        step += `:nth-of-type(${sameTag.indexOf(self) + 1})`;
      steps.unshift(step);
    }
    const from = e?.closest("[id], section[aria-labelledby], header, footer");
    const at = !from
      ? ""
      : from.id
        ? `#${CSS.escape(from.id)}`
        : from.hasAttribute("aria-labelledby")
          ? `section[aria-labelledby="${from.getAttribute("aria-labelledby")}"]`
          : from.tagName.toLowerCase();
    return [at, steps.join(" > ")].filter(Boolean).join(" ");
  };

  const add = (kind: Kind, el: Element, reason: string) => {
    if (allowed.some((a) => a.kinds.includes(kind) && el.closest(a.selector)))
      return;
    findings.push({ kind, selector: selectorOf(el), reason });
  };

  // overflow: whatever reaches past the viewport, unless a box inside the page clips or scrolls it (the checks below
  // have those).
  const clippedX = (el: Element) => {
    for (let a = parentBox(el); a; a = parentBox(a))
      if (style(a).overflowX !== "visible") return true;
    return false;
  };
  const past = new Set(
    all.filter((el) => {
      if (style(el).position === "fixed") return false;
      const r = rect(el);
      return (r.right > vw + SLACK || r.left < -SLACK) && !clippedX(el);
    }),
  );
  for (const el of past) {
    let outer = false;
    for (let a = el.parentElement; a && !outer; a = a.parentElement)
      outer = past.has(a);
    if (outer) continue;
    const r = rect(el);
    add(
      "overflow",
      el,
      r.left < -SLACK
        ? `starts ${px(-r.left)}px left of the page`
        : `ends at ${px(r.right)}px, past the ${vw}px page`,
    );
  }
  const pageWidth = document.documentElement.scrollWidth;
  if (pageWidth > vw && past.size === 0)
    add(
      "overflow",
      document.documentElement,
      `the page is ${pageWidth}px wide in a ${vw}px viewport`,
    );

  // scroll: a box that scrolls, and has more content than it shows.
  for (const el of all) {
    const s = style(el);
    const x = scrolls(s.overflowX) ? el.scrollWidth - el.clientWidth : 0;
    const y = scrolls(s.overflowY) ? el.scrollHeight - el.clientHeight : 0;
    if (x > SLACK)
      add(
        "scroll",
        el,
        `scrolls sideways: ${x}px more than its ${el.clientWidth}px`,
      );
    else if (y > SLACK)
      add(
        "scroll",
        el,
        `scrolls down: ${y}px more than its ${el.clientHeight}px`,
      );
  }

  // sticks-out: an in-flow box past its parent's, sideways or down (one that scrolls it is the scroll check's).
  for (const el of all) {
    if (!inFlow(el) || inline(el)) continue;
    const p = parentBox(el);
    if (!p || inline(p)) continue;
    const r = rect(el);
    const box = rect(p);
    const ps = style(p);
    const x = Math.max(box.left - r.left, r.right - box.right);
    const y = Math.max(box.top - r.top, r.bottom - box.bottom);
    const axis = x > SLACK ? "x" : y > SLACK ? "y" : null;
    if (!axis) continue;
    const overflow = axis === "x" ? ps.overflowX : ps.overflowY;
    if (scrolls(overflow)) continue;
    const by = px(axis === "x" ? x : y);
    add(
      "sticks-out",
      el,
      overflow === "visible"
        ? `sticks out of ${selectorOf(p)} by ${by}px`
        : `is cut off by ${selectorOf(p)} (${by}px)`,
    );
  }

  // text: each text's lines against its block's content box, and against every box around it that clips.
  const range = document.createRange();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textDone = new Set<Element>();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent?.trim();
    const parent = n.parentElement;
    if (!text || !parent || !visible.has(parent)) continue;
    let block: Element = parent;
    while (inline(block) && block.parentElement) block = block.parentElement;
    if (textDone.has(block) || !visible.has(block)) continue;
    range.selectNodeContents(n);
    const lines = [...range.getClientRects()].filter((l) => l.width > 0);
    if (!lines.length) continue;
    const t = {
      left: Math.min(...lines.map((l) => l.left)),
      right: Math.max(...lines.map((l) => l.right)),
      top: Math.min(...lines.map((l) => l.top)),
      bottom: Math.max(...lines.map((l) => l.bottom)),
    };
    const quote = `“${text.length > 32 ? `${text.slice(0, 30)}…` : text}”`;
    const ellipsis = (a: Element) =>
      style(a).textOverflow === "ellipsis" ||
      style(block).textOverflow === "ellipsis";

    const box = inner(block, true);
    const x = Math.max(box.left - t.left, t.right - box.right);
    if (x > SLACK && !ellipsis(block)) {
      textDone.add(block);
      add("text", block, `${quote} runs ${px(x)}px past its box`);
      continue;
    }
    // The glyphs' boxes can be taller than the line (a line-height under 1.2): only what's past that is cut off.
    const lineHeight = parseFloat(style(parent).lineHeight);
    const lead = lineHeight
      ? Math.max(0, (lines[0].height - lineHeight) / 2)
      : 0;
    for (let a: Element | null = block; a; a = parentBox(a)) {
      const s = style(a);
      if (s.overflowX === "visible" && s.overflowY === "visible") continue;
      const clip = inner(a);
      const cutX =
        s.overflowX !== "visible" &&
        !ellipsis(a) &&
        (t.left < clip.left - SLACK || t.right > clip.right + SLACK);
      const cutY =
        s.overflowY !== "visible" &&
        s.webkitLineClamp === "none" &&
        (t.top < clip.top - lead - SLACK ||
          t.bottom > clip.bottom + lead + SLACK);
      if (!cutX && !cutY) continue;
      // Text a box scrolls to is still there to read (the scroll check has the box).
      if (scrolls(cutX ? s.overflowX : s.overflowY)) break;
      textDone.add(block);
      add("text", block, `${quote} is cut off by ${selectorOf(a)}`);
      break;
    }
  }

  // wrap: connectors, and rows of like siblings.
  const isConnector = (el: Element) => {
    if (el.getAttribute("aria-hidden") !== "true") return false;
    if (el.closest("a, button, summary, label, [role='button']")) return false;
    const text = el.textContent?.trim() ?? "";
    return text ? CONNECTOR.test(text) : !!el.querySelector("svg");
  };
  const glyphBox = (el: Element) => {
    const svg = el.querySelector("svg");
    if (svg) return rect(svg);
    range.selectNodeContents(el);
    return range.getBoundingClientRect();
  };
  const boxesIn = (el: Element, not: Element) =>
    [...el.children]
      .filter((k) => k !== not && visible.has(k) && !isConnector(k))
      .map(rect);
  for (const c of all) {
    if (!isConnector(c)) continue;
    const g = glyphBox(c);
    if (g.width > 40 || g.height > 40) continue;
    // Between the items of a row (its parent lays them out), or the first or last thing in an item of one.
    const item = c.parentElement;
    const row = item?.parentElement;
    if (!item) continue;
    let boxes: DOMRect[];
    if (lays(item) && boxesIn(item, c).length >= 2) boxes = boxesIn(item, c);
    else if (row && lays(row)) {
      const kids = [...item.children].filter((k) => visible.has(k));
      if (c !== kids[0] && c !== kids.at(-1)) continue;
      boxes = [...boxesIn(item, c), ...boxesIn(row, item)];
    } else continue;
    const sameLine = (b: DOMRect) => b.top < g.bottom && b.bottom > g.top;
    const sameColumn = (b: DOMRect) => b.left < g.right && b.right > g.left;
    const before = boxes.some((b) => b.right <= g.left + 2 && sameLine(b));
    const after = boxes.some((b) => b.left >= g.right - 2 && sameLine(b));
    const above = boxes.some((b) => b.bottom <= g.top + 2 && sameColumn(b));
    const below = boxes.some((b) => b.top >= g.bottom - 2 && sameColumn(b));
    if ((before && after) || (above && below)) continue;
    add(
      "wrap",
      c,
      before
        ? "a connector that ends its line: nothing after it"
        : after
          ? "a connector that starts its line: nothing before it"
          : "a connector with nothing on either side",
    );
  }

  const median = (ns: number[]) =>
    [...ns].sort((a, b) => a - b)[Math.floor(ns.length / 2)];
  for (const c of all) {
    const s = style(c);
    const flex =
      s.display.endsWith("flex") &&
      s.flexWrap !== "nowrap" &&
      s.flexDirection.startsWith("row");
    const grid = s.display.endsWith("grid");
    if (!flex && !grid) continue;
    const items = [...c.children].filter((k) => visible.has(k) && inFlow(k));
    if (items.length < 3 || items.some((k) => k.tagName !== items[0].tagName))
      continue;
    // Items that don't grow (chips, say) are as wide as their content, wherever they wrap.
    const grows = items.every((k) => parseFloat(style(k).flexGrow) > 0);
    // Rows: an item that starts below the bottom of the row so far starts the next one.
    const rows: Element[][] = [];
    let bottom = -Infinity;
    for (const k of [...items].sort((a, b) => rect(a).top - rect(b).top)) {
      const r = rect(k);
      if (r.top >= bottom - SLACK) {
        rows.push([]);
        bottom = r.bottom;
      } else bottom = Math.max(bottom, r.bottom);
      rows.at(-1)!.push(k);
    }
    const last = rows.at(-1)!;
    const full = rows.slice(0, -1).flat();
    if (rows.length < 2 || rows[0].length < 2 || last.length >= rows[0].length)
      continue;
    const usual = median(full.map((k) => rect(k).width));
    const narrowest = Math.min(...last.map((k) => rect(k).width));
    if (flex && grows && narrowest > usual * 1.4)
      add(
        "wrap",
        last[0],
        `${last.length === 1 ? "alone" : `${last.length} items`} on the last row, stretched to ${px(narrowest)}px where the ${full.length} above are ${px(usual)}px`,
      );
    else if (grid && last.length === 1)
      add(
        "wrap",
        last[0],
        `alone on the last row of a ${rows[0].length}-column grid`,
      );
  }

  // overlap: in-flow sibling boxes.
  for (const p of all) {
    const kids = [...p.children].filter(
      (k) => visible.has(k) && inFlow(k) && !inline(k),
    );
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++) {
        const a = rect(kids[i]);
        const b = rect(kids[j]);
        const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (x > SLACK && y > SLACK)
          add(
            "overlap",
            kids[i],
            `overlaps ${selectorOf(kids[j])} by ${px(x)}×${px(y)}px`,
          );
      }
  }

  // target: WCAG 2.5.8 on a phone. An undersized target passes if a 24px circle on its centre touches no other
  // target (nor the circle of another undersized one), or if it's a link inside a sentence.
  if (phone) {
    const targets = all.filter(
      (el) =>
        el.matches(
          "a[href], button, input:not([type='hidden']), select, textarea, summary, [role='button'], [tabindex]:not([tabindex='-1'])",
        ) && !el.closest("[inert]"),
    );
    const small = (r: DOMRect) =>
      r.width < MIN_TARGET - 0.5 || r.height < MIN_TARGET - 0.5;
    const centre = (r: DOMRect) => ({
      x: (r.left + r.right) / 2,
      y: (r.top + r.bottom) / 2,
    });
    const inSentence = (el: Element) => {
      if (style(el).display !== "inline") return false;
      let block: Element = el;
      while (inline(block) && block.parentElement) block = block.parentElement;
      return (
        (block.textContent?.trim().length ?? 0) >
        (el.textContent?.trim().length ?? 0)
      );
    };
    for (const t of targets) {
      const r = rect(t);
      if (!small(r) || inSentence(t)) continue;
      const c = centre(r);
      const near = targets.find((o) => {
        if (o === t || o.contains(t) || t.contains(o)) return false;
        const b = rect(o);
        if (small(b)) {
          const d = centre(b);
          return Math.hypot(d.x - c.x, d.y - c.y) < MIN_TARGET;
        }
        const dx = Math.max(b.left - c.x, 0, c.x - b.right);
        const dy = Math.max(b.top - c.y, 0, c.y - b.bottom);
        return Math.hypot(dx, dy) < MIN_TARGET / 2;
      });
      if (near)
        add(
          "target",
          t,
          `${px(r.width)}×${px(r.height)}px, under 24×24, with ${selectorOf(near)} too close`,
        );
    }
  }

  return findings;
}
