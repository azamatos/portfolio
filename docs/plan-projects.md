# Plan: Projects on azamatos.com

Agreed 2026-10-27. The design is the Claude Design export in [`design/`](design/HANDOFF.md); this file records what
was decided on top of it and the order of the work.

## Decided

- **Design:** build `docs/design/` as exported. The hero keeps the design's photo as is: it's a backdrop, so its
  resolution doesn't matter.
- **Projects and status:**
  - Visaproof: live.
  - Ýeral: in development; business.yeral.app is live on test data.
  - Rebuffer: live.
  - pass: live.
  - The Projects subtitle says "three live, one in development".
- **Data:**
  - Gathered from public sources only: GitHub, CI logs, the live sites and their APIs, and our own Lighthouse runs.
    The four projects don't change.
  - Every project uses one config shape, with optional extras.
  - Where public data and the design disagree, the live definition wins and the label changes to match.
  - Numbers never sit in sentences: text pulls them from data.
- **Refresh:** a command, a "Run" button in GitHub, and a weekly scheduled run. Failures arrive as GitHub's email.
- **Media:** R2 bucket `azamatos-media`, served from `media.azamatos.com/portfolio/…`. The hero photo stays in the
  repo, since it's the first thing to load.

## Content changes to the export

- **Visaproof:** status "live · visaproof.azamatos.com"; no "design" tag and no progress steps; the launch is done
  ("open to search engines, 27 Oct"); buttons **Open visaproof.azamatos.com**, then Source on GitHub. Labels follow
  the live data: "42 countries", "new roles in the last 24 hours", and the visa chart uses live "won't sponsor". The
  first-sweep story stays, as a dated snapshot.
- **Ýeral:** status "in development · the business app is live on test data", with real screenshots of
  business.yeral.app. Links: business.yeral.app, Design system, Source on GitHub. yeral.app is left out until the
  client site is live; the gallery keeps the design shots, tagged "design".
- **pass:** add Source on GitHub (`azamatos/password-generator`); tests read "Playwright checks in 3 browsers".
- **Rebuffer:** "Playwright checks" uses the passed count.
- **Role lines:**
  - Visaproof: "Everything, alone: the idea, the pipeline, the evaluation, the design and the site"
  - Ýeral: "Owner and engineer: the product book, the architecture, the API and both apps"
  - Rebuffer: "Idea, design and code, from years of building HLS players and Smart TV apps"
  - pass: its own line, about one unique password per site (not a cut of Rebuffer's)
- **The ⌘K palette list** is built from the project data.

## Data model

- **Config, by hand:** `src/content/projects/<id>.yaml`, checked at build (a typo or a missing field fails it).
  - Base fields, the same for every project: id, name, status, site, repo, accent, list row, README, page.
  - Optional: `sources` (where values come from), `values` (each with a reader, a one-line `means` and a `maxAge`),
    `shots` (screenshots and loops, with optional `steps`).
  - Page sections are typed parts: waffle, flow, feeds, states, bars, cards, figure, gallery, table, chips, note.
- **Collected values:** `src/data/collected/<id>.json`, written only by the refresh command. Each value has its date
  and source. The command never edits the config.
- **Placeholders:** text like `{roles} open roles` is filled from values, with formatting rules.

## Refresh command: `pnpm data:refresh [project] [--no-shots]`

- **Readers:** `github` (one GraphQL query: commits, versions, file counts, CI status), `ci` (latest successful run
  log, colour codes stripped, pattern match, optional sum), `json` (URL + path or count), `page` (live HTML, last
  resort), `measure` (Lighthouse and JS size on live URLs), `manual` (value, date checked, source link).
- **Screenshots:** Playwright at desktop 1440 and phone 390, in a given theme, with optional steps (Ýeral's sign-in,
  the Rebuffer run, Visaproof's full-page scroll). Images in several sizes as AVIF and WebP; loops as WebM and MP4
  with a still frame. Uploaded to R2 under content-hashed names, cached for a year.
- **Safety:** values are checked against their maximum age and links against a working page. A value that fails keeps
  its last good version, the run reports it, and the run exits with an error.
- **Secrets:** `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` (Object Read & Write on `azamatos-media`
  only). Locally in the git-ignored `.env`; in GitHub as repository secrets, set from that file with
  `gh secret set -f .env`.

## Weekly run: `.github/workflows/refresh.yml`

Mondays, plus a manual button that can target one project. It runs the refresh, the type check and the build, then
commits `src/data/collected/` if anything changed; Cloudflare deploys on that push. Commits made by the job don't
start the normal CI, which is why the job builds the site itself. GitHub pauses scheduled runs after 60 days without
commits; it emails first, and one click turns them back on.

## Phases

Branch `feat/projects`, one commit per step, then a PR so CI runs Lighthouse on it.

1. **Data layer:** content collection, schemas, collected values, placeholders.
2. **Refresh command:** readers, screenshots, encoding, R2 upload, checks.
   - 🔍 Checkpoint 1: the first real screenshots and numbers, before any UI.
3. **Weekly run:** the workflow and the secrets.
4. **Theme and site shell:** tokens, system/dark/light without a flash, header (`ls projects`, `cat resume.pdf`,
   `mail`, ⌘K; phone: logo and `>_`), footer with the theme switch. Logo, EmailButton, ResumeActions and the fonts
   stay.
5. **Hero:** the photo as a backdrop, masks, scan lines, draw-in; the wave only behind the text; `↓ ls projects`;
   the typing animation and its pause button unchanged.
6. **Projects section:** desktop terminal (rows are tabs with arrow keys), phone accordion that works without
   JavaScript, all READMEs stacked without JavaScript.
   - 🔍 Checkpoint 2: the home page in both themes, desktop and phone.
7. **Project pages `/projects/<id>`:** back link, head, hero media, counting numbers, sections, built with, log,
   next project; per-page title, description and share image.
   - 🔍 Checkpoint 3: all four pages.
8. **Command palette:** a `<dialog>` on ⌘K or Ctrl+K; filter, arrows and Enter, "command not found", `mail` copies,
   `theme` switches in place; full screen on a phone.
9. **Polish and checks:** `llms.txt` lists the projects; Lighthouse on all 6 pages (100 for accessibility, best
   practices and SEO, aiming for 100 on performance); comparisons with `design/screens/` at 1440 and 390 in both
   themes; reduced motion, keyboard and no-JavaScript passes; a glyph check for ➜ ⌘ ✓ ◐ ☾ ☀ Ý.

**Repo housekeeping:** `docs/design/` is committed without `screens/` (5 MB of renders, git-ignored). The hero photo
and Ýeral's design shots move into `src/assets/`. New dev tools: Playwright, `aws4fetch`, Lighthouse.

## Risks

- **Photo draw-in:** it can delay Lighthouse's largest paint. If it does, the photo starts partly visible.
- **Images from `media.azamatos.com`:** preconnect, and the first image on each project page gets high priority.
- **Ýeral's sign-in** depends on the code shown on screen. If that goes, we need a test login as a secret.

## Outside this repo

- Update the `me` skill: Ýeral is public with a public repo, Visaproof is live, and the portfolio has Projects.
