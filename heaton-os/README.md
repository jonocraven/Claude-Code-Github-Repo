# Heaton OS

> **What:** The Claude workspace (`/Users/jonathancraven/Claude`) rendered as a warm, print-craft desktop operating system — spaces as apps, files beautifully readable, live Todoist and scheduled-task data alongside.
> **Why:** Navigating the workspace through Finder and raw markdown is hard work.
> **Status:** All six phases built — scaffold, shell, Files + Reader, search, system apps, space apps, and polish (editing, icons, keyboard map).

Built from `heaton-os-build-brief-17-07-2026.md`.

## Getting started (on the Mac)

```bash
# Clone the repo somewhere OUTSIDE the workspace — never inside
# /Users/jonathancraven/Claude (it's Drive-synced; see brief §2.1).
mkdir -p ~/Projects
git clone <this-repo> ~/Projects/heaton-os-repo
cd ~/Projects/heaton-os-repo/heaton-os

npm install
cp .env.example .env   # defaults already point at /Users/jonathancraven/Claude
npm run os             # starts the server + opens the browser
```

`npm run os` runs the Fastify API (127.0.0.1:4400, loopback only) and the
Vite dev server together, and opens the browser.

## What exists so far

- **Phase 0 — Scaffold.** Vite + React + TypeScript; Fastify server; `.env`
  config (`WORKSPACE_ROOT`, `PORT`); `GET /api/tree` walks the real workspace
  with the ignore list (`.DS_Store`, Drive temp folders, `.obsidian`,
  `.claude`, `__pycache__`, `node_modules`), returning per-node file counts
  and latest-modified dates.
- **Phase 1 — Shell.** Boot screen (skippable, honours
  `prefers-reduced-motion`), cream paper-grain desktop, menu bar (wordmark,
  memory dot placeholder, DD-MM-YYYY clock), dock with the eight space apps +
  system apps (placeholder SVG icons — the hand-crafted set is Phase 6),
  and the window manager: drag, resize, z-order, minimise to dock, close,
  double-click/⌘-button maximise to a comfortable reading size, per-app
  position persistence, ⌘W close, ⌘` cycle.
- **Phase 2 — Files + Reader.** Files browses the tree (A–Z / Recent sort)
  and routes every file type: markdown to the Reader, images/PDF/HTML/CSV to
  their viewers, anything else to reveal/open-in-default-app. The Reader
  typesets in a quiet literary register (Lora, ~68ch), renders the
  What/Why/Headline/Feeds/Status blockquote as a summary card, turns every
  cross-reference into a click (backticked paths, relative links, bare
  filenames resolved doc-dir → space root → workspace root; unresolvable
  refs get a dotted marker, never a guess), and carries a collapsible
  backlinks panel. HTML artefacts render in sandboxed iframes; CSVs become
  sortable grids. The server watches the workspace (chokidar, debounced),
  rebuilds its indexes on change, and pushes the changed paths over a
  WebSocket (`/api/live`) so open Files and Reader windows live-update when a
  file changes on disk — a Drive sync or another Claude session — without a
  reload. (The Reader holds off while you're mid-edit; the save-time conflict
  guard protects the draft.)
- **Phase 3 — Search.** ⌘K palette: MiniSearch keyword index
  (title/headings/body/path) with highlighted snippets, per-space filter
  chips, app-launcher behaviour ("job" ↵ opens Job Search), full keyboard
  navigation. A semantic layer (transformers.js, all-MiniLM-L6-v2, chunked
  by heading, embeddings cached in `.cache/` by file hash) builds in the
  background after boot and surfaces concept matches under a "Related"
  divider; first run downloads the ~25MB model once. Until it's ready the
  palette shows "building semantic index…" and keyword search works alone.
- **Phase 4 — System apps.** **Tasks** (My Plate + per-space tabs, priority
  and owner badges, due dates, tick-to-complete with a real undo, deep links)
  over a Todoist REST proxy that keeps the token server-side and reports a
  calm setup card when it's absent. **Calendar** expands the workspace
  cadences (Appendix B) into a month grid, staggered, with each run linking
  to its `Scheduled/` folder. **Memory Monitor** gauges every memory file
  against the Appendix C ceilings (amber at 85%, red at breach — ported from
  `memory-hygiene-check.sh`), and the menu-bar dot reflects the worst live.
  **Activity** is a 14-day timeline of changes grouped by day, badged by space.
- **Phase 5 — Space apps.** Each of the eight spaces opens on a dashboard —
  MEMORY.md hero (front-matter card + clickable refs), its Todoist section
  tasks, five most-recent files, and bespoke panels — plus a Files tab scoped
  to the space. Bespoke per §5: Cookery-Books' filterable recipe grid,
  Job-Search's CV lanes, Side-Hustle's artwork thumbnails, Finances' next
  bi-monthly refresh date, Life-Plan's quiet quarantine note, and so on.
- **Phase 6 — Polish.** Editing is the app's only write surface: the Reader's
  Edit toggle swaps the rendered view for a CodeMirror 6 markdown editor with
  a dirty indicator and explicit ⌘S — saved via `PUT /api/file`, which writes
  atomically (temp + rename) and returns 409 if the file changed on disk since
  it loaded, so a Drive-synced edit is never silently clobbered. Plus a
  hand-drawn SVG icon set (round-capped, stamp-like, per-space tinted), a ⌘/
  keyboard-shortcuts map, and a staggered dock entrance — all inside the
  `prefers-reduced-motion` guard.

All design values live in CSS custom properties (`src/styles/tokens.css`) —
a future theme is one token-file swap (brief §12).

### Todoist token

Tasks (Phase 4) and the space section-task panels (Phase 5) proxy the Todoist
REST API v2 through the server. Paste your token into `.env` as
`TODOIST_API_TOKEN=...` (Todoist → Settings → Integrations → Developer) and
restart. Without it the apps show a setup card; for local demos,
`TODOIST_FIXTURE=fixtures/todoist-fixture.json` serves sample tasks instead.

## Development away from the Mac

`fixtures/sample-workspace/` is a tiny committed stand-in for the real
workspace, including the §10 path hazards (spaces, em-dashes, parentheses in
folder names). Point `.env` at it:

```
WORKSPACE_ROOT=<repo>/heaton-os/fixtures/sample-workspace
```

```bash
npm test         # tree-walker + path-hazard tests (vitest)
npm run typecheck
```
