# azamatos.com: design handoff

The new home page and four project pages, exported on 27 October 2026 from the **Chosen** page of the Claude design canvas
"Portfolio projects section". This folder is everything needed to build them in this Astro site.

| File | What it is |
| --- | --- |
| `HANDOFF.md` | This spec: what to build, how it looks and behaves, where it goes in `src/` |
| `tokens.css` | Colours for dark and light, project accents, gutters and the phone breakpoint, ready to import |
| `projects.json` | All the content: the projects terminal, the four project pages and the command palette |
| `assets/` | The hero photo and every screenshot the pages use (WebP) |
| `screens/` | Renders of the design to compare against (see the list at the end) |
| `source/` | The design itself: `Site.dc.html` (one component, markup and logic) and `design.css`. Reference only: its image URLs are the canvas's, use `assets/` instead |

## Keep from the current site

- Astro 7, static output, no client framework, CSS inlined (`build.inlineStylesheets: "always"`). Lighthouse stays at 100;
  CI already fails below 100 for accessibility, best practices and SEO.
- `src/site.ts` stays the source of the hero copy, links, email and resume.
- The hero's role typing animation and its pause button (WCAG 2.2.2) stay exactly as they work today. The design shows
  the first role ("senior full-stack engineer.") at rest.
- `Logo.astro`, `EmailButton.astro` (copy with a "copied" state), `ResumeActions.astro`, the self-hosted Geist (400, 500)
  and Space Mono through the Fonts API, `public/hero.svg` (the wave).
- Every page readable without JavaScript. JavaScript only adds the palette, the theme switch, the terminal selection and
  the copy buttons: small inline scripts, no framework.

## Suggested structure

```
src/styles/tokens.css            ← docs/design/tokens.css, imported by global.css
src/data/projects.json           ← docs/design/projects.json (image paths changed to src/assets/projects/…)
src/assets/hero-photo.webp       ← docs/design/assets/hero-photo.webp
src/assets/projects/*.webp       ← docs/design/assets/*.webp (use astro:assets <Image> for sizes and srcset)
src/components/Header.astro      update: commands + ⌘K button
src/components/Hero.astro        update: backdrop photo, wave only behind the text
src/components/ProjectsTerminal.astro   new: ls -la projects + README panel (desktop), accordion (phone)
src/components/CommandPalette.astro     new: on every page
src/components/ThemeSwitch.astro        new: in the footer
src/components/project/*.astro          new: page head, numbers, the section parts, built with, log, next project
src/pages/index.astro            update: Hero, then the Projects section
src/pages/projects/[id].astro    new: getStaticPaths() from projects.json
```

## Theme

- Three choices: **system** (default), dark, light. Set from the footer switch or the palette (`theme light|dark|system`).
- Dark or light sets `data-theme` on `<html>`; system removes it and `prefers-color-scheme` decides (`tokens.css` covers
  all three). Remember the choice in `localStorage` and apply it with a tiny inline script in `<head>` before first
  paint, so there is no flash.
- **The projects terminal and the command palette are always dark**, in both themes (their colours below are fixed).
- On project pages, `<main data-project="<id>">` turns on the project's accent: `--acc`, `--acc2`, `--on-acc`.

## Header (every page)

- Sticky, 84px tall (64px on a phone), background `var(--hdr)` with `backdrop-filter: blur(14px)`, bottom border `--line2`,
  side padding `var(--g)`.
- Left: the logo `➜ ~ azamatos ▊` (mint arrow, teal tilde, blinking block), links to `/`.
- Right, desktop: three commands in Space Mono 15px, each a 44px tall link with 12px side padding and 8px radius; the
  verb in `--teal`, the argument in `--fg2`; hover `--fg` on `--sel`.
  - `ls projects` → `/#projects`
  - `cat resume.pdf` → the resume
  - `mail hi@azamatos.com` (argument in `--fg`) → `mailto:`, followed by the copy button (40 × 44, 16px icon; on click a
    check and a small "copied" label for 1.6 s)
  - then 10px apart, the palette button: 40px tall, 1px `--line` border, 10px radius, `--chip` fill, `>_` in mint and a
    `⌘K` key cap (Space Mono 11px). It has `aria-haspopup="dialog"` and `aria-expanded`.
