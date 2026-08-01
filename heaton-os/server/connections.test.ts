import { describe, expect, it } from "vitest";
import type { Corpus, CorpusDoc } from "./corpus.js";
import type { Backlink, BacklinkIndex, ForwardIndex } from "./backlinks.js";
import { crossSpaceLinks, hubs, orphans, spaceConnections } from "./connections.js";

/**
 * Every fixture here is hand-built — a `Corpus` is a `Set` and a `Map`, and
 * the two indexes are plain `Map`s too, so none of this needs a filesystem.
 * `connections.ts` is pure and never reads `WORKSPACE_ROOT` (house rule 11);
 * these tests are the proof.
 */

function doc(path: string, modified = "2024-01-01T00:00:00.000Z"): CorpusDoc {
  const title = path.split("/").pop()!.replace(/\.md$/i, "");
  return { path, title, headings: "", body: "", hash: "hash", modified };
}

function corpusOf(docs: CorpusDoc[]): Corpus {
  return {
    files: new Set(docs.map((d) => d.path)),
    docs: new Map(docs.map((d) => [d.path, d])),
  };
}

function backlink(source: string, snippet = "…"): Backlink {
  return { source, sourceTitle: source.split("/").pop()!.replace(/\.md$/i, ""), snippet };
}

/** Build the (backlinks, forward) pair from a plain list of source→target edges. */
function indexesFrom(edges: Array<[string, string]>): { backlinks: BacklinkIndex; forward: ForwardIndex } {
  const backlinks: BacklinkIndex = new Map();
  const forward: ForwardIndex = new Map();

  for (const [source, target] of edges) {
    const bl = backlink(source);

    const inbound = backlinks.get(target) ?? [];
    inbound.push(bl);
    backlinks.set(target, inbound);

    const outbound = forward.get(source) ?? new Map();
    outbound.set(target, bl);
    forward.set(source, outbound);
  }

  return { backlinks, forward };
}

describe("crossSpaceLinks", () => {
  it("includes a link from one space to another, with both spaces named", () => {
    const corpus = corpusOf([doc("Spaces/House-Move/a.md"), doc("Spaces/Finances/b.md")]);
    const { forward } = indexesFrom([["Spaces/House-Move/a.md", "Spaces/Finances/b.md"]]);

    const result = crossSpaceLinks(corpus, forward);

    expect(result).toEqual([
      {
        source: "Spaces/House-Move/a.md",
        sourceTitle: "a",
        sourceSpace: "House-Move",
        target: "Spaces/Finances/b.md",
        targetTitle: "b",
        targetSpace: "Finances",
        snippet: "…",
      },
    ]);
  });

  it("excludes a link within a single space", () => {
    const corpus = corpusOf([doc("Spaces/House-Move/a.md"), doc("Spaces/House-Move/c.md")]);
    const { forward } = indexesFrom([["Spaces/House-Move/c.md", "Spaces/House-Move/a.md"]]);

    expect(crossSpaceLinks(corpus, forward)).toEqual([]);
  });

  it("excludes a link from a root document (outside Spaces/)", () => {
    const corpus = corpusOf([doc("CLAUDE.md"), doc("Spaces/Finances/b.md")]);
    const { forward } = indexesFrom([["CLAUDE.md", "Spaces/Finances/b.md"]]);

    expect(crossSpaceLinks(corpus, forward)).toEqual([]);
  });

  it("excludes a link whose target is a root document", () => {
    const corpus = corpusOf([doc("Spaces/Finances/b.md"), doc("CLAUDE.md")]);
    const { forward } = indexesFrom([["Spaces/Finances/b.md", "CLAUDE.md"]]);

    expect(crossSpaceLinks(corpus, forward)).toEqual([]);
  });

  it("deduplicates to one entry per (source, target) pair", () => {
    // The forward index is itself keyed by target within a source, so a
    // second reference to the same target from the same source can only
    // ever refresh the one Map entry — there is no way to construct two.
    // This is the invariant that makes dedup automatic; assert it holds.
    const corpus = corpusOf([doc("Spaces/House-Move/a.md"), doc("Spaces/Finances/b.md")]);
    const forward: ForwardIndex = new Map([
      ["Spaces/House-Move/a.md", new Map([["Spaces/Finances/b.md", backlink("Spaces/House-Move/a.md")]])],
    ]);

    expect(crossSpaceLinks(corpus, forward)).toHaveLength(1);
  });

  it("sorts by source space, then source path, then target path (en-GB)", () => {
    const corpus = corpusOf([
      doc("Spaces/House-Move/z.md"),
      doc("Spaces/House-Move/a.md"),
      doc("Spaces/Finances/x.md"),
      doc("Spaces/Finances/y.md"),
      doc("Spaces/Cookery-Books/m.md"),
    ]);
    const { forward } = indexesFrom([
      ["Spaces/House-Move/z.md", "Spaces/Finances/x.md"],
      ["Spaces/House-Move/a.md", "Spaces/Finances/y.md"],
      ["Spaces/Cookery-Books/m.md", "Spaces/Finances/x.md"],
    ]);

    const result = crossSpaceLinks(corpus, forward).map((l) => l.source);

    expect(result).toEqual([
      "Spaces/Cookery-Books/m.md",
      "Spaces/House-Move/a.md",
      "Spaces/House-Move/z.md",
    ]);
  });
});

