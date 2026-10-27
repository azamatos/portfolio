// The site theme: system (default), dark or light. The choice lives in data-theme on <html> and in localStorage;
// BaseLayout's inline script applies a saved choice before first paint (themeInitScript below).
//
// Used by the footer switch (ThemeSwitch.astro), the one place that applies a theme. Everything else talks to it
// through events on document:
//   "theme:set"   → dispatch it with detail "system" | "dark" | "light" to switch (the ⌘K palette does)
//   "themechange" → fired after every change, detail is the new theme (also when another tab changes it)
// The current theme: document.documentElement.dataset.theme ("dark" | "light", or none for system).
// localStorage key "theme": "dark" | "light"; removed for system.

export const THEMES = ["system", "dark", "light"] as const;
export type Theme = (typeof THEMES)[number];

/** The page background per scheme (--bg in tokens.css), for <meta name="theme-color">. */
export const THEME_COLOR = { dark: "#010101", light: "#f7f7f5" } as const;

const KEY = "theme";

const isPicked = (value: unknown): value is "dark" | "light" =>
  value === "dark" || value === "light";

/**
 * Runs inline in <head>, before first paint: applies a saved choice and points both theme-color metas at it.
 * Plain ES5-safe JavaScript as a string, so nothing has to load first.
 */
export const themeInitScript = `try{var t=localStorage.getItem(${JSON.stringify(KEY)});if(t==="dark"||t==="light"){document.documentElement.dataset.theme=t;var c=${JSON.stringify(THEME_COLOR)}[t];document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.content=c})}}catch(e){}`;

export function getTheme(): Theme {
  const theme = document.documentElement.dataset.theme;
  return isPicked(theme) ? theme : "system";
}

/** Each theme-color meta keeps its own scheme's colour under "system", or shows the picked one. */
function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (isPicked(theme)) root.dataset.theme = theme;
  else delete root.dataset.theme;

  for (const meta of document.querySelectorAll<HTMLMetaElement>(
    'meta[name="theme-color"][data-scheme]',
  )) {
    const scheme = isPicked(theme) ? theme : meta.dataset.scheme;
    if (isPicked(scheme)) meta.content = THEME_COLOR[scheme];
  }

  document.dispatchEvent(
    new CustomEvent<Theme>("themechange", { detail: theme }),
  );
}

export function setTheme(theme: Theme) {
  applyTheme(theme);
  try {
    if (isPicked(theme)) localStorage.setItem(KEY, theme);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: the choice lasts until the page closes.
  }
}

let listening = false;

/** Calls back with the theme now and on every change, including one made in another tab. */
export function onThemeChange(callback: (theme: Theme) => void) {
  document.addEventListener("themechange", (event) =>
    callback((event as CustomEvent<Theme>).detail),
  );

  if (!listening) {
    listening = true;
    window.addEventListener("storage", (event) => {
      if (event.key === KEY || event.key === null) {
        applyTheme(isPicked(event.newValue) ? event.newValue : "system");
      }
    });
  }

  callback(getTheme());
}