- Phone: only the logo and the `>_` button (44px).

## Home page

Screens: `home-dark.jpg`, `home-light.jpg`, `home-phone-dark.jpg`, `home-phone-light.jpg`, `readme-*.jpg`, `palette.jpg`.

### Hero (first screen)

- `min-height: 816px` (with the 84px header it fills a 900px screen), padding `48px var(--g) 96px`, `overflow: hidden`,
  content vertically centred. Projects never shows in the first screen.
- **Wave**, behind the text only: `public/hero.svg` absolutely positioned at `top: 0; left: 0; width: 110%; height: 100%`,
  with `filter: var(--wave-filter)`, `mix-blend-mode: var(--wave-blend)`, `opacity: var(--wave-opacity)`, and
  `mask-image: linear-gradient(to right, #000 0%, #000 30%, transparent 54%)` so it fades out before the photo. `aria-hidden`.
- **Photo**, `assets/hero-photo.webp` (a transparent cut-out): absolutely positioned at `right: -3%; bottom: 0; height: 90%`.
  - The wrapper fades in from the left: `mask-image: linear-gradient(to right, transparent 0%, #000 32%)`.
  - The image fades out at the bottom: `mask-image: linear-gradient(to top, transparent 0%, #000 22%)`, and is
    black and white: `filter: var(--photo-filter)`.
  - Scan lines over it: a `::after` with `background: repeating-linear-gradient(to bottom, transparent 0 3px, var(--bg) 3px 5px)`
    at `opacity: var(--scan)`.
  - Entrance: it draws in from top to bottom, `clip-path: inset(0 0 100% 0)` → `inset(0)`, 1.6 s,
    `cubic-bezier(.4, 0, .2, 1)`, 0.2 s delay.
  - Alt text: "Azamat Jorayev in glasses and a black hoodie". It's the likely LCP image: `fetchpriority="high"`, no lazy loading.
- **Text column**, `max-width: 660px`, gap 24px, rises in (0.6 s, 14px):
  - the availability chip (as today),
  - the h1, 58px, weight 500, letter-spacing −0.06em, line-height 1.05, two spans with a 0.18em gap; "Hi, I'm" and
    "I'm a" in `--fg2`. At 660px it wraps to three lines ("…full-stack / engineer."), which is intended,
  - the summary, 18px, `--fg2`, max 580px,
  - Download resume (primary: `--btn-bg` / `--btn-fg`, 48px, 10px radius) and View online (secondary, desktop only),
  - "PDF · 2 pages", Space Mono 13px, `--muted` (desktop only).
- **Scroll cue**, desktop: `↓ ls projects` centred 28px from the bottom, Space Mono 13px, links to `#projects`.
- **Phone** (≤ 800px): the hero becomes a column; the photo is a full-bleed band on top (`margin: -28px calc(var(--g) * -1) 0`,
  image `width: 100%; height: 320px; object-fit: cover; object-position: 45% 0`, no side masks), then the text; h1 34px,
  summary 16px, Download resume full width, then `mail hi@azamatos.com` with a copy button centred under it.

### Projects (`#projects`)

- Padding `112px var(--g) 120px`, top border `--line2`, `scroll-margin-top: 84px`.
- Heading "Projects" 48px (32px phone), subtitle 18px `--fg2`, and on desktop the hint "pick a row to read its README"
  (Space Mono 13px, `--muted`) aligned right. Text from `projectsIntro`.