describe("orphans", () => {
  it("excludes MEMORY.md at root and at any nested level", () => {
    const corpus = corpusOf([doc("MEMORY.md"), doc("Spaces/Finances/MEMORY.md")]);
    const { backlinks, forward } = indexesFrom([]);

    expect(orphans(corpus, backlinks, forward)).toEqual([]);
  });

  it("excludes CLAUDE.md at root and at any nested level", () => {
    const corpus = corpusOf([doc("CLAUDE.md"), doc("Spaces/Finances/CLAUDE.md")]);
    const { backlinks, forward } = indexesFrom([]);

    expect(orphans(corpus, backlinks, forward)).toEqual([]);
  });

  it("excludes anything under Scheduled/", () => {
    const corpus = corpusOf([doc("Scheduled/monday-pulse/standing-challenges.md")]);
    const { backlinks, forward } = indexesFrom([]);

    expect(orphans(corpus, backlinks, forward)).toEqual([]);
  });

  it("boundary: a document with exactly 2 outbound refs is still an orphan", () => {
    const corpus = corpusOf([
      doc("Spaces/Finances/hub-boundary-2.md"),
      doc("Spaces/Finances/t1.md"),
      doc("Spaces/Finances/t2.md"),
    ]);
    const { backlinks, forward } = indexesFrom([
      ["Spaces/Finances/hub-boundary-2.md", "Spaces/Finances/t1.md"],
      ["Spaces/Finances/hub-boundary-2.md", "Spaces/Finances/t2.md"],
    ]);

    const paths = orphans(corpus, backlinks, forward).map((o) => o.path);
    expect(paths).toContain("Spaces/Finances/hub-boundary-2.md");
  });

  it("boundary: a document with exactly 3 outbound refs is not an orphan (it's a hub)", () => {
    const corpus = corpusOf([
      doc("Spaces/Finances/hub-boundary-3.md"),
      doc("Spaces/Finances/t1.md"),
      doc("Spaces/Finances/t2.md"),
      doc("Spaces/Finances/t3.md"),
    ]);
    const { backlinks, forward } = indexesFrom([
      ["Spaces/Finances/hub-boundary-3.md", "Spaces/Finances/t1.md"],
      ["Spaces/Finances/hub-boundary-3.md", "Spaces/Finances/t2.md"],
      ["Spaces/Finances/hub-boundary-3.md", "Spaces/Finances/t3.md"],
    ]);

    const paths = orphans(corpus, backlinks, forward).map((o) => o.path);
    expect(paths).not.toContain("Spaces/Finances/hub-boundary-3.md");
  });

  it("excludes a document with an inbound reference", () => {
    const corpus = corpusOf([doc("Spaces/Finances/linked.md"), doc("Spaces/Finances/other.md")]);
    const { backlinks, forward } = indexesFrom([["Spaces/Finances/other.md", "Spaces/Finances/linked.md"]]);

    const paths = orphans(corpus, backlinks, forward).map((o) => o.path);
    expect(paths).not.toContain("Spaces/Finances/linked.md");
  });

  it("orders stalest (oldest modified) first", () => {
    const corpus = corpusOf([
      doc("Spaces/Finances/newest.md", "2024-06-01T00:00:00.000Z"),
      doc("Spaces/Finances/oldest.md", "2020-01-01T00:00:00.000Z"),
      doc("Spaces/Finances/middle.md", "2022-03-01T00:00:00.000Z"),
    ]);
    const { backlinks, forward } = indexesFrom([]);

    const paths = orphans(corpus, backlinks, forward).map((o) => o.path);

    expect(paths).toEqual([
      "Spaces/Finances/oldest.md",
      "Spaces/Finances/middle.md",
      "Spaces/Finances/newest.md",
    ]);
  });
});

