# Brief 06 — Serve the file tree from state, not from a walk per request

**Model:** Sonnet · **Estimated size:** ~80 lines · **Risk:** low

## Why this is delegable

The behavioural contract is exact and mechanical: **the JSON `GET /api/tree`
returns must not change**. There is no design decision here, and the existing
incremental-indexing work (brief 04) already established the pattern this
copies — derived state lives in `server/state.ts`, the watcher refreshes it,
handlers read it. Being wrong is detectable by a deep-equality assertion.

## The problem

`server/index.ts`:

```ts
app.get("/api/tree", async (_req, reply) => {
  …
  return buildTree(WORKSPACE_ROOT);
});
```

`buildTree` recurses the whole workspace and issues an `fs.stat` per file, on
every request. The app calls `/api/tree` on boot and again on every websocket
change broadcast, and the real workspace is a Drive-synced folder of a few
hundred files where each `stat` may touch a network filesystem. Meanwhile
`server/state.ts` already holds a corpus rebuilt by the same watcher — the tree
is the one derived structure that was left out of it.

## Read first

- `server/state.ts` — `AppState`, `rebuild`, `incrementalUpdate`, `initState`.
  Note precisely where the watcher's debounce fires and what it does after.
- `server/tree.ts` — `buildTree` and the `TreeDir` / `TreeFile` shapes.
- `server/tree.test.ts` — the existing coverage and its fixture helpers.
- `server/index.ts` lines ~78–85 — the route, including the 503 branch.
- `server/config.ts` — `isIgnored`, the single ignore convention.

## Scope

### 1. Move the tree into `AppState`

Add `tree: TreeDir` to `AppState`. Populate it in `rebuild()`. This is the
boot path and is allowed to be a full walk.

### 2. Refresh it on change

In `incrementalUpdate`, refresh the tree as well. **Do not attempt a
surgical patch of the tree structure** — a changed file alters `fileCount` and
`latestModified` on every ancestor directory, and getting that wrong is exactly
the silent drift brief 04 hit. Call `buildTree` again. That is still a
strict improvement: once per debounced change burst instead of once per
request, and the debounce already collapses Drive sync storms.

If you can show a correct incremental variant *and* prove it agrees with a full
walk over a randomised sequence of at least 20 create/edit/delete/rename steps,
you may propose it — but ship the simple version and put the variant behind a
clearly-labelled follow-up note in the brief. Do not ship an unproven one.

### 3. Serve from state

The route becomes a read of `getState().tree`. Keep the 503
`workspace_not_found` branch exactly as it is — it must still fire when
`WORKSPACE_ROOT` has disappeared since boot.

### 4. Guard the ordering

`getState()` throws before `initState()` resolves. Confirm the route cannot be
reached in that window (check how `server/index.ts` sequences `initState` and
`listen`) and say what you found. If it *can*, fix it by keeping the route's
existing behaviour — fall back to a live `buildTree` — rather than by changing
the boot sequence.

## Tests — required

Add to `server/tree.test.ts` (or a new `server/state.test.ts` case; there is
already one, read it first):

1. **Equality contract.** Against a temp fixture directory, assert the cached
   tree deep-equals a fresh `buildTree` of the same root. This is the test that
   matters.
2. **Refresh.** Write a new file into the fixture, run the same code path
   `incrementalUpdate` runs, and assert the cached tree now contains it *and*
   that the ancestor `fileCount` and `latestModified` updated.
3. **Ignore convention still applies.** A file named e.g. `Scratch (ignore).md`
   does not appear in the cached tree.

Use the existing fixture/temp-dir helpers rather than inventing new ones.

## Out of scope

- No change to the `TreeDir` / `TreeFile` shape or to any field's meaning.
- No new endpoint, no caching headers, no ETag.
- Do not touch the corpus, search index or backlinks.

## Definition of done

```bash
npm test
npm run typecheck
```

- Deep-equality test present and passing.
- Route reads from state; 503 branch unchanged.
- Report what you found in §4.

## House rules

Inherit all rules in [README.md](README.md). Rules 8, 9 and 11 in particular:
paste real command output, mutation-check your tests, and verify your base
commit before writing anything.
