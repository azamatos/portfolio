// Plays an element's entrance when it scrolls into view: the waffle's squares pop in, the bars grow, the big numbers
// count up. The HTML always holds the final state, so without JavaScript or with reduced motion nothing moves.
//
//   data-reveal               on the element; the script sets it to "wait" (hidden, below the fold) and then "in"
//                             (animating), and the component's CSS keys its animation off those two values
//   data-count='{"to":14988,"decimals":0,"prefix":"","suffix":""}'
//                             on a number inside it, which counts from 0 to `to` when it's revealed

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

/** Each number's text as the server wrote it, before `zero` replaces it. */
const finals = new WeakMap<HTMLElement, string | null>();

function countUp(root: HTMLElement) {
  for (const el of root.querySelectorAll<HTMLElement>("[data-count]")) {
    const c = countOf(el);
    if (!c) continue;
    const final = finals.has(el) ? finals.get(el)! : el.textContent;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      // The last frame prints the server's text, so the final value is exactly what the HTML had.
      el.textContent = t < 1 ? format(c.to * eased, c) : final;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}

function zero(root: HTMLElement) {
  for (const el of root.querySelectorAll<HTMLElement>("[data-count]")) {
    const c = countOf(el);
    if (!c) continue;
    finals.set(el, el.textContent);
    el.textContent = format(0, c);
  }
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
