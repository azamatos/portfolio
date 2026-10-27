// Plays an element's entrance when it scrolls into view: the waffle's squares pop in, the bars grow, the big numbers
// count up. The HTML always holds the final state, so without JavaScript or with reduced motion nothing moves.
// The project page imports it once for all of them (src/pages/projects/[id].astro), so the build inlines it: three
// components importing it would make a shared script file, requested before the first paint.
//
//   data-reveal               on the element; the script sets it to "wait" (hidden, below the fold) and then "in"
//                             (animating), and the component's CSS keys its animation off those two values
//   data-count='{"to":14988,"decimals":0,"prefix":"","suffix":""}'
//                             on a number inside it, which counts from 0 to `to` when it's revealed
//
// A number's text never changes: find in page, reader views, translators and screen readers always get the real
// value. While it counts, data-counting makes that text transparent, and its aria-hidden `.shown` child draws the
// count over it from data-n (CSS generated content, which isn't page text).

type Count = { to: number; decimals: number; prefix: string; suffix: string };

const COUNT_MS = 1100;

function format(n: number, c: Count) {
  const digits = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: c.decimals,
    maximumFractionDigits: c.decimals,
  }).format(n);
  return c.prefix + digits + c.suffix;
}

const countOf = (el: HTMLElement): Count | undefined => {
  try {
    return JSON.parse(el.dataset.count ?? "") as Count;
  } catch {
    return undefined;
  }
};

/** Each number with its count and the element that draws it. */
function numbers(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>("[data-count]")].flatMap(
    (el) => {
      const c = countOf(el);
      const shown = el.querySelector<HTMLElement>(".shown");
      return c && shown ? [{ el, c, shown }] : [];
    },
  );
}

/** Shows `n` in place of the number, until `done`. */
const show = (el: HTMLElement, shown: HTMLElement, text: string) => {
  el.dataset.counting = "";
  shown.dataset.n = text;
};
const done = (el: HTMLElement) => delete el.dataset.counting;

function countUp(root: HTMLElement) {
  for (const { el, c, shown } of numbers(root)) {
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      if (t === 1) return done(el);
      show(el, shown, format(c.to * (1 - Math.pow(1 - t, 3)), c));
      requestAnimationFrame(step);
    };
    show(el, shown, format(0, c));
    requestAnimationFrame(step);
  }
}

function zero(root: HTMLElement) {
  for (const { el, c, shown } of numbers(root)) show(el, shown, format(0, c));
}

function reveal(el: HTMLElement) {
  el.dataset.reveal = "in";
  countUp(el);
}

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const elements = document.querySelectorAll<HTMLElement>("[data-reveal]");

if (!reduce && "IntersectionObserver" in window && elements.length) {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        reveal(e.target as HTMLElement);
      }
    },
    { threshold: 0.25 },
  );
  for (const el of elements) {
    if (el.dataset.reveal) continue; // already set up (the script ran once)
    const { top } = el.getBoundingClientRect();
    if (top < innerHeight * 0.9) {
      reveal(el); // in view at load: play now, from the first frame
    } else {
      el.dataset.reveal = "wait";
      zero(el);
      io.observe(el);
    }
  }
}
