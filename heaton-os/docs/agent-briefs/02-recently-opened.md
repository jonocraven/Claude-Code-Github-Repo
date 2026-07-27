# Brief 02 — Recently-opened trail

**Model:** Haiku · **Estimated size:** ~120 lines across 3 files · **Risk:** low

## Why this is delegable

A small, closed feature with an obvious shape and an existing store pattern to
copy (`src/store/tabs.ts` persistence). It covers a large share of "I had that
file open ten minutes ago" without touching the search architecture.

## Read first

- `src/store/tabs.ts` — the `load`/`persist`/`commit` pattern and the
  `openFile()` helper at the bottom. Copy the persistence approach exactly.
- `src/components/SearchPalette.tsx` — you will add a section to this.
- `src/api.ts` — `formatDate`.
- `src/styles/shell.css` — the `.palette-*` block, around line 700.

## Scope

### 1. New store: `src/store/recent.ts`

```ts
export interface RecentEntry {
  path: string;      // workspace-relative
  title: string;     // display name at the time it was opened
  at: number;        // Date.now()
}
```

- Keeps the **20** most recent entries, most recent first.
- `record(path, title)` moves an existing path to the front rather than
  duplicating it, and updates its `title` and `at`.
- Persists to `localStorage` under `heaton-os.recent.v1`.
- Corrupt or absent payload → empty list, no throw. Copy the `try/catch`
  shape from `tabs.ts` `load()`.
- Export `useRecent` (zustand) plus a plain `record()` function, mirroring how
  `tabs.ts` exports both `useTabs` and `openFile`.

### 2. Record on open

In `src/store/tabs.ts`, the `openFile(path)` helper is the single funnel every
file open goes through. Call `record()` from there — **not** from each caller.
Use the filename (`path.split("/").pop()`) as the title.

Do not record app tabs (spaces, Files, Tasks…) — files only.

### 3. Surface it in the palette

In `SearchPalette.tsx`, when the query is **empty**, show a `Recent` section
listing the 8 most recent entries. When the query is non-empty the section
disappears and current behaviour is unchanged.

- Reuse the existing `palette-row` / `palette-doc` / `palette-title` /
  `palette-space` classes — no new visual language.
- The rows must join the existing keyboard navigation: they participate in the
  same `entries` array so ↑/↓/Enter work across them. Read how `rowClass()` and
  the `cursor` counter work before you start — the ordering of `rowClass()`
  calls must match the order entries are pushed into the `entries` array, or
  arrow-key selection will point at the wrong row.
- Show the filename as the title and the relative age as the hint, using the
  existing `.palette-hint` class. Age wording: `just now`, `12m ago`, `3h ago`,
  `2d ago`. Put this in a small exported helper so it is testable.
- Clicking a row calls `openFile(entry.path)` and closes the palette.

### 4. Test

Add `src/store/recent.test.ts` covering: cap at 20, move-to-front on repeat,
persistence round-trip, corrupt-payload fallback, and the age-wording helper at
each boundary. Use the `localStorage` stub pattern described in
[brief 01](01-tabs-store-tests.md).

## Out of scope

- No server changes. This is client-only.
- No "clear history" UI.
- No recording of scroll position (that is [brief 03](03-reader-navigation.md)).
- Do not change the palette's existing search behaviour in any way.

## Definition of done

```bash
npm test
npm run typecheck
```

- Opening files then pressing ⌘K with an empty query lists them, newest first.
- Re-opening a file moves it to the top rather than adding a second row.
- ↑/↓/Enter select recent rows correctly (check by hand — this is the one part
  a test won't catch).
- A reload preserves the list.

## House rules

Inherit all rules in [README.md](README.md).
