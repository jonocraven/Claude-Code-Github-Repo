import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown.js";

const NO_FILES = new Set<string>();

describe("renderMarkdown headings (brief 03 §1)", () => {
  it("slugs a plain heading: lowercase, punctuation stripped, spaces to hyphens", () => {
    const { headings } = renderMarkdown("# Title\n\n## Getting Started!\n", "doc.md", NO_FILES);
    expect(headings).toEqual([
      { id: "title", text: "Title", depth: 1 },
      { id: "getting-started", text: "Getting Started!", depth: 2 },
    ]);
  });

  it("numbers colliding slugs -2, -3, … in document order", () => {
    const { headings } = renderMarkdown(
      "## Notes\n\ntext\n\n## Notes\n\nmore\n\n## Notes\n",
      "doc.md",
      NO_FILES
    );
    expect(headings.map((h) => h.id)).toEqual(["notes", "notes-2", "notes-3"]);
  });

  it("gives an all-punctuation heading a usable fallback id", () => {
    const { headings } = renderMarkdown("## !!! ???\n", "doc.md", NO_FILES);
    expect(headings).toHaveLength(1);
    expect(headings[0]!.id).toBe("section");
    expect(headings[0]!.text).toBe("!!! ???");
  });

  it("numbers fallback ids on collision too", () => {
    const { headings } = renderMarkdown("## ***\n\n## @@@\n", "doc.md", NO_FILES);
    expect(headings.map((h) => h.id)).toEqual(["section", "section-2"]);
  });

  it("uses plain text for a heading containing an inline cross-reference, not the rendered HTML", () => {
    const { headings, html } = renderMarkdown(
      "## See `notes/plan.md` for detail\n",
      "doc.md",
      new Set(["notes/plan.md"])
    );
    expect(headings).toHaveLength(1);
    expect(headings[0]!.text).toBe("See notes/plan.md for detail");
    expect(headings[0]!.id).toBe("see-notesplanmd-for-detail");
    // The rendered HTML still carries the resolved reference link, unlike `text`.
    expect(html).toContain("data-ref=\"notes/plan.md\"");
  });

  it("the id rides through onto the rendered heading element", () => {
    const { html } = renderMarkdown("## Getting Started\n", "doc.md", NO_FILES);
    expect(html).toContain('<h2 id="getting-started">');
  });

  it("the slug is stable for the same content across separate calls", () => {
    const a = renderMarkdown("## Repeat Me\n", "doc.md", NO_FILES);
    const b = renderMarkdown("## Repeat Me\n", "doc.md", NO_FILES);
    expect(a.headings).toEqual(b.headings);
  });
});
