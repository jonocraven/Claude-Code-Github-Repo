# Brief 05 — Dark mode

**Model:** Sonnet · **Estimated size:** ~150 lines, mostly CSS · **Risk:** low-medium

## Why this is delegable

The design decision — the palette — is **supplied below**, so this is
application and measurement rather than design. The token architecture
(`src/styles/tokens.css`) already routes every colour through a custom
property, which is what makes this tractable. The acceptance test is a measured
contrast ratio, not an opinion.

## Read first

- `src/styles/tokens.css` — the entire token set. This is where you work.
- `src/styles/global.css` — note `body` and the `.paper-grain` overlay.
- `src/styles/shell.css` — scan for **hard-coded colour literals**; there
  should be none, but the grain SVGs embed `feColorMatrix` values and the boot
  screen inverts ground and ink. Both need attention.
- `index.html` — carries `<meta name="color-scheme" content="light">`.

## The palette (do not redesign this)

Warm dark — the same print-craft register at night, not a generic grey theme.
Ground stays warm; accents lift for legibility on dark.

```css
--paper:      #1f1b16;  /* main reading ground */
--paper-deep: #17140f;  /* recessed: sidebar, tab strip, panel fills */
--ink:        #f0e9dc;  /* body text */
--ink-soft:   #b8ac9a;  /* secondary */
--ink-faint:  #8a7f6f;  /* tertiary — never body copy */

--accent-cookery-books: #f2705a;
--accent-wfdinner:      #7fb262;
--accent-home:          #e8a63f;
--accent-house-move:    #85a6c4;
--accent-job-search:    #9a86d8;
--accent-finances:      #6fa87f;
--accent-side-hustle:   #f489b8;
--accent-life-plan:     #b3a996;
--accent-system:        #f0e9dc;
```

**Shadows.** The hard offset shadows are the signature and must survive.
`var(--ink)` shadows are invisible on a dark ground, so in dark mode they
become near-black: `#000` at the same offsets. Redefine `--shadow-hard*` in the
dark block; do not change the offsets or add blur.

**Borders.** `--border` uses `var(--ink)`, which becomes a light border on dark
— correct, keep it.

## Scope

### 1. Mechanism

Support both:

- `@media (prefers-color-scheme: dark)` — follows the OS.
- `:root[data-theme="dark"]` / `:root[data-theme="light"]` — an explicit
  override that **must win over** the media query in both directions.

Persist the choice in `localStorage` under `heaton-os.theme.v1`
(`"light" | "dark" | "system"`, default `"system"`). Apply it by stamping
`data-theme` on `<html>`.

Apply the stored theme **before first paint** — a small inline script in
`index.html`, ahead of the module bundle — or the app will flash light on every
load. Update the `color-scheme` meta accordingly (or set the
`color-scheme` CSS property on `:root`) so form controls and scrollbars follow.

### 2. Control

Add a theme toggle to the top bar (`src/components/TopBar.tsx`) next to the
memory dot. Cycle light → dark → system. Use the existing `.topbar-btn` class —
no new visual language. Give it a `title`/`aria-label` naming the *current*
state, and draw sun/moon/auto glyphs as inline SVG in the style of the existing
buttons (see the split and search icons in that file).

### 3. Grain and boot screen

- The two paper-grain SVGs (in `global.css` and the `.shell` rule in
  `shell.css`) hard-code a dark ink tint via `feColorMatrix`. On a dark ground
  this reads as dirt. Either lighten the matrix for dark mode or drop the grain
  opacity; pick one and keep it consistent across both.
- `.boot` deliberately inverts — dark ground, light text. Check it still reads
  in dark mode and does not become invisible-on-invisible.
- `.reader-body pre` uses ink ground with paper text — verify it inverts
  sensibly rather than becoming a light block on a dark page.

### 4. Verify contrast — required

Write a short script (Playwright, as used elsewhere in this work) that loads
the app in **both** themes and asserts a WCAG AA contrast ratio for:

| Element | Against | Minimum |
| --- | --- | --- |
| `.reader-body` body text | `--paper` | 4.5:1 |
| `.sidebar-heading` | `--paper-deep` | 4.5:1 |
| `.tree-meta` | `--paper` | 4.5:1 |
| `.nav-label` | `--paper-deep` | 4.5:1 |
| `.palette-snippet` | `--paper` | 4.5:1 |
| each `--accent-*` used as text | its ground | 4.5:1 |
| each `--accent-*` used as a fill behind `--paper` text | — | 4.5:1 |

Report the measured numbers. If any accent fails, adjust **that accent's dark
value only** and say which you changed and to what — do not restructure the
palette.

## Out of scope

- No component restructuring. If a component needs a literal colour removed to
  make dark mode work, replace it with a token — but change nothing else.
- Do not alter the light palette. Existing light-mode appearance must be
  pixel-identical; verify with a before/after screenshot.
- No per-space theming, no additional themes.

## Definition of done

```bash
npm test
npm run typecheck
```

- Toggle cycles light → dark → system and survives a reload with no flash.
- Every screen legible in dark: Files, Reader, editor, Tasks, Calendar, Memory,
  Activity, a space dashboard, the ⌘K palette, the keymap overlay, boot screen.
- Hard offset shadows still visible in dark.
- Contrast script passes and its numbers are in your report.
- Light mode unchanged — screenshot diff to prove it.

## House rules

Inherit all rules in [README.md](README.md).
