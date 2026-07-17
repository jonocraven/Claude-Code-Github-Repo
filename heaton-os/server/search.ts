import MiniSearch from "minisearch";
import type { Corpus } from "./corpus.js";
import { spaceOf } from "./paths.js";

export interface KeywordHit {
  path: string;
  title: string;
  space: string | null;
  snippet: string;
  score: number;
}

interface IndexedDoc {
  id: string;
  title: string;
  headings: string;
  body: string;
  path: string;
  space: string | null;
}

export function buildSearchIndex(corpus: Corpus): MiniSearch<IndexedDoc> {
  const index = new MiniSearch<IndexedDoc>({
    fields: ["title", "headings", "body", "path"],
    storeFields: ["title", "path", "space"],
    searchOptions: {
      boost: { title: 3, headings: 2, path: 2 },
      prefix: true,
      fuzzy: 0.15,
      combineWith: "AND",
    },
  });
  index.addAll(
    [...corpus.docs.values()].map((d) => ({
      id: d.path,
      title: d.title,
      headings: d.headings,
      body: d.body,
      path: d.path,
      space: spaceOf(d.path),
    }))
  );
  return index;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Plain-text snippet around the first query-term hit, terms wrapped in <mark>. */
function makeSnippet(body: string, terms: string[]): string {
  const text = body
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>|]/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  const lower = text.toLowerCase();
  let at = -1;
  for (const term of terms) {
    at = lower.indexOf(term.toLowerCase());
    if (at !== -1) break;
  }
  const start = at === -1 ? 0 : Math.max(0, at - 60);
  let slice = text.slice(start, start + 180);
  if (start > 0) slice = `…${slice}`;
  if (start + 180 < text.length) slice = `${slice}…`;

  let safe = escapeHtml(slice);
  for (const term of terms) {
    if (term.length < 2) continue;
    safe = safe.replace(
      new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"),
      "<mark>$1</mark>"
    );
  }
  return safe;
}

export function searchKeyword(
  index: MiniSearch<IndexedDoc>,
  corpus: Corpus,
  query: string,
  space: string | null,
  limit = 12
): KeywordHit[] {
  const terms = query.split(/\s+/).filter(Boolean);
  return index
    .search(query)
    .filter((r) => !space || r.space === space)
    .slice(0, limit)
    .map((r) => ({
      path: r.path as string,
      title: r.title as string,
      space: r.space as string | null,
      snippet: makeSnippet(corpus.docs.get(r.id as string)?.body ?? "", terms),
      score: r.score,
    }));
}
