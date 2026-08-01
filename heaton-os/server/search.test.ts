import { describe, expect, it } from "vitest";
import type { Corpus } from "./corpus.js";
import { searchFilenames } from "./search.js";

/**
 * Filename search is the half of "finding things" the full-text index cannot
 * do: only markdown is indexed, so without this every PDF, image and
 * spreadsheet in the workspace is invisible to search. These lock the
 * behaviour that makes it useful rather than merely present — separator
 * handling and the ranking that puts a filename hit above a folder hit.
 */

const corpus = (paths: string[]): Corpus => ({
  files: new Set(paths),
  docs: new Map(),
});

const FIXTURE = corpus([
  "Spaces/House-Move/Mortgage/Mortgage-offer-2026.pdf",
  "Spaces/House-Move/Mortgage/notes.md",
  "Spaces/House-Move/survey.pdf",
  "Spaces/Finances/mortgage_calculator.csv",
  // Deliberately sorts alphabetically *before* the two files that should
  // outrank it, so the ranking assertions below cannot pass by coincidence.
  "Spaces/Finances/archive-mortgage.pdf",
  "Spaces/Cookery-Books/Photos/pasta.jpg",
  "README.md",
]);

const paths = (q: string, space: string | null = null, exclude = new Set<string>()) =>
  searchFilenames(FIXTURE, q, space, exclude).map((h) => h.path);

describe("searchFilenames", () => {
  it("finds a non-markdown file the full-text index cannot see", () => {
    expect(paths("survey")).toEqual(["Spaces/House-Move/survey.pdf"]);
  });

  it("matches straight through hyphens and underscores in a name", () => {
    // Filenames here are separator-joined, so a two-word query has to reach
    // both `Mortgage-offer-2026.pdf` and `mortgage_calculator.csv`.
    expect(paths("mortgage offer")).toEqual([
      "Spaces/House-Move/Mortgage/Mortgage-offer-2026.pdf",
    ]);
    expect(paths("mortgage calculator")).toEqual([
      "Spaces/Finances/mortgage_calculator.csv",
    ]);
  });

  it("requires every term to appear, not just one", () => {
    expect(paths("mortgage pasta")).toEqual([]);
  });

  it("ranks by where the term lands: name start, then later, then folder-only", () => {
    // `archive-mortgage.pdf` sorts alphabetically first of the four, so if
    // ranking were dropped it would lead — which is the mutation this pins.
    // `notes.md` matched purely on its parent folder, so it must come last.
    expect(paths("mortgage")).toEqual([
      "Spaces/Finances/mortgage_calculator.csv", // at 0
      "Spaces/House-Move/Mortgage/Mortgage-offer-2026.pdf", // at 0
      "Spaces/Finances/archive-mortgage.pdf", // at 8
      "Spaces/House-Move/Mortgage/notes.md", // folder only
    ]);
  });

  it("filters to a space when one is given", () => {
    expect(paths("mortgage", "Finances")).toEqual([
      "Spaces/Finances/mortgage_calculator.csv",
      "Spaces/Finances/archive-mortgage.pdf",
    ]);
  });

  it("omits paths the full-text search already returned", () => {
    const already = new Set([
      "Spaces/House-Move/Mortgage/notes.md",
      "Spaces/Finances/archive-mortgage.pdf",
    ]);
    expect(paths("mortgage", null, already)).toEqual([
      "Spaces/Finances/mortgage_calculator.csv",
      "Spaces/House-Move/Mortgage/Mortgage-offer-2026.pdf",
    ]);
  });

  it("returns nothing for an empty or whitespace query", () => {
    expect(paths("")).toEqual([]);
    expect(paths("   ")).toEqual([]);
  });

  it("reports the extension and space alongside the name", () => {
    const [hit] = searchFilenames(FIXTURE, "pasta", null, new Set());
    expect(hit).toMatchObject({
      name: "pasta.jpg",
      ext: "jpg",
      space: "Cookery-Books",
    });
  });

  it("handles a file outside any space", () => {
    const [hit] = searchFilenames(FIXTURE, "readme", null, new Set());
    expect(hit).toMatchObject({ name: "README.md", space: null });
  });

  it("honours the limit", () => {
    expect(searchFilenames(FIXTURE, "mortgage", null, new Set(), 2)).toHaveLength(2);
  });
});
