# Brief 07 — Derive recent activity from state, not from a fresh walk

**Model:** Sonnet · **Estimated size:** ~90 lines · **Risk:** low

## Why this is delegable

Same shape as brief 06, which is the pattern to copy: an exact behavioural
contract ("the JSON must not change"), an existing place for derived state to
live, and a deep-equality assertion as the acceptance test. No design decision.

## The problem

`server/recent.ts` walks the whole workspace and issues an `fs.stat` per file
on **every** request to `/api/recent`:

```ts
export async function recentActivity(days: number): Promise<ActivityDay[]> {
  const cutoff = ...;
  const all: ActivityFile[] = [];
  await walk(WORKSPACE_ROOT, WORKSPACE_ROOT, all);   // ← every request
  ...
}
```

The Activity window refetches whenever the range control changes (7/14/30
days), so flicking between ranges triggers three full walks of a Drive-synced
folder. Brief 06 already put a complete, watcher-maintained `TreeDir` in
`AppState` carrying `path`, `name`, `ext`, `size` and `modified` for every
non-ignored file — which is exactly and only what `ActivityFile` needs.

## Read first

- `server/recent.ts` — the whole file. Note `spaceOf` and `areaOf`.
- `server/state.ts` — `AppState.tree`, `rebuild`, `incrementalUpdate`.
- `server/tree.ts` — the `TreeDir` / `TreeFile` shapes.
- `server/index.ts` — the `/api/recent` route, and how `/api/tree` (brief 06)
  now reads from state. Copy that.
- `scripts/probe-tree.mjs` — the end-to-end probe pattern, and read the
  comment at the top explaining why it exists. You will need the same thing.

## Scope

1. Flatten `getState().tree` into the `ActivityFile[]` list instead of walking
   the filesystem. Keep `spaceOf` / `areaOf` exactly as they are.
2. The `days` filter, day bucketing, and both sort orders (files newest-first
   within a day; days newest-first) must be **byte-identical** in output to the
   current implementation.
3. `recentActivity` currently takes only `days`. Keep that signature working,
   but take the tree as an argument (or via `getState()`) in whatever way makes
   it testable against a fixture — `server/recent.ts` must not end up closing
   over `WORKSPACE_ROOT` in a way that makes it untestable, which is precisely
   the trap brief 06 fell into (see house rule 11).
4. The ignore convention must still apply. It already does via the tree, so
   this should be free — prove it rather than asserting it.

## Tests — required

1. **Equality contract.** Against a temp fixture, assert the new
   implementation's output deep-equals the old one's, for `days` = 7, 14 and
   30. Copy the old function into the test file as the oracle if that is the
   clearest way to express it, and say in a comment that it is an oracle.
2. **Bucketing edges.** A file modified exactly on the cutoff boundary; two
   files in the same day; a day with no files (must not appear as an empty
   bucket).
3. **Ignore convention.** A file named `Draft (ignore).md` never appears.

## Also required: an end-to-end probe

Because `recentActivity` is reached through a module-level `WORKSPACE_ROOT`,
unit tests can pass while the wired-up path is broken — this repo has already
been bitten by exactly that (house rule 11). Add
`scripts/probe-recent.mjs`, modelled on `scripts/probe-tree.mjs`, wired to
`npm run probe:recent`, which boots the server against a temp workspace and
asserts over HTTP that:

- `/api/recent?days=14` returns the fixture's files;
- writing a new file makes it appear in the response within a few seconds;
- deleting it makes it disappear;
- a `(ignore)`-marked file never appears.

Show that it **fails** if you break the derivation, and passes when restored.

## Out of scope

- No change to the `ActivityFile` / `ActivityDay` shape or any field's meaning.
- No change to the Activity window or anything under `src/`.
- Do not touch the corpus, search index, backlinks, or `/api/tree`.

## Definition of done

```bash
npm test
npm run typecheck
npm run probe:recent
```

## House rules

Inherit all rules in [README.md](README.md). Rules 8, 9, 11 and 12 especially:
paste real output, mutation-check, don't let a mirror of the implementation
stand in for coverage of it, and verify your base commit first.