- **Terminal, desktop.** Fixed dark: background `#060606`, border `rgba(255,255,255,.14)`, radius 16px,
  shadow `0 40px 100px rgba(0,0,0,.35)`, text `#fff`.
  - Title bar 44px: "azamatos@web: ~/projects" and "zsh · 120×40", Space Mono 12px, `rgba(255,255,255,.5)`.
  - Body padding 28px 32px 36px, Space Mono.
  - Prompt `➜ ~ ls -la projects` (16px): the command types in (`steps()` over its characters, 0.48 s, 0.2 s delay).
  - Column heads `mode · status · commits · stack · name` and four rows, grid
    `120px 150px 90px minmax(0,1fr) minmax(0,1.3fr)`, gap 16px. Rows print in one after another (0.26 s each, 80ms apart).
    Each row is a `<button aria-pressed>` (min-height 56px, 8px radius, top hairline): mode, status (dot + "building" in
    amber `#f2c14e` with a pulsing dot, or "live" in mint `#68edc0`), commits, stack (ellipsis), and the name at 22px with
    an arrow in the project's terminal colour (visaproof `#76beff`, yeral `#8a73ff`, rebuffer `#68edc0`, pass `#ff6b4d`)
    and a blinking `▊` on the selected row. Selected background `rgba(255,255,255,.06)`; hover `.035`. Visaproof is selected first.
  - A hairline, then `➜ ~/projects cat <id>/README.md`, which types again each time the selection changes.
  - **README** (fades up 8px, 0.36 s, on every change), two columns with a 40px gap:
    - left: a framed screenshot, 16:10, 12px radius, background `#0b0c0e`, a 34px browser bar with the host and, for
      Visaproof and Ýeral, an amber "design" tag. Visaproof's image (`readme.panImage`) pans from top to bottom and back
      (14 s, alternate, `object-position`).
    - right: `# <kind> · <status>` (Space Mono 13px), the headline 32px, the description 17px `#a6a6a6`; for projects in
      development the progress steps (✓ done in mint, the current one with a pulsing amber dot, ○ next); a "built with" row
      of chips (`readme.tech`, Space Mono 12px, 1px `rgba(255,255,255,.16)` border, pill); three stats (28px values) above
      a hairline; buttons **Read the case study →** (white, links to `/projects/<id>`) and the secondary link
      (`readme.secondaryLink`, outlined, ↗).
- **Terminal, phone.** An accordion in the same dark frame: `➜ ~ ls -l projects`, then one row per project (name 18px with
  its arrow, status and commits under it, a round chevron), `aria-expanded`. An open row shows `$ cat <dir>README.md`,
  the screenshot (`readme.phoneImage`), the headline, `readme.short`, the chips, three stats with their short labels, and
  a full-width Read the case study button. Visaproof starts open.

### Footer (every page)

© 2026 Azamat Jorayev · the theme switch (a segmented group of three buttons, `◐ system`, `☾ dark`, `☀ light`, Space
Mono 12px, `aria-pressed`, the pressed one on `--sel`) · the GitHub, Telegram and LinkedIn icons as today. Centred on a phone.

## Project pages: `/projects/<id>`

Screens: `page-<id>-1…3.jpg` (desktop, top to bottom) and `page-<id>-phone.jpg` (the phone page cut into columns).
All content is in `projects[].page`. Ýeral's screens are in light, the others in dark; every page works in both.

1. **Back link** `➜ ~/projects/<id> cd ..` (Space Mono 14px, 44px tall) → `/#projects`. Section padding `40px var(--g) 56px`.
2. **Head**, rising in: the status chip (Space Mono 12px; mint for live, amber with a pulsing dot for in development; border
   the same colour at 40%), the name at 80px (44px phone), letter-spacing −0.06em, and the tagline at 26px (20px phone):
   `tagline.strong` in `--fg`, `tagline.rest` in `--fg2`. On the right (wraps under on narrow screens) a definition list
   `role · stack · links`: labels Space Mono 12px `--muted`, links underlined in `--acc`.
3. **Hero media**, 700px tall: the framed screenshot fills it with 120px free on the right (`object-fit: cover`, top left),
   a 38px browser bar with the host and the "design" tag where `isDesign`; the phone screenshot (260px wide, 32px radius)
   overlaps the bottom right, 40px below the frame. Phone: just the frame at the image's natural height, no phone.
