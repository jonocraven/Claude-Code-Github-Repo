import { describe, expect, it } from "vitest";
import { parseMemory } from "./memory-structure.js";

/**
 * These lock the classification *rules*, which are the judgement of the
 * feature. Changing an expectation here should be a deliberate decision about
 * how memory is read, not a fix to make a test pass.
 */

const kinds = (src: string) => parseMemory(src).entries.map((e) => `${e.kind}:${e.text}`);

describe("parseMemory — the workspace convention", () => {
  it("reads the real shape: H2 sections with bulleted content", () => {
    const { entries, counts } = parseMemory(`# WFDinner MEMORY.md

## Key facts
- Stack: Antigravity IDE, Gemini Flash, Cloudflare Workers.
- Four features live.

## Decisions / notes
- Went with Workers over Pages for the API.
`);
    expect(entries).toHaveLength(3);
    expect(counts.fact).toBe(2);
    expect(counts.decision).toBe(1);
    expect(entries[0]!.section).toBe("Key facts");
  });

  it("treats the document's H1 as the title, not a section", () => {
    const { entries } = parseMemory("# Home MEMORY.md\n\n- A loose bullet.\n");
    expect(entries[0]!.section).toBeNull();
    expect(entries[0]!.kind).toBe("note");
  });

  it("records 1-based line numbers so the client can link to the source", () => {
    const { entries } = parseMemory("# T\n\n## Key facts\n- first\n- second\n");
    expect(entries.map((e) => e.line)).toEqual([4, 5]);
  });
});

describe("parseMemory — classification", () => {
  it("maps section headings to kinds by keyword", () => {
    expect(kinds("## Key facts\n- a\n")).toEqual(["fact:a"]);
    expect(kinds("## Decisions\n- b\n")).toEqual(["decision:b"]);
    expect(kinds("## Open questions\n- c\n")).toEqual(["open:c"]);
    expect(kinds("## Shopping\n- d\n")).toEqual(["note:d"]);
  });

  it("reads an ambiguous 'Open decisions' as open, not decided", () => {
    // An unresolved decision is a question, so `open` is matched first.
    // The entry deliberately carries no `?`, `[ ]` or TODO — otherwise the
    // inline marker would decide it and the section ordering this test
    // exists to pin would never be exercised.
    expect(kinds("## Open decisions\n- Pick a solicitor\n")).toEqual([
      "open:Pick a solicitor",
    ]);
    // And the reverse still holds: a settled section stays settled.
    expect(kinds("## Decisions\n- Picked the Gosforth solicitor\n")).toEqual([
      "decision:Picked the Gosforth solicitor",
    ]);
  });

  it("lets an inline TODO override its section", () => {
    // The real files carry `[TODO — …]` under otherwise settled headings.
    expect(kinds("## Key facts\n- [TODO — pick a stack]\n")).toEqual([
      "open:[TODO — pick a stack]",
    ]);
    expect(kinds("## Decisions\n- TBD which lender\n")).toEqual([
      "open:TBD which lender",
    ]);
  });

  it("treats a trailing question mark as open wherever it appears", () => {
    expect(kinds("## Key facts\n- Do we need a survey?\n")).toEqual([
      "open:Do we need a survey?",
    ]);
  });

  it("reads checkbox state: unticked is open, ticked is decided", () => {
    expect(kinds("## Notes\n- [ ] Book the survey\n")).toEqual(["open:Book the survey"]);
    expect(kinds("## Notes\n- [x] Booked the survey\n")).toEqual([
      "decision:Booked the survey",
    ]);
  });

  it("does not mistake a mid-sentence question mark for an open item", () => {
    expect(kinds("## Key facts\n- The 'what if?' scenario is covered.\n")).toEqual([
      "fact:The 'what if?' scenario is covered.",
    ]);
  });
});

describe("parseMemory — refusing to guess", () => {
  it("yields nothing for a file with no lists", () => {
    const { entries, counts } = parseMemory(
      "# MEMORY.md\n\nJust prose about the space, with no bullets at all.\n"
    );
    expect(entries).toEqual([]);
    expect(counts).toEqual({ fact: 0, decision: 0, open: 0, note: 0 });
  });

  it("ignores an empty file, and empty bullets", () => {
    expect(parseMemory("").entries).toEqual([]);
    expect(parseMemory("## Key facts\n-\n-   \n").entries).toEqual([]);
  });

  it("does not turn prose paragraphs under a heading into entries", () => {
    const { entries } = parseMemory("## Key facts\n\nThis is a paragraph, not a fact.\n");
    expect(entries).toEqual([]);
  });
});

describe("parseMemory — shape and presentation", () => {
  it("strips markdown so entries render in a compact list", () => {
    expect(kinds("## Key facts\n- Uses `Workers` and **Vite**, see [docs](x.md)\n")).toEqual([
      "fact:Uses Workers and Vite, see docs",
    ]);
  });

  it("records nesting depth for sub-bullets", () => {
    const { entries } = parseMemory("## Key facts\n- parent\n  - child\n    - grandchild\n");
    expect(entries.map((e) => e.depth)).toEqual([0, 1, 2]);
  });

  it("handles ordered lists as well as bullets", () => {
    expect(kinds("## Decisions\n1. First call\n2) Second call\n")).toEqual([
      "decision:First call",
      "decision:Second call",
    ]);
  });

  it("counts entries per section in document order, for the trim signal", () => {
    const { sections } = parseMemory(
      "## Key facts\n- a\n- b\n- c\n\n## Decisions\n- d\n\n## Open questions\n- e?\n"
    );
    expect(sections).toEqual([
      { name: "Key facts", count: 3 },
      { name: "Decisions", count: 1 },
      { name: "Open questions", count: 1 },
    ]);
  });
});
