import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanCorpus, updateCorpus, type Corpus } from "./corpus.js";
import { buildSearchIndex, updateSearchIndex, searchKeyword } from "./search.js";
import {
  buildBacklinks,
  buildForwardIndex,
  updateBacklinks,
  type BacklinkIndex,
  type ForwardIndex,
} from "./backlinks.js";

/**
 * Brief 04's correctness gate: incremental and full rebuilds must agree.
 * Everything runs against a temp copy of the fixture workspace (fs.mkdtemp)
 * so nothing here ever touches fixtures/ on disk.
 */

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "sample-workspace"
);

let root: string;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "heaton-os-state-test-"));
  await fs.cp(FIXTURE, root, { recursive: true });
});

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

interface Live {
  corpus: Corpus;
  search: ReturnType<typeof buildSearchIndex>;
  backlinks: BacklinkIndex;
  forward: ForwardIndex;
}

const write = (rel: string, body: string) =>
  fs.writeFile(path.join(root, rel), body, "utf8");
const remove = (rel: string) => fs.rm(path.join(root, rel), { force: true });

async function boot(): Promise<Live> {
  const corpus = await scanCorpus(root);
  return {
    corpus,
    search: buildSearchIndex(corpus),
    backlinks: buildBacklinks(corpus),
    forward: buildForwardIndex(corpus),
  };
}

/**
 * Mirrors server/state.ts `incrementalUpdate` exactly — including the
 * membership-change fallback. Exercising the primitives without it would let
 * the suite pass while the real orchestration drifts, which is precisely how
 * the drift below went unnoticed.
 */
async function applyIncremental(live: Live, changedPaths: string[]): Promise<void> {
  const existedBefore = changedPaths.map((p) => live.corpus.files.has(p));
  await updateCorpus(live.corpus, root, changedPaths);
  updateSearchIndex(live.search, live.corpus, changedPaths);
  const membershipHeld = changedPaths.every(
    (p, i) => live.corpus.files.has(p) === existedBefore[i]
  );
  if (!membershipHeld) {
    live.backlinks = buildBacklinks(live.corpus);
    live.forward = buildForwardIndex(live.corpus);
    return;
  }
  updateBacklinks(live.backlinks, live.forward, live.corpus, changedPaths);
}

async function fullRebuild(): Promise<{
  corpus: Corpus;
  search: ReturnType<typeof buildSearchIndex>;
  backlinks: BacklinkIndex;
}> {
  const corpus = await scanCorpus(root);
  return { corpus, search: buildSearchIndex(corpus), backlinks: buildBacklinks(corpus) };
}

/** Sorted so Map/array iteration-order differences don't cause false failures. */
function normaliseBacklinks(index: BacklinkIndex) {
  return [...index.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([target, list]) => [
      target,
      [...list].sort((a, b) => a.source.localeCompare(b.source)),
    ]);
}

function assertAgreement(
  incremental: Live,
  full: Awaited<ReturnType<typeof fullRebuild>>
): void {
  expect([...incremental.corpus.files].sort()).toEqual([...full.corpus.files].sort());
  expect([...incremental.corpus.docs.keys()].sort()).toEqual(
    [...full.corpus.docs.keys()].sort()
  );
  for (const [p, doc] of incremental.corpus.docs) {
    expect(doc.hash, `hash mismatch for ${p}`).toBe(full.corpus.docs.get(p)!.hash);
  }
  expect(normaliseBacklinks(incremental.backlinks)).toEqual(normaliseBacklinks(full.backlinks));
}

function searchPaths(
  index: ReturnType<typeof buildSearchIndex>,
  corpus: Corpus,
  term: string
): string[] {
  return searchKeyword(index, corpus, term, null)
    .map((h) => h.path)
    .sort();
}

const AREA_RESEARCH = "Spaces/House-Move/Resources/area-research-jesmond.md";
const WEEK_29_PLAN = "Spaces/Cookery-Books/Plans/week-29-plan.md";

