# Brief 04 — Incremental indexing

**Model:** Sonnet · **Estimated size:** ~200 lines across 4 files · **Risk:** medium

## Why this is delegable

A pure performance refactor with an exact behavioural contract: **the output
must not change at all**. That makes it unusually safe to hand over — the test
is "does it still produce identical results, faster", which is mechanically
checkable. No product judgement anywhere.

## The problem

`server/state.ts` `rebuild()` currently runs on **every** filesystem change
(debounced 800ms). It re-walks the whole workspace, reads and SHA-256-hashes
every markdown file, and rebuilds both the MiniSearch index and the entire
backlink graph — regardless of how many files actually changed. One save costs
a full-corpus pass.

## Read first — all of these, before writing anything

- `server/state.ts` — the watcher and `rebuild()`.
- `server/corpus.ts` — `scanCorpus`, `CorpusDoc`.
- `server/search.ts` — `buildSearchIndex`.
- `server/backlinks.ts` — `buildBacklinks`. **Read this most carefully**; see
  the trap below.
- `server/config.ts` — `isIgnored`.

## Scope

Replace the full rebuild with an incremental update keyed on the changed paths
the watcher already collects.

### Required behaviour

1. **Add** `updateCorpus(corpus, root, changedPaths)` to `corpus.ts` — re-stat
   and re-read only those paths, delete entries whose file is gone, add entries
   for new markdown files, and leave every other entry untouched by identity.
2. **Search index:** use MiniSearch's `discard`/`replace`/`add` for changed
   documents rather than constructing a new index. Consult the installed
   MiniSearch version's API before assuming a method exists.
3. **Backlinks:** see the trap. A correct incremental update here is the whole
   difficulty of this brief.
4. Keep the existing debounce, the existing change broadcast, and the exact
   shape of every payload.
5. On the **initial** boot, behaviour is unchanged — a full scan.

### The trap — read twice

`buildBacklinks` produces a **global inverse graph**: for each document, the
set of *other* documents referencing it. Editing document A can therefore
change the backlinks of documents B, C and D — including documents that did not
change and are not in `changedPaths`.

Naively updating only the changed paths' entries will leave stale backlinks
pointing from documents that no longer reference the target. This is exactly
the kind of bug that looks fine in casual use and is wrong.

Two acceptable approaches:

- **(preferred)** Maintain the *forward* map (`doc → refs it makes`) alongside
  the inverse. On change, diff the changed document's forward set against its
  previous one, and apply only the resulting add/remove operations to the
  inverse map. This is O(refs in the changed doc).
- **(acceptable)** Keep rebuilding backlinks in full, and make only the corpus
  scan and search index incremental. Backlink rebuild is cheap relative to
  reading every file from disk. **If you choose this, say so explicitly in your
  report** — it is a legitimate trade, not a failure, but it must be a stated
  decision rather than an oversight.

Do not invent a third approach without flagging it.

## Correctness gate — the important part

Add `server/state.test.ts` proving incremental and full rebuilds agree. This is
the deliverable that makes the refactor trustworthy:

- Copy the fixture workspace to a temp directory (`fs.mkdtemp`) so tests never
  touch `fixtures/` on disk.
- For each of: **edit** a file's body, **add** a new markdown file, **delete**
  a file, **rename** a file, and **add a reference** from one doc to another —
  apply the change, run the incremental path, then run a full `scanCorpus` +
  `buildSearchIndex` + `buildBacklinks` from scratch, and assert:
  - the corpus doc sets and every doc's `hash` are identical;
  - the backlink map is deeply equal (compare sorted, so ordering differences
    don't produce false failures);
  - a search for a term unique to the edited file returns the same paths.
- Include the case that catches the trap: **remove** a reference from doc A to
  doc B, then assert B's backlinks no longer contain A.

## Out of scope

- Do not touch the semantic index (`semantic.ts`) — it already caches by hash
  and is a separate concern.
- Do not change `/api/tree` (that rebuilds per request; a separate issue).
- No API-shape changes. Clients must not need modifying.

## Definition of done

```bash
npm test          # including the new agreement tests
npm run typecheck
```

- All existing tests still pass, unmodified.
- `server/state.test.ts` proves incremental ≡ full for all five change kinds.
- Report: which backlink approach you took and why, plus a rough before/after
  timing for a single-file change against the fixture workspace.

## House rules

Inherit all rules in [README.md](README.md).
