# Heaton OS

> **What:** The Claude workspace (`/Users/jonathancraven/Claude`) rendered as a warm, print-craft desktop operating system — spaces as apps, files beautifully readable, live Todoist and scheduled-task data alongside.
> **Why:** Navigating the workspace through Finder and raw markdown is hard work.
> **Status:** All six build phases complete, plus a repair pass and **Today** — a cross-space triage surface that answers "what's going on across everything?".

Built from `heaton-os-build-brief-17-07-2026.md`, then extended following a
product audit (July 2026).

## Quick start

```bash
cd /Users/jonathancraven/developer
git clone https://github.com/jonocraven/Claude-Code-Github-Repo.git heaton-os-repo
cd heaton-os-repo/heaton-os
npm install
cp .env.example .env
npm run os
```

This clones the repo, installs dependencies, configures your environment, and starts the dev server with the browser open.

`npm run os` runs the Fastify API (127.0.0.1:4400, loopback only) and the Vite dev server together.

## Updating — pulling new changes down

Once you already have the repo cloned, this is the whole routine:

```bash
cd /Users/jonathancraven/developer/heaton-os-repo   # wherever you cloned it

# Stop the running app first (Ctrl-C in the terminal running `npm run os`).

git checkout main        # work lands on main; skip if you're already on it
git pull                 # fetch and fast-forward

cd heaton-os
npm install              # safe to run every time; a no-op when nothing changed
npm run os
```

`.env` is gitignored, so your `WORKSPACE_ROOT` and Todoist token survive a
pull untouched. If `.env.example` gains a new key you'll need to copy it
across by hand — `git diff HEAD@{1} -- heaton-os/.env.example` after a pull
shows whether it changed.

**Restart rather than relying on hot reload.** The Vite dev server picks up
front-end edits live, but a pull that changes server code is cleaner with a
full stop and start.

### Two things to expect the first time

**Today won't open automatically.** It's the new landing tab, but only on a
*fresh* session — your browser has the old tab layout saved, and restoring
your workspace takes priority over overriding it. Click **Today** at the top
of the left rail. To get the true first-run behaviour instead, clear the
saved layout from the browser console:

```js
localStorage.removeItem("heaton-os.tabs.v1");
```

**Tabs now behave differently.** Opening a space or a file gives you a
*preview* tab — italic title, one per pane, replaced by the next thing you
open. That's deliberate: browsing eight spaces used to leave eight tabs.
Double-click a tab (or just start editing) to keep it. Your previously-saved
tabs all restore as kept, never as previews.

### If a pull goes wrong

```bash
git status                      # see what's uncommitted locally
git stash                       # park local edits, then pull again
npm test && npm run typecheck   # confirm the checkout is sound (89 tests)
```

If the app starts but the workspace looks empty, check `WORKSPACE_ROOT` in
`heaton-os/.env` still points at `/Users/jonathancraven/Claude`.

## Getting started (on the Mac)