4. **Numbers**: four, between two `--line` rules, `repeat(auto-fit, minmax(220px, 1fr))`; value 48px (30px phone, two
   columns), label 14px `--fg2`; `numbersNote` under in Space Mono 12px `--muted`. Numeric values count up from 0 over
   1.1 s (ease-out cubic) starting 0.5 s after load; `text` values just show. With reduced motion, show the final value.
5. **Sections** (`page.sections`): each is a row with a 220px label column (`01 · the problem`, Space Mono 14px `--fg2`)
   and a content column (gap 28px): `lead` 30px weight 500 (23px phone), `text` 17px `--fg2` max 680px, then its parts.
   On a phone the label sits above. Section padding `56px var(--g)` (36px phone). The part kinds:

   | kind | How it looks |
   | --- | --- |
   | `waffle` | 100 squares in a 20 × 5 grid (16px, gap 4, 3px radius) in a card: 3 `--acc`, 8 `--acc2`, 11 grey, 78 empty with a hairline ring; they pop in 8ms apart. Legend beside it. `label` is the `role="img"` name. Phone: the grid fills the width |
   | `flow` | Cards in a row with arrows between them (arrows hidden on a phone): a mono tag, a 17px title, a 14px body. `highlight` gets an amber border and tag |
   | `feeds` | Dashed cards: a mono `when` in `--acc`, a title and a body |
   | `states` | Five badges with what each means and its evidence (mono), the job-page screenshot beside them. Badge styles are in the data (`bg`, `fg`, `border`, `bs`, `r`) |
   | `bars` | Two groups of labelled bars (10px tall, `--line2` track) that grow from the left in 0.9 s, values right in mono |
   | `cards` | A grid, `repeat(auto-fit, minmax(min(<min>, 100%), 1fr))`: optional mono tag in `--acc`, a 16px title, a 14px body |
   | `figure` | A framed screenshot with a host bar and a mono caption, up to `maxw` wide |
   | `gallery` | Two framed 16:10 screenshots side by side with captions |
   | `table` | Head in Space Mono 12px `--muted`; first column Geist `--fg`, the rest Space Mono `--fg2`; rows split by `--line2`. It scrolls sideways on a phone (`minw`) |
   | `chips` | Pills, 14px |
   | `note` | One Space Mono 13px line in `--mint` |

6. **Built with** (numbered after the last section): rows of a 150px group name in Space Mono 13px `--acc` and, beside it,
   pills (`name` 14px with the `version` in Space Mono 11px `--muted`) and a one-line `note` in `--fg2`. Rows split by
   `--line2`. On a phone the group name sits above.
7. **Log** (`log.title`: "git log" or "what shipped"): a list in Space Mono 14px, grid `20px 130px 1fr`, ✓ in mint for
   done, a pulsing amber dot for current, ○ for next, the note in Geist 15px `--fg2`. Beside it `aside.title` (Space Mono
   12px `--muted`) with its bullet list, then `actions` (the primary one in `--btn-bg`).
8. **Next project**: a card linking to the next page (Visaproof → Ýeral → Rebuffer → pass → Visaproof): "next project",
   `➜ ~ cd ../<next>` in Space Mono 30px (22px phone) with the next project's arrow colour, its headline, and a round
   52px arrow. Hover: border `--acc`.

`rebuffer-run.webp` is an animated recording (2.4 MB): load it lazily, and consider re-encoding it as a muted, looping
`<video>` (WebM/MP4) with `rebuffer-home.webp` as the poster. With reduced motion, show the poster.

## Command palette (every page)

- Opens with ⌘K or Ctrl+K anywhere, and with the header button. Closes with Esc, a click on the backdrop, or after a
  command runs. Focus moves to the input; Tab stays inside; focus returns to the button on close.