describe("incremental update agrees with a full rebuild", () => {
  /**
   * The cases below apply one change to a freshly-booted index. This one keeps
   * a single long-lived index alive across a whole sequence, which is how the
   * server actually runs. Drift only shows up cumulatively: a reference
   * resolves against `corpus.files`, so creating or deleting any file changes
   * how *unchanged* documents' references resolve, and those documents are
   * never in `changedPaths`. Before the membership-change fallback existed,
   * this diverged from a full rebuild within two create/delete cycles.
   */
  it("stays in agreement across a long sequence on one long-lived index", async () => {
    await write("a.md", "# A\nSee `b.md` and `c.md`.\n");
    await write("b.md", "# B\nSee `c.md`.\n");
    await write("c.md", "# C\nNothing.\n");
    const live = await boot();

    const steps: Array<[string, () => Promise<void>, string[]]> = [
      ["edit body only", () => write("c.md", "# C\nEdited.\n"), ["c.md"]],
      ["drop a ref", () => write("a.md", "# A\nSee `c.md` only.\n"), ["a.md"]],
      ["restore the ref", () => write("a.md", "# A\nSee `b.md` and `c.md`.\n"), ["a.md"]],
      ["delete a referenced doc", () => remove("c.md"), ["c.md"]],
      ["recreate it", () => write("c.md", "# C\nBack.\n"), ["c.md"]],
      [
        "rename (delete + add)",
        async () => {
          await remove("b.md");
          await write("b2.md", "# B\nSee `c.md`.\n");
        },
        ["b.md", "b2.md"],
      ],
      ["point at a missing file", () => write("a.md", "# A\nSee `gone.md`.\n"), ["a.md"]],
    ];

    for (const [label, mutate, changed] of steps) {
      await mutate();
      await applyIncremental(live, changed);
      const full = await fullRebuild();
      expect(normaliseBacklinks(live.backlinks), `backlinks drifted after: ${label}`).toEqual(
        normaliseBacklinks(full.backlinks)
      );
      expect([...live.corpus.files].sort(), `corpus drifted after: ${label}`).toEqual(
        [...full.corpus.files].sort()
      );
    }
  });

  it("editing a file's body: same hash, same backlinks, same search hit", async () => {
    const live = await boot();

    const abs = path.join(root, AREA_RESEARCH);
    const original = await fs.readFile(abs, "utf8");
    const unique = "Kumquat77Marker";
    await fs.writeFile(abs, `${original}\n\n${unique} is this edit's unique term.\n`, "utf8");

    await applyIncremental(live, [AREA_RESEARCH]);
    const full = await fullRebuild();

    assertAgreement(live, full);
    expect(searchPaths(live.search, live.corpus, unique)).toEqual(
      searchPaths(full.search, full.corpus, unique)
    );
    expect(searchPaths(live.search, live.corpus, unique)).toEqual([AREA_RESEARCH]);
  });

  it("adding a new markdown file: appears in corpus, search and (absence of) backlinks identically", async () => {
    const live = await boot();

    const newPath = "Spaces/Home/new-note-xyz.md";
    const unique = "Zephyrfoo99Marker";
    await fs.writeFile(
      path.join(root, newPath),
      `# New note\n\n${unique} is unique to this new file.\n`,
      "utf8"
    );

    await applyIncremental(live, [newPath]);
    const full = await fullRebuild();

    assertAgreement(live, full);
    expect(live.corpus.docs.has(newPath)).toBe(true);
    expect(searchPaths(live.search, live.corpus, unique)).toEqual([newPath]);
    expect(searchPaths(live.search, live.corpus, unique)).toEqual(
      searchPaths(full.search, full.corpus, unique)
    );
  });

  it("deleting a file that other documents reference: target key disappears from backlinks in both", async () => {
    const live = await boot();

    // Sanity: week-29-plan.md has an inbound backlink before the delete.
    expect((live.backlinks.get(WEEK_29_PLAN) ?? []).map((b) => b.source)).toContain(
      AREA_RESEARCH
    );

    await fs.rm(path.join(root, WEEK_29_PLAN));

    await applyIncremental(live, [WEEK_29_PLAN]);
    const full = await fullRebuild();

    assertAgreement(live, full);
    expect(live.corpus.docs.has(WEEK_29_PLAN)).toBe(false);
    expect(live.backlinks.has(WEEK_29_PLAN)).toBe(false);
    expect(full.backlinks.has(WEEK_29_PLAN)).toBe(false);
  });

  it("renaming a file: old path gone, new path present, identically in both", async () => {
    const live = await boot();

    const oldPath = "Spaces/Life-Plan/Resources/scenarios/scenario-move-south.md";
    const newPath = "Spaces/Life-Plan/Resources/scenarios/scenario-move-south-renamed.md";
    await fs.rename(path.join(root, oldPath), path.join(root, newPath));

    await applyIncremental(live, [oldPath, newPath]);
    const full = await fullRebuild();

    assertAgreement(live, full);
    expect(live.corpus.docs.has(oldPath)).toBe(false);
    expect(live.corpus.docs.has(newPath)).toBe(true);
  });

  it("adding a reference from one doc to another: new backlink entry lands identically", async () => {
    const live = await boot();

    const source = "Spaces/Home/MEMORY.md";
    const target = "Spaces/Finances/MEMORY.md";
    const original = await fs.readFile(path.join(root, source), "utf8");
    await fs.writeFile(
      path.join(root, source),
      `${original}\nSee also [Finances](../Finances/MEMORY.md) for shared budget notes.\n`,
      "utf8"
    );

    await applyIncremental(live, [source]);
    const full = await fullRebuild();

    assertAgreement(live, full);
    expect((live.backlinks.get(target) ?? []).map((b) => b.source)).toContain(source);
  });

  it("THE TRAP: removing a reference from A to B updates B's backlinks even though B did not change", async () => {
    const live = await boot();

    // Before the edit, area-research-jesmond.md is a source of week-29-plan.md.
    expect((live.backlinks.get(WEEK_29_PLAN) ?? []).map((b) => b.source)).toContain(
      AREA_RESEARCH
    );

    const abs = path.join(root, AREA_RESEARCH);
    const original = await fs.readFile(abs, "utf8");
    const withoutLink = original.replace(
      /See also \[the weekly plan\]\(\.\.\/\.\.\/Cookery-Books\/Plans\/week-29-plan\.md\)\s*\n/,
      ""
    );
    expect(withoutLink).not.toBe(original); // guard: the replace actually matched
    await fs.writeFile(abs, withoutLink, "utf8");

    // Only A (the edited doc) is in changedPaths — B never touched on disk.
    await applyIncremental(live, [AREA_RESEARCH]);
    const full = await fullRebuild();

    assertAgreement(live, full);

    // The trap itself: B's backlink list must no longer contain A.
    const remaining = (live.backlinks.get(WEEK_29_PLAN) ?? []).map((b) => b.source);
    expect(remaining).not.toContain(AREA_RESEARCH);
    expect((full.backlinks.get(WEEK_29_PLAN) ?? []).map((b) => b.source)).not.toContain(
      AREA_RESEARCH
    );
  });
});
