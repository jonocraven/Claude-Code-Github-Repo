# Agent briefs — delegating the next phases

> **What:** Self-contained specs for work that can be handed to a cheaper model
> (Sonnet or Haiku) instead of being done by hand.
> **Why:** Several roadmap items are closed-form and testable. Those are worth
> delegating; the ones that turn on product judgement or visual taste are not.
> **Status:** Five briefs ready. None have been run yet.

## The rule used to decide

A task is safe to delegate when **all** of these hold:

- The shape of the answer is decided in advance — the agent implements a spec,
  it doesn't choose one.
- Success is checkable by a command, not by an opinion (`npm test`,
  `npm run typecheck`, a measured contrast ratio, a Playwright assertion).
- There is an existing pattern in this codebase to copy.
- Being subtly wrong is *detectable*. Silent plausible wrongness is the real
  cost of a cheap model, so anything where "looks fine but isn't" survives
  review should not be delegated.

It is **not** safe to delegate when the task *is* the judgement — picking a
schema, deciding what a screen is for, or setting visual weight. A cheap model
will produce something plausible and you will have to redo it, having also lost
the chance to think it through.

## What to delegate

| # | Brief | Model | Why it qualifies |
| --- | --- | --- | --- |
| 01 | [Tabs store test suite](01-tabs-store-tests.md) | Haiku | Pure functions, no I/O, no design. 351 lines of new logic with zero coverage. |
| 02 | [Recently-opened trail](02-recently-opened.md) | Haiku | Small closed feature, existing store pattern to copy. |
| 03 | [Reader navigation](03-reader-navigation.md) | Sonnet | TOC, position memory, next/prev, backlinks — all mechanical, all assertable. |
| 04 | [Incremental indexing](04-incremental-indexing.md) | Sonnet | Pure perf refactor with an exact behavioural contract: output must not change. |
| 05 | [Dark mode](05-dark-mode.md) | Sonnet | Token architecture already supports it, and the palette is supplied — so it's application plus measurement, not design. |

## What to keep in-house

| Item | Why not |
| --- | --- |
| **Today view** | The judgement *is* the deliverable — what earns a place, how it ranks, what "since you last looked" means. Delegating this delegates the product. |
| **Structured memory schema** | Data modelling. Get the schema wrong and everything built on it inherits the mistake. Design it first, *then* the parser is delegable (see note in 04). |
| **Visual hierarchy & type scale** | Taste. The whole task is deciding what recedes. |
| **Calendar merge — visual encoding** | Three event types in one cell without mush is a design problem. The *data* half could be delegated once the encoding is fixed. |
| **Ask about a space** | Architecture plus prompt design, and it's the feature most likely to be confidently wrong. |

## Running one

Each brief is self-contained. Point the agent at the file:

```
Read heaton-os/docs/agent-briefs/03-reader-navigation.md and implement it.
Do not start until you have read every file in the "Read first" section.
```

**Run it in its own git worktree.** Learned the hard way on brief 01: editing
the agent's files while it was still running produced a final report that
described a repo state the *reviewer* had created, and attribution became
impossible to unpick. Isolation makes that class of confusion structurally
impossible. A worktree has no `node_modules` (it is gitignored), so the agent
must run `npm install` there first.

**Make the agent verify its base commit before it writes anything.** Learned on
brief 02: the worktree was created from a commit predating the work the brief
depended on, so the agent built against a codebase without the features it was
extending — and then correctly reported test failures that were artefacts of
that stale base. It only transplanted because the two files it touched happened
not to have diverged. Briefs 03–05 touch files that *have* diverged, so a stale
base there produces work that simply does not apply.

Put this at the top of every agent prompt:

```bash
cd <worktree>
git fetch origin
git reset --hard origin/<the branch the work belongs on>
git log --oneline -1          # confirm this matches the branch head
ls heaton-os/docs/agent-briefs # if this is empty, you are on the wrong base — STOP
```

The last line is the cheap tell: the briefs live on the working branch, so if
the agent cannot see them in its own checkout, its base is wrong.

Then check the "Definition of done" yourself before merging — every brief
states its checks as commands so this takes a minute, not a review pass.

## Verifying the result — do not skip this

**An agent's own summary is not evidence.** On brief 01 the returned report
claimed "all 61 tests pass" and "no behaviours disagreed with the spec" when
19 of its 26 tests were failing and two spec items were genuinely wrong. It
also described a pre-existing file stub that had never existed. The prose was
confident and the checkable facts were false.

So: run the commands yourself. And for anything that claims to be a test,
**mutation-check it** — a test that passes without exercising the behaviour is
worse than no test, because it manufactures confidence. Revert a line of the
logic under test and confirm something goes red:

```bash
cp src/store/tabs.ts /tmp/bak
# ...break one branch of the logic...
npx vitest run src/store/tabs.test.ts   # must fail
cp /tmp/bak src/store/tabs.ts
```

## House rules every brief inherits

These apply to all delegated work in this repo and are repeated in each brief:

1. **Design values come from tokens.** No colour, size, shadow or font literal
   in a component — use `src/styles/tokens.css`. A new value means a new token.
2. **The workspace is sacred.** Nothing may write to `WORKSPACE_ROOT` except
   the existing `PUT /api/file`. Never add a write path.
3. **Never widen the server's bind.** It is loopback-only, deliberately.
4. **`npm run typecheck` and `npm test` must pass.** No `any`, no
   `@ts-expect-error`, no skipped tests.
5. **UK conventions** — DD-MM-YYYY, en-GB sorting and spelling.
6. **Don't reformat untouched code.** Keep diffs reviewable.
7. **Match the surrounding comment style** — comments here explain *why*, not
   what. Don't narrate the code.
8. **Report command output, not a narrative.** Paste the actual summary lines
   from `npm test`, `npm run typecheck` and `git status --short`. Do not
   describe what they said, and never report a result you did not personally
   watch a command produce. "It should pass" is not a result.
9. **Mutation-check anything you assert is a test.** Before claiming done,
   break one branch of the logic under test and show that a test goes red.
   Restore the logic afterwards and confirm the suite is green again. Report
   which mutation you used.
10. **If the spec is wrong, say so.** These briefs are written ahead of the
    work and sometimes describe behaviour that no longer exists. A spec item
    that contradicts the code is a finding to report, not a thing to quietly
    paper over — and "no discrepancies" when there were some is the single
    least useful thing you can return.
11. **Verify your base commit before writing anything** (see "Running one").
    If a test fails for a reason that looks unrelated to your work, check the
    base *before* dismissing it as pre-existing — on brief 02 four such
    failures were entirely an artefact of a stale checkout.
