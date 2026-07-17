# Heaton OS

> **What:** The Claude workspace (`/Users/jonathancraven/Claude`) rendered as a warm, print-craft desktop operating system — spaces as apps, files beautifully readable, live Todoist and scheduled-task data alongside.
> **Why:** Navigating the workspace through Finder and raw markdown is hard work.
> **Status:** Phase 0 (scaffold) + Phase 1 (shell) built · Phases 2–6 to come.

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

All design values live in CSS custom properties (`src/styles/tokens.css`) —
a future theme is one token-file swap (brief §12).

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
