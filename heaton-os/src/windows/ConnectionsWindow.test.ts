import { describe, expect, it } from "vitest";
import { ageInDays, groupSeams } from "./ConnectionsWindow";
import type { CrossLink } from "../api";

/**
 * The server returns cross-links as a flat directed list. The judgement this
 * window adds is that a *seam* is undirected — "do House Move and Finances
 * touch" does not depend on which way the link points — and that seams rank by
 * weight, because a pair connected once is a coincidence and a pair connected
 * six times is a subject.
 */

const link = (sourceSpace: string, targetSpace: string, n = 1): CrossLink => ({
  source: `Spaces/${sourceSpace}/doc-${n}.md`,
  sourceTitle: `${sourceSpace} doc ${n}`,
  sourceSpace,
  target: `Spaces/${targetSpace}/doc-${n}.md`,
  targetTitle: `${targetSpace} doc ${n}`,
  targetSpace,
  snippet: "…",
});

describe("groupSeams", () => {
  it("groups a pair regardless of link direction", () => {
    const seams = groupSeams([
      link("House-Move", "Finances", 1),
      link("Finances", "House-Move", 2),
    ]);
    expect(seams).toHaveLength(1);
    expect(seams[0]!.links).toHaveLength(2);
  });

  it("names the pair in a stable order, whichever direction arrived first", () => {
    const forward = groupSeams([link("House-Move", "Finances")]);
    const backward = groupSeams([link("Finances", "House-Move")]);
    expect([forward[0]!.a, forward[0]!.b]).toEqual(["Finances", "House-Move"]);
    expect([backward[0]!.a, backward[0]!.b]).toEqual([forward[0]!.a, forward[0]!.b]);
  });

  it("keeps distinct pairs apart", () => {
    const seams = groupSeams([
      link("House-Move", "Finances"),
      link("House-Move", "Home"),
    ]);
    expect(seams).toHaveLength(2);
  });

  it("ranks the heaviest seam first", () => {
    // One link is a coincidence; three is a subject. Ordering is the whole
    // point of grouping, so a flat list would bury the finding.
    //
    // The heavy pair here deliberately sorts *later* alphabetically than the
    // light one — otherwise dropping the weight ranking entirely would still
    // produce this order, and the test would pass without testing anything.
    const seams = groupSeams([
      link("Cookery-Books", "Finances", 1),
      link("Home", "WFDinner", 1),
      link("Home", "WFDinner", 2),
      link("WFDinner", "Home", 3),
    ]);
    expect(seams.map((s) => s.links.length)).toEqual([3, 1]);
    expect(seams[0]!.key).toBe("Home::WFDinner");
    expect(seams[1]!.key).toBe("Cookery-Books::Finances");
  });

  it("breaks a tie by pair name so the order never wobbles between loads", () => {
    const seams = groupSeams([
      link("Home", "WFDinner"),
      link("Cookery-Books", "Finances"),
    ]);
    expect(seams.map((s) => s.key)).toEqual(["Cookery-Books::Finances", "Home::WFDinner"]);
  });

  it("returns nothing for no links", () => {
    expect(groupSeams([])).toEqual([]);
  });
});

describe("ageInDays", () => {
  const now = Date.parse("2026-08-01T12:00:00.000Z");

  it("counts whole days since a document was last touched", () => {
    expect(ageInDays("2026-07-25T12:00:00.000Z", now)).toBe(7);
  });

  it("is zero for something touched today", () => {
    expect(ageInDays("2026-08-01T09:00:00.000Z", now)).toBe(0);
  });

  it("rounds down rather than up, so '1d' never means 'a few hours'", () => {
    expect(ageInDays("2026-07-31T13:00:00.000Z", now)).toBe(0);
  });
});
