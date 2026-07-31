/**
 * Structured memory — reading MEMORY.md as knowledge rather than prose.
 *
 * The workspace already has a convention, visible across the real memory
 * files: an H2 section per kind ("Key facts", "Decisions / notes") with the
 * content as bullets, and `[TODO — …]` marking something still open. This
 * parser reads that convention. It deliberately invents no new syntax —
 * anything requiring Jono or Claude to remember a new markup would rot on
 * first contact, and these files are written by hand in both directions.
 *
 * Two rules carry most of the design:
 *
 *  1. Only list items become entries. A prose paragraph is context, not an
 *     enumerable claim, and treating it as one produces confident nonsense.
 *  2. Never guess. A file with no lists yields no entries rather than a
 *     best-effort reading — the same refusal the cross-reference resolver
 *     makes when a path doesn't resolve.
 */

export type EntryKind = "fact" | "decision" | "open" | "note";

export interface MemoryEntry {
  kind: EntryKind;
  /** The bullet's text, markdown stripped to something displayable. */
  text: string;
  /** The H2/H3 it sits under, or null when it precedes any heading. */
  section: string | null;
  /** 1-based line in the source file, so the client can link to it. */
  line: number;
  /** Nesting depth of the list item; 0 is top level. */
  depth: number;
}

export interface MemoryStructure {
  entries: MemoryEntry[];
  counts: Record<EntryKind, number>;
  /** Section name → entry count, in document order. Drives "what to trim". */
  sections: { name: string; count: number }[];
}

/**
 * Section-heading keywords → kind. Ordered: the first match wins, so
 * "Open decisions" reads as open rather than decided, which is the useful
 * way round — an unresolved decision is a question, not a settled one.
 */
const SECTION_KINDS: [RegExp, EntryKind][] = [
  // Plurals are the common form in real headings ("Open questions",
  // "Decisions / notes", "Key facts"), so every noun here allows one.
  [/\b(open|questions?|unknowns?|unresolved|todos?|next|blockers?|risks?)\b/i, "open"],
  [/\b(decisions?|decided|choices?|chose|agreed|calls?)\b/i, "decision"],
  [/\b(facts?|context|background|stack|state|key|details?|setup)\b/i, "fact"],
];

/** Inline markers that override the section — a TODO under "Key facts" is open. */
const OPEN_MARKERS = /(\[\s*\]|\[TODO\b|\bTODO:|\bTBD\b|\?\s*$)/i;
const DONE_MARKER = /^\[x\]\s*/i;

function sectionKind(heading: string | null): EntryKind {
  if (!heading) return "note";
  for (const [re, kind] of SECTION_KINDS) if (re.test(heading)) return kind;
  return "note";
}

/** Strip the markdown that would otherwise show up raw in a compact list. */
function cleanText(raw: string): string {
  return raw
    .replace(/^\[[ xX]\]\s*/, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED = /^(\s*)\d+[.)]\s+(.*)$/;

export function parseMemory(source: string): MemoryStructure {
  const entries: MemoryEntry[] = [];
  const sectionOrder: string[] = [];
  const sectionCounts = new Map<string, number>();
  let heading: string | null = null;

  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    const h = HEADING.exec(line);
    if (h) {
      // The document title (a lone H1) names the file, not a section.
      heading = h[1]!.length === 1 ? null : h[2]!.trim();
      continue;
    }

    const m = BULLET.exec(line) ?? ORDERED.exec(line);
    if (!m) continue;

    const raw = m[2]!.trim();
    if (!raw) continue;

    const text = cleanText(raw);
    if (!text) continue;

    let kind: EntryKind;
    if (DONE_MARKER.test(raw)) kind = "decision";
    else if (OPEN_MARKERS.test(raw)) kind = "open";
    else kind = sectionKind(heading);

    entries.push({
      kind,
      text,
      section: heading,
      line: i + 1,
      // Two spaces per level is the common markdown convention; tabs count as one.
      depth: Math.floor(m[1]!.replace(/\t/g, "  ").length / 2),
    });

    const key = heading ?? "—";
    if (!sectionCounts.has(key)) sectionOrder.push(key);
    sectionCounts.set(key, (sectionCounts.get(key) ?? 0) + 1);
  }

  const counts: Record<EntryKind, number> = { fact: 0, decision: 0, open: 0, note: 0 };
  for (const e of entries) counts[e.kind] += 1;

  return {
    entries,
    counts,
    sections: sectionOrder.map((name) => ({ name, count: sectionCounts.get(name)! })),
  };
}
