# Brief 01 — Test suite for the tabs store

**Model:** Haiku · **Estimated size:** one file, ~250 lines · **Risk:** very low

## Why this is delegable

Pure state transitions. No network, no filesystem, no rendering, no design
decisions. The behaviour is already specified below, and the whole job is
verified by `npm test`. There are currently **zero** client-side tests and
`src/store/tabs.ts` carries 351 lines of freshly-added logic (tab previews,
pinning, close-others, a persistence migration) that nothing covers.

## Read first

- `src/store/tabs.ts` — the whole file. This is what you are testing.
- `server/tree.test.ts` — copy this file's style: `describe`/`it`, plain
  `expect`, British spelling in test names, no helper frameworks.
- `package.json` — note `npm test` runs `vitest run`.

## Scope

Create **`src/store/tabs.test.ts`**. Do not modify `tabs.ts` — if you believe
you have found a bug, write a failing test, leave it `.skip`ped with a comment
explaining the suspected defect, and report it. Do not "fix" the store.

### Setup you will need

The store reads `localStorage` at module load and is a module-level singleton,
so tests must control both. Use this pattern:

```ts
// vitest runs in node by default — provide a minimal localStorage before
// the store module is imported, and re-import per test with resetModules.
beforeEach(() => {
  const mem = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
    clear: () => mem.clear(),
  });
  vi.resetModules();
});
```

Then inside each test: `const { useTabs } = await import("./tabs.js");` and
drive it with `useTabs.getState()`. Seed persisted state by writing to
`localStorage` under the key `heaton-os.tabs.v1` *before* the import.

### The trap that broke the first attempt at this brief

`getState()` returns a **snapshot**. Action references on it survive a `set()`,
but data references do not — so this silently asserts against history:

```ts
const state = useTabs.getState();
state.openTab({ appId: "reader" });   // fine: actions are stable
expect(state.tabs).toHaveLength(1);   // WRONG: `state.tabs` predates the action
```

Re-read the state after every action that changes it:

```ts
expect(useTabs.getState().tabs).toHaveLength(1);   // correct
```

The first run of this brief made that mistake 81 times and 19 of 26 tests
failed. Calling actions off a captured `state` is fine; reading `tabs`,
`activeLeft`, `activeRight`, `split`, `activePane` or `sidebarCollapsed` off
one is not.

## Behaviours to cover

Each bullet is one `it(...)`. The expected behaviour is authoritative — if the
code disagrees, the code is wrong (see "found a bug" above).

**Preview (transient) tabs**
1. `openTab` defaults to `transient: true`.
2. Opening a second preview in the same pane **replaces** the first — tab count
   stays the same, and the old tab's id is gone.
3. Opening a preview in the *right* pane does not disturb a preview in the left.
4. `openTab({ transient: false })` appends without evicting the pane's preview.

**Pinning**
5. `pinTab` clears `transient`, and a subsequently-opened preview no longer
   evicts it.
6. `pinTab` on an already-kept tab is a no-op (state object unchanged in effect).
7. Re-opening the same app/instanceKey with `transient: false` promotes an
   existing preview to kept rather than creating a duplicate.
8. Re-opening the same app/instanceKey with `transient: true` does **not**
   demote a kept tab back to a preview.

**Identity**
9. `openTab` twice with the same `appId` + `instanceKey` yields one tab, and
   activates the existing one.
10. Different `instanceKey` values for the same `appId` are separate
    identities — prove it with `transient: false` on both, because two
    *previews* in one pane correctly collapse to a single tab. Assert that
    collapsing behaviour as its own test rather than treating it as a bug.
    (The original wording of this item predated previews and was wrong.)
11. `appId: "search"` never creates a tab.

**Closing**
12. `closeTab` removes only the named tab.
13. Closing the active tab moves activation to another tab in the same pane.
14. `closeOthers` leaves exactly one tab in that pane, keeps it (not preview),
    and leaves the *other* pane untouched.
15. Closing the last right-pane tab collapses the split (`split === false`,
    `activeRight === null`).
16. Closing the last left-pane tab while the right has tabs pulls them back to
    the left and collapses the split.

**Split**
17. `sendToRight` refuses when it would empty the left pane (fewer than two
    tabs on the left).
18. `sendToRight` pins the moved tab.

**Persistence & migration**
19. State written by one instance is restored on re-import (tabs, activeLeft,
    split, sidebarCollapsed). Build the split with `sendToRight` — that is
    what sets `split`. Opening straight into the right pane sets `activeRight`
    without `split`, a state the UI cannot reach, so don't assert against it.
    Note the re-imported store is a *different* binding: assert on the new one,
    not the one you captured before `vi.resetModules()`.
20. **Migration:** persisted tabs with no `transient` field restore as
    `transient: false`. Seed a payload whose tab objects omit the key entirely.
21. `activeRight` is dropped on load when `split` was false.
22. A corrupt payload (`"not json"`, or `{"tabs":"nope"}`) falls back to empty
    state without throwing.
23. **Id collision:** seed persisted tabs `tab-0`…`tab-4`, then open a new tab;
    its id must not collide with any restored id.

**Cycling**
24. `cycle` moves to the next tab within the active pane and wraps.
25. `cycle` is a no-op with fewer than two tabs in the pane.

## Definition of done

```bash
npm test          # all pass, including your new file
npm run typecheck # clean
```

- `src/store/tabs.test.ts` exists and covers all 25 behaviours above.
- No `any`, no non-null assertions on values you have not just asserted exist.
- `src/store/tabs.ts` is **unmodified** (`git diff --stat` shows only the new
  test file).
- Report: any behaviour where the code disagreed with this spec.

## House rules

Inherit all rules in [README.md](README.md).
