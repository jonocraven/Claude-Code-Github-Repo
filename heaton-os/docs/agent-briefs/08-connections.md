# Brief 08 — The connection graph: orphans, hubs, and the seams between spaces

**Model:** Sonnet · **Estimated size:** ~140 lines · **Risk:** low-medium

## Why this is delegable

The graph is already built and maintained in memory — `BacklinkIndex` and
`ForwardIndex` in `server/state.ts`. This brief is **only** the analysis over
it, and every question it answers has one correct answer given a corpus, so
every one is a deep-equality assertion against a hand-built fixture graph. No
product judgement, no visual decision. The UI is **not** in scope.

## The problem it addresses

The workspace is eight spaces that barely know about each other. The app can
already answer "what links *to this document*" once you are looking at it —
but that only helps if you already found it. Three questions it cannot answer
at all:

- **What connects across spaces?** A link from House Move to Finances is a
  seam between two silos, and those are the interesting ones. They are
  currently invisible.
- **What is orphaned?** A document nothing links to and nothing has touched is
  usually something that was written once and forgotten.
- **What is load-bearing?** A document many others point at is one you should
  not casually restructure.

## Read first

- `server/backlinks.ts` — `Backlink`, `BacklinkIndex`, `ForwardIndex`,
  `buildBacklinks`, `buildForwardIndex`, `computeForwardRefs`.
- `server/state.ts` — where both indexes live, and the membership-change
  fallback comment (brief 04) explaining when the graph is rebuilt wholesale.
- `server/paths.ts` — `spaceOf`. This is the *only* definition of which space
  a path belongs to; do not write a second one.
- `server/corpus.ts` — `Corpus`, `CorpusDoc`, and note that `docs` holds only
  markdown while `files` holds everything.
- `server/today.ts` — the house style for a module of this kind: pure exported
  functions taking their data as arguments, with the ranking rules as named
  constants at the top. Copy that structure exactly.

## Scope

Create `server/connections.ts`. Pure functions only — nothing in it may read
the filesystem or reference `WORKSPACE_ROOT`. It takes the corpus and the two
indexes as arguments. (This is house rule 11: a module that closes over
`WORKSPACE_ROOT` cannot be tested against a fixture, and this repo has been
bitten by that twice.)

### 1. Cross-space links

```ts
export interface CrossLink {
  source: string;       // workspace-relative path
  sourceTitle: string;
  sourceSpace: string;  // never null — root docs are excluded, see below
  target: string;
  targetTitle: string;
  targetSpace: string;
  snippet: string;      // reuse the Backlink snippet, do not invent another
}
```

`crossSpaceLinks(corpus, forward)` returns every reference whose source and
target are in **different** spaces. Rules:

- A document outside `Spaces/` (`spaceOf` returns null) is excluded on both
  ends. Root-level docs like `CLAUDE.md` link everywhere by nature and would
  swamp the result with noise, which is the opposite of the point.
- Deduplicate: one entry per (source, target) pair.
- Sort by source space then source path then target path, `en-GB`.

### 2. Orphans

```ts
export interface Orphan { path: string; title: string; space: string | null; modified: string; }
```

`orphans(corpus, backlinks)` returns markdown documents with **zero** inbound
references. Exclusions, each of which must have its own test:

- `MEMORY.md` and `CLAUDE.md` at any level — these are entry points by
  design; nothing links to them and nothing should.
- Anything under `Scheduled/` — those are run definitions, not notes.
- A document that is *itself* an index (has three or more outbound refs) — it
  is a hub, not an orphan, even if nothing points back at it.

Sort by `modified` ascending: the stalest orphan first, because age is what
makes an orphan worth looking at.

### 3. Hubs

```ts
export interface Hub { path: string; title: string; space: string | null; inbound: number; outbound: number; }
```

`hubs(corpus, backlinks, forward, limit = 10)` returns documents ranked by
`inbound + outbound`, descending, ties broken by path `en-GB`. Include only
documents where `inbound + outbound >= 2` — a single link is not a hub, and
padding the list to reach `limit` would make the number meaningless.

### 4. Per-space summary

```ts
export interface SpaceConnections {
  space: string;
  docs: number;
  internalLinks: number;   // both ends inside this space
  outboundCross: number;   // this space → another
  inboundCross: number;    // another → this space
  orphans: number;
}
```

`spaceConnections(corpus, backlinks, forward)` returns one row per space that
has at least one document, sorted by space name `en-GB`.

### 5. The route

`GET /api/connections` in `server/index.ts`, returning
`{ crossLinks, orphans, hubs, spaces }`, reading everything from `getState()`.
Follow the shape of the existing `/api/backlinks` route. No query parameters.

## Tests — required

`server/connections.test.ts`. Build small **hand-written** corpora in the test
file — a `Corpus` is a `Set` and a `Map`, so this needs no filesystem and no
fixture directory. Cover at minimum:

- A link from `Spaces/House-Move/a.md` to `Spaces/Finances/b.md` appears once,
  with both spaces named correctly.
- A link within one space does **not** appear in `crossSpaceLinks`.
- A link from `CLAUDE.md` (root) to a space document does not appear.
- Each orphan exclusion, separately: `MEMORY.md`, `Scheduled/`, and the
  three-outbound-refs hub rule (test the boundary: 2 refs is still an orphan,
  3 is not).
- Orphan ordering is stalest-first.
- `hubs` excludes a document with exactly 1 total link and includes one with 2.
- `spaceConnections` counts inbound and outbound cross-links separately and
  does not double-count a link as both.

**Every threshold in this brief (3 outbound refs, 2 total links) must have a
test at the boundary on both sides.** A threshold tested only in the middle is
not tested.

## Out of scope

- **No UI.** Do not create a window, do not touch `src/`, do not add anything
  to `src/api.ts`. The surface that consumes this is a design problem and is
  being handled separately.
- No new graph maintenance — read the indexes that already exist, do not add a
  parallel one and do not touch `incrementalUpdate`.
- No pagination, no filtering parameters.

## Definition of done

```bash
npm test
npm run typecheck
curl -s localhost:4400/api/connections | head -c 400   # paste the real output
```

## House rules

Inherit all rules in [README.md](README.md). Rule 10 especially: this brief was
written from a reading of the code, and if any of it contradicts what is
actually there, report that rather than bending the code to fit.