- A `role="dialog" aria-modal="true"`, 640px wide, 108px from the top, always dark: `#0b0b0b`, border
  `rgba(255,255,255,.16)`, radius 16px, shadow `0 40px 120px rgba(0,0,0,.6)`; it drops in (8px, scale .985, 0.22 s).
  The backdrop is `rgba(0,0,0,.55)` with `blur(3px)`.
- A 60px input row: `➜ ~`, the input (Space Mono 16px, mint caret, placeholder "ls, cd, cat, mail, theme…"), an `esc` key cap.
- The list (`palette` in `projects.json`), grouped `go`, `do`, `set`, `open`; each row 46px: the verb in teal, the
  argument in `#f0f4f3`, the description in `#a6a6a6` 13px. Typing filters by substring on "verb arg description";
  nothing matches → `zsh: command not found: <text>`. ↑ ↓ move, Enter runs, the pointer selects; the selected row gets
  `rgba(255,255,255,.07)` and a `↵`. Footer: "↑ ↓ move · ↵ run · esc close" and "⌘K anywhere on the site".
- `mail` copies the address and shows ✓ instead of closing; `theme …` switches the theme in place.
- Phone: full screen, no radius; the description goes under the command.

## Motion

Everything below is off under `prefers-reduced-motion: reduce`, which shows the final state.

| Where | What |
| --- | --- |
| Hero | text rises 14px over 0.6 s; the photo draws in top to bottom (1.6 s); the logo cursor blinks (1.1 s steps) |
| Terminal | commands type in (`steps()`), rows print in 80ms apart, README fades up 8px on each selection, Visaproof's screenshot pans (14 s), amber dots pulse (1.8 s) |
| Phone accordion | the opened README drops in 6px (0.34 s) |
| Project pages | head and hero rise in; numbers count up; waffle squares pop in; bars grow |
| Palette | drops in (0.22 s); backdrop fades in (0.2 s) |
| Hover | commands, the ⌘K button, rows and the next-project card change colour in 0.16 s |

## Accessibility

- Targets at least 44px. Rows and theme buttons use `aria-pressed`; the accordion and the ⌘K button `aria-expanded`.
- The wave and the scan lines are decorative (`aria-hidden`); every screenshot has its `alt` in `projects.json`; the
  waffle is `role="img"` with its `label`.
- Visible focus rings on everything clickable, in both themes; contrast is fine for text on `--bg` in both themes.
- Keep the typing pause button.

## Content

- `projects.json` holds every word on the new parts of the site. Facts were read from each project's repository on
  26–27 October 2026 (commits, tests, sizes, milestones). Update the numbers when they change.
- Visaproof's and Ýeral's screenshots are designs (tagged "design"); swap them for real screens when those are live.
  Rebuffer's and pass's are screenshots of their production builds.
- The photo is an 800 × 600 webcam shot; a sharper one would look better at this size.
- To confirm with Azamat before publishing: the role lines in each page's `meta`, the Visaproof repository URL
  (`github.com/azamatos/visaproof`), and whether pass gets a source link.

## Screens

| File | Shows |
| --- | --- |
| `home-dark.jpg`, `home-light.jpg` | The whole home page at 1440px |
| `home-phone-dark.jpg`, `home-phone-light.jpg` | The home page at 390px, cut into columns |
| `readme-visaproof.jpg` … `readme-pass.jpg` | The terminal with each project selected |
| `palette.jpg` | The command palette open |
| `page-<id>-1.jpg` … `-3.jpg` | Each project page at 1440px, top to bottom |
| `page-<id>-phone.jpg` | Each project page at 390px, cut into columns |

## Prompt for Claude Code

> Read `docs/design/HANDOFF.md` and build it in this Astro site: the new home page (hero with the backdrop photo, then
> the Projects terminal), the four project pages at `/projects/<id>`, the ⌘K command palette and the system/dark/light
> theme. Take the content from `docs/design/projects.json`, the tokens from `docs/design/tokens.css` and the images from
> `docs/design/assets/`. Keep what the handoff says to keep, especially Lighthouse 100 and no client framework. Compare
> each page with `docs/design/screens/` at 1440px and 390px in both themes before you finish.