describe("hubs", () => {
  it("boundary: a document with exactly 1 total link is excluded", () => {
    const corpus = corpusOf([doc("Spaces/Finances/one-link.md"), doc("Spaces/Finances/source.md")]);
    const { backlinks, forward } = indexesFrom([["Spaces/Finances/source.md", "Spaces/Finances/one-link.md"]]);

    const paths = hubs(corpus, backlinks, forward).map((h) => h.path);
    expect(paths).not.toContain("Spaces/Finances/one-link.md");
  });

  it("boundary: a document with exactly 2 total links is included", () => {
    const corpus = corpusOf([
      doc("Spaces/Finances/two-link.md"),
      doc("Spaces/Finances/source.md"),
      doc("Spaces/Finances/target.md"),
    ]);
    const { backlinks, forward } = indexesFrom([
      ["Spaces/Finances/source.md", "Spaces/Finances/two-link.md"], // inbound to two-link
      ["Spaces/Finances/two-link.md", "Spaces/Finances/target.md"], // outbound from two-link
    ]);

    const result = hubs(corpus, backlinks, forward);
    const entry = result.find((h) => h.path === "Spaces/Finances/two-link.md");
    expect(entry).toEqual({
      path: "Spaces/Finances/two-link.md",
      title: "two-link",
      space: "Finances",
      inbound: 1,
      outbound: 1,
    });
  });

  it("ranks by total links descending, ties broken by path (en-GB)", () => {
    const corpus = corpusOf([
      doc("Spaces/Finances/b.md"),
      doc("Spaces/Finances/a.md"),
      doc("Spaces/Finances/big.md"),
      doc("Spaces/Finances/s1.md"),
      doc("Spaces/Finances/s2.md"),
      doc("Spaces/Finances/s3.md"),
    ]);
    const { backlinks, forward } = indexesFrom([
      // a.md and b.md each have exactly 2 total links (tie)
      ["Spaces/Finances/s1.md", "Spaces/Finances/a.md"],
      ["Spaces/Finances/a.md", "Spaces/Finances/s2.md"],
      ["Spaces/Finances/s1.md", "Spaces/Finances/b.md"],
      ["Spaces/Finances/b.md", "Spaces/Finances/s2.md"],
      // big.md has 3 total links
      ["Spaces/Finances/s1.md", "Spaces/Finances/big.md"],
      ["Spaces/Finances/s2.md", "Spaces/Finances/big.md"],
      ["Spaces/Finances/big.md", "Spaces/Finances/s3.md"],
    ]);

    const paths = hubs(corpus, backlinks, forward)
      .map((h) => h.path)
      .filter((p) => ["Spaces/Finances/a.md", "Spaces/Finances/b.md", "Spaces/Finances/big.md"].includes(p));

    expect(paths).toEqual(["Spaces/Finances/big.md", "Spaces/Finances/a.md", "Spaces/Finances/b.md"]);
  });

  it("respects the limit parameter", () => {
    const docs = Array.from({ length: 5 }, (_, i) => doc(`Spaces/Finances/hub-${i}.md`));
    const corpus = corpusOf([...docs, doc("Spaces/Finances/source.md")]);
    const edges: Array<[string, string]> = docs.flatMap((d) => [
      ["Spaces/Finances/source.md", d.path],
      [d.path, "Spaces/Finances/source.md"],
    ]) as Array<[string, string]>;
    const { backlinks, forward } = indexesFrom(edges);

    expect(hubs(corpus, backlinks, forward, 2)).toHaveLength(2);
  });
});

describe("spaceConnections", () => {
  it("counts internal links, and inbound/outbound cross-links separately without double-counting", () => {
    const corpus = corpusOf([
      doc("Spaces/House-Move/a.md"),
      doc("Spaces/House-Move/b.md"),
      doc("Spaces/Finances/c.md"),
    ]);
    const { backlinks, forward } = indexesFrom([
      ["Spaces/House-Move/a.md", "Spaces/House-Move/b.md"], // internal to House-Move
      ["Spaces/House-Move/a.md", "Spaces/Finances/c.md"], // House-Move → Finances (cross)
    ]);

    const result = spaceConnections(corpus, backlinks, forward);

    const houseMove = result.find((s) => s.space === "House-Move")!;
    const finances = result.find((s) => s.space === "Finances")!;

    expect(houseMove.internalLinks).toBe(1);
    expect(houseMove.outboundCross).toBe(1);
    expect(houseMove.inboundCross).toBe(0);

    expect(finances.internalLinks).toBe(0);
    expect(finances.outboundCross).toBe(0);
    expect(finances.inboundCross).toBe(1);
  });

  it("counts docs and orphans per space, and sorts by space name (en-GB)", () => {
    const corpus = corpusOf([
      doc("Spaces/House-Move/a.md"),
      doc("Spaces/House-Move/b.md"),
      doc("Spaces/Finances/orphan.md"),
      doc("CLAUDE.md"), // outside Spaces/ — must not appear in any row
    ]);
    const { backlinks, forward } = indexesFrom([
      ["Spaces/House-Move/a.md", "Spaces/House-Move/b.md"],
    ]);

    const result = spaceConnections(corpus, backlinks, forward);

    expect(result.map((s) => s.space)).toEqual(["Finances", "House-Move"]);
    expect(result.find((s) => s.space === "House-Move")!.docs).toBe(2);
    expect(result.find((s) => s.space === "Finances")!.docs).toBe(1);
    expect(result.find((s) => s.space === "Finances")!.orphans).toBe(1);
    // a.md links out to b.md but has no inbound reference itself, so it is
    // an orphan too (only b.md, the link's target, is not).
    expect(result.find((s) => s.space === "House-Move")!.orphans).toBe(1);
  });
});
