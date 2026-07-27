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
Work on the current branch. Do not start until you have read every file in
the "Read first" section.
```

Then check the "Definition of done" yourself before merging — every brief
states its checks as commands so this takes a minute, not a review pass.

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
