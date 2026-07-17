import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBacklinks } from "./backlinks.js";
import { scanCorpus } from "./corpus.js";
import { renderMarkdown } from "./markdown.js";
import { looksPathLike, resolveRef } from "./resolver.js";

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "sample-workspace"
);

const DOC = "Spaces/House-Move/Resources/area-research-jesmond.md";

describe("looksPathLike", () => {
  it("accepts paths and known extensions", () => {
    expect(looksPathLike("References/todoist-conventions.md")).toBe(true);
    expect(looksPathLike("MEMORY.md")).toBe(true);
    expect(looksPathLike("script.sh")).toBe(true);
    expect(looksPathLike("Design System/The Family Table Co — Design System/notes.md")).toBe(true);
  });
  it("rejects commands, URLs and prose", () => {
    expect(looksPathLike("npm run os")).toBe(false);
    expect(looksPathLike("https://example.com/x.md")).toBe(false);
    expect(looksPathLike("PORT=4400")).toBe(false);
    expect(looksPathLike("#anchor")).toBe(false);
  });
});

describe("resolveRef order: doc dir → space root → workspace root (§6c)", async () => {
  const corpus = await scanCorpus(FIXTURE);

  it("bare filename hits the space MEMORY.md before the root one", () => {
    expect(resolveRef("MEMORY.md", DOC, corpus.files)).toBe(
      "Spaces/House-Move/MEMORY.md"
    );
  });

  it("root-relative paths fall through to the workspace root", () => {
    expect(resolveRef("References/todoist-conventions.md", DOC, corpus.files)).toBe(
      "References/todoist-conventions.md"
    );
  });

  it("space-relative paths resolve from the space root", () => {
    expect(
      resolveRef(
        "Resources/cv/cv-pmm.md",
        "Spaces/Job-Search/Resources/digests/digest-14-07.md",
        corpus.files
      )
    ).toBe("Spaces/Job-Search/Resources/cv/cv-pmm.md");
  });

  it("em-dash and space-laden paths resolve", () => {
    expect(
      resolveRef(
        "Design System/The Family Table Co — Design System/notes.md",
        DOC,
        corpus.files
      )
    ).toBe("Design System/The Family Table Co — Design System/notes.md");
  });

  it("never guesses: missing targets return null (§6d)", () => {
    expect(resolveRef("Resources/does-not-exist.md", DOC, corpus.files)).toBeNull();
    expect(resolveRef("../../../etc/passwd", DOC, corpus.files)).toBeNull();
  });
});

describe("renderMarkdown", async () => {
  const corpus = await scanCorpus(FIXTURE);
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(path.join(FIXTURE, DOC), "utf8");
  const out = renderMarkdown(source, DOC, corpus.files);

  it("extracts the front-matter box as fields", () => {
    const labels = out.frontmatter.map((f) => f.label);
    expect(labels).toEqual(["What", "Why", "Feeds", "Status"]);
    expect(out.html).not.toContain("<blockquote>");
  });

  it("linkifies resolvable backticked refs with data-ref", () => {
    expect(out.html).toContain('data-ref="References/todoist-conventions.md"');
    expect(out.html).toContain('data-ref="Spaces/House-Move/MEMORY.md"');
  });

  it("resolves relative markdown links", () => {
    expect(out.html).toContain(
      'data-ref="Spaces/Cookery-Books/Plans/week-29-plan.md"'
    );
  });

  it("marks unresolvable refs instead of guessing", () => {
    expect(out.html).toContain("ref-unresolved");
    expect(out.html).not.toContain('data-ref="Resources/does-not-exist.md"');
  });

  it("keeps the title from the first heading", () => {
    expect(out.title).toBe("Area research: Jesmond — fixture");
  });
});

describe("buildBacklinks", async () => {
  const corpus = await scanCorpus(FIXTURE);
  const index = buildBacklinks(corpus);

  it("records who references a target, with a snippet", () => {
    const refs = index.get("References/todoist-conventions.md") ?? [];
    const sources = refs.map((r) => r.source);
    expect(sources).toContain(DOC);
    expect(sources).toContain("MEMORY.md");
    const fromDoc = refs.find((r) => r.source === DOC)!;
    expect(fromDoc.snippet).toContain("todoist-conventions.md");
  });

  it("space-relative CV reference lands on the CV file", () => {
    const refs = index.get("Spaces/Job-Search/Resources/cv/cv-pmm.md") ?? [];
    expect(refs.map((r) => r.source)).toContain(
      "Spaces/Job-Search/Resources/digests/digest-14-07.md"
    );
  });
});
