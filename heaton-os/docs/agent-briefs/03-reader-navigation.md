# Brief 03 — Reader navigation: contents, position, next/prev, backlinks

**Model:** Sonnet · **Estimated size:** ~300 lines across 4 files · **Risk:** medium

## Why this is delegable

Four well-understood navigation patterns with no open design questions. Each is
independently assertable in the browser. The visual language already exists —
this brief adds no new one.

## Read first

- `src/windows/ReaderWindow.tsx` — the whole file, including the live-update
  effect and the editing flow.
- `server/markdown.ts` — how HTML is produced. Headings currently have **no
  `id` attributes**; you will add them.
- `src/styles/shell.css` — the `.reader*` block (from ~line 339) and
  `.backlinks*` (~line 558).
- `src/tree-utils.ts` — `filesIn`, for the next/prev ordering.
- `src/api.ts` — `FileResponse`.

## Scope

### 1. Heading anchors (server)

In `server/markdown.ts`, give every `h1`–`h6` in the rendered output a stable
`id`, and return the heading list alongside the HTML:

```ts
export interface Heading { id: string; text: string; depth: number }
// RenderedMarkdown gains: headings: Heading[]
```

- Slug rule: lowercase, strip anything not `a-z0-9` or space/hyphen, collapse
  whitespace to `-`. On collision append `-2`, `-3`, … in document order.
- The slug must be **stable for the same document content** — the reading
  position feature depends on it.
- Add tests to a new `server/markdown.test.ts`: slug generation, collision
  handling, an all-punctuation heading (must still yield a usable id), and a
  heading containing an inline cross-reference (the `text` must be the plain
  text, not the HTML).

Thread `headings` through `/api/file` → `src/api.ts` `FileResponse`.

### 2. Contents rail (client)

In the Reader, when a document has **4 or more** headings, show a contents rail.

- Position it to the left of the reading column, inside `.reader`. The reading
  measure (`--reader-measure`) must not change and the body must stay centred
  in the remaining space.
- Below **1100px** of pane width, hide the rail entirely — do not stack it
  above the text.
- `h2` and `h3` only (skip `h1`, it's the title; skip `h4`+, too noisy).
  Indent `h3` one step.
- Clicking scrolls the heading into view (`scrollIntoView({ block: "start" })`)
  within `.pane-body`.
- The heading currently in view is marked active. Use `IntersectionObserver`
  against the scrolling ancestor, not a scroll handler. **Trap:** the scroll
  container is `.pane-body`, not the window — pass it as `root`.
- Hidden entirely while editing.

New tokens if you need them; no literals.

### 3. Reading position memory

Remember scroll position per document path, restore on reopen.

- Store in `localStorage` under `heaton-os.readpos.v1`, capped at 50 entries,
  evicting oldest.
- Save on scroll, throttled to no more than once per 250ms.
- Restore **after** the document HTML has rendered, or the container will not
  yet be tall enough and the restore will silently clamp to 0. Restoring inside
  a `requestAnimationFrame` after the content effect is the reliable point.
- Do not restore when the document was opened via a search hit — that should
  land at the top. `openFile` will need an optional flag; default to restoring.
- Never restore while editing.

### 4. Next / previous

Add prev/next controls to `.reader-meta` that move through the **sibling
markdown files in the same folder**, sorted the same way Files sorts A–Z
(`localeCompare(…, "en-GB")`).

- Derive siblings from the tree already in memory — do **not** add an endpoint.
  `ReaderWindow` does not currently receive the tree; thread it through from
  `ContentArea` (which has it) rather than fetching again.
- Disable (don't hide) at the ends, so the controls don't jump about.
- Opening a sibling replaces the current tab's document rather than opening a
  new tab — reuse the same tab id.

### 5. Promote backlinks

- Backlinks open by default when the document has any; collapsed when it has
  none.
- Add an **outbound** list beside it: the resolved `data-ref` targets in the
  rendered HTML, deduplicated, in document order. Query the rendered DOM for
  `a[data-ref]` — do not re-parse the markdown.
- Label them "Referenced by" and "Links to".

## Out of scope

- No changes to search, the palette, or the editor.
- No new server endpoints (heading data rides on the existing `/api/file`).
- Do not touch the type scale or borders — that is a separate design task.

## Traps in this codebase

- The Reader **re-fetches on live-update** (`liveSeq` effect). Your position
  restore must not fight it — restore on document *identity* change, not on
  every `doc` object change.
- `.pane-body` is the scroll container; `.reader` is not scrollable.
- The Reader is rendered in **both panes**. Nothing may key off a global
  singleton — everything must be per-`windowId`.
- `dangerouslySetInnerHTML` replaces the DOM wholesale, so any observer you
  attach must be re-established when the HTML changes.

## Definition of done

```bash
npm test          # includes your new markdown tests
npm run typecheck
```

Verified by hand in the running app (`npm run os`, point `.env` at
`fixtures/sample-workspace`):

- A long document shows the rail; the active entry tracks scrolling.
- Reopening a document returns to where you were; opening from search does not.
- Next/prev walks the folder in A–Z order and disables at both ends.
- Backlinks are open by default, and "Links to" lists the document's own
  outbound refs.
- Split view: two Readers side by side each track their own position and rail.
- At a narrow pane width the rail disappears and the text stays centred.

## House rules

Inherit all rules in [README.md](README.md).