Clone the repo somewhere OUTSIDE the workspace — never inside `/Users/jonathancraven/Claude` (it's Drive-synced; see brief §2.1).

The defaults in `.env.example` already point at `/Users/jonathancraven/Claude`, so no additional configuration is needed for the real workspace.

## What's new since the six phases

- **Today** — the landing surface, top of the rail. Overdue and due-today
  tasks, memory breaches, the day's scheduled runs, what's changed since you
  last looked (grouped by space), what's coming up, and what's parked with
  Claude or blocked on someone else. Cross-space by default. It composes data
  the app already had; the value is the ranking, which lives in
  `server/today.ts` and is covered by tests that lock the rules rather than
  the implementation. A quiet day collapses to a single line rather than
  filling with reassurances.
- **Tabs have a lifecycle** — previews replaced by the next open, kept by
  double-click / the pin control / sending to split / starting an edit, plus
  an overflow menu, close-others and middle-click close.
- **Reader navigation** — a contents rail on long documents that tracks the
  heading in view, remembered reading position (except from a search hit),
  prev/next through the folder's siblings, and backlinks open by default
  alongside a new "Links to" list of the document's own outbound references.
- **Recently-opened trail** — press ⌘K with an empty query.
- **Saving is ~12× cheaper** — indexing is incremental rather than re-reading
  and re-hashing the whole workspace on every change.
- **Repairs** — the top-bar memory dot now actually tracks state (it was
  pinned green), the Memory verdict no longer counts amber as a breach,
  machine-scratch folders stay out of search/activity/recents everywhere, the
  space memory hero crops with a "read in full" rather than clipping
  mid-sentence, and the app has a document outline and AA-contrast chrome.

- **Search is a surface, not just ⌘K** — a real window in the System list
  (`Search`). It persists, holds its query across a reload, shows the whole set
  rather than the top twelve, groups results by space with counts so you can
  see where a subject actually lives, and opening a result doesn't destroy it.
  ⌘K is unchanged and is now labelled *Jump to…* in the rail, because the two
  are different tools: ⌘K is for when you know what you want and want to be
  gone. Its last row hands the query over to the window when you don't.
- **Filenames are searchable** — only markdown is full-text indexed, so until
  now a PDF or a photo was invisible to search entirely. Every file is now
  findable by name, ranked so a filename hit beats a folder-name hit.
- **Dark mode** — a warm dark in the same print-craft register, not a grey
  theme. Toggle in the top bar cycles light → dark → follow-the-OS, applied
  before first paint so there's no flash. Every screen measured at WCAG AA in
  both themes.
- **Light-mode contrast fixed** — four accent colours (Cookery Books, Home,
  Side Hustle, Life Plan) failed AA as text; Home was at 2.91:1. Hue is
  unchanged, they're just deeper. This is a visible change to the palette.
- **A memory file can be retired by renaming it** — the `(ignore)` convention
  only ever worked on folders, because the check ran past the file extension.
  `Draft (ignore).md` is now hidden everywhere, as it always read like it
  should be.
- **`/api/tree` is served from memory** — it used to re-walk the workspace and
  stat every file on every request, including on every change broadcast. On a
  Drive-synced folder those stats hit the network.

- **Timeline replaces Activity and Calendar** — they were one surface split by
  tense. Now a single spine of days: past above, future below, today anchored
  with the only rule on the page, and the view lands there rather than at the
  top. Quiet stretches collapse to "3 quiet days" instead of padding the page
  with blanks. The month grid survives as a second view. Changes, scheduled
  runs and due tasks share the spine and are told apart by mark *shape*, since
  colour already means space everywhere else. Tabs saved as Activity or
  Calendar are migrated on load, title included.
- **Connections** — a new window for the three questions the app could not
  answer at all: which spaces actually touch (grouped by pair, so "House Move
  ↔ Finances, 3 links" is the finding), which documents are load-bearing, and
  which are forgotten — nothing links to them, stalest first.
- **Recent activity comes from memory too** — it used to walk the whole
  workspace and stat every file on every request, so flicking between the
  7/14/30-day ranges triggered three full walks of a Drive-synced folder.
- **System surfaces stay put** — Today, Timeline, Search, Files, Tasks, Memory
  and Connections open as kept tabs. Clicking a result from one of them used to
  destroy the surface you clicked it from. Spaces are still previews, which is
  what previews were introduced for.

Tests went from 22 to 191, plus six probes that drive the real thing:
`npm run probe:search`, `probe:tree`, `probe:recent`, `probe:timeline`,
`probe:connections` and `probe:contrast`. They exist because several pieces of
this work passed their own unit tests while being broken in the browser — for
one of them the entire suite stayed green with the feature deleted. The probes
are the part that actually caught it.

## What exists so far

- **Phase 0 — Scaffold.** Vite + React + TypeScript; Fastify server; `.env`
  config (`WORKSPACE_ROOT`, `PORT`); `GET /api/tree` walks the real workspace
  with the ignore list (`.DS_Store`, Drive temp folders, `.obsidian`,
  `.claude`, `__pycache__`, `node_modules`), returning per-node file counts
  and latest-modified dates.
- **Shell — dashboard layout.** Boot screen (skippable, honours
  `prefers-reduced-motion`), then a dashboard: a left nav rail (brand, the
  eight spaces, system tools; collapsible to icons), a top bar (active title,
  search, live memory dot, DD-MM-YYYY clock), and a content area that gives
  the whole width to what you're reading. Apps and documents open as **tabs**,
  never overlapping windows; any tab can be sent to an optional **right pane**
  for side-by-side reading (⌘\\). Open tabs and the split state persist to
  localStorage. ⌘K search, ⌘W close tab, ⌘` cycle, ⌘/ shortcuts.
  _(This replaced the original draggable-window desktop — the content
  components and all functionality were unchanged; only the presentation
  shell was swapped.)_
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
