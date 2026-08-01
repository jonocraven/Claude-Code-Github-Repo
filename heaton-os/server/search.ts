import MiniSearch from "minisearch";
import type { Corpus, CorpusDoc } from "./corpus.js";
import { spaceOf } from "./paths.js";

export interface KeywordHit {
  path: string;
  title: string;
  space: string | null;
  snippet: string;
  score: number;
  /** Carried so a result list can be re-sorted by recency without a second call. */
  modified: string;
}

/**
 * A filename match. Only markdown is full-text indexed, so without this a PDF
 * called `Mortgage-offer.pdf` is unfindable by search even though it is the
 * thing being looked for. Matching names over the whole file set closes that
 * hole without pretending to read binary content.
 */
export interface FileHit {
  path: string;
  name: string;
  space: string | null;
  ext: string;
}

export interface KeywordResult {
  hits: KeywordHit[];
  /** Matches before `limit` — so the UI can say "12 of 47" honestly. */
  total: number;
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

function toIndexedDoc(d: CorpusDoc): IndexedDoc {
  return {
    id: d.path,
    title: d.title,
    headings: d.headings,
    body: d.body,
    path: d.path,
    space: spaceOf(d.path),
  };
}

/**
 * Incremental counterpart to `buildSearchIndex` (brief 04): apply only the
 * changed paths to the existing index via MiniSearch's discard/replace/add,
 * rather than reconstructing it from the whole corpus.
 */
export function updateSearchIndex(
  index: MiniSearch<IndexedDoc>,
  corpus: Corpus,
  changedPaths: readonly string[]
): void {
  for (const p of changedPaths) {
    const doc = corpus.docs.get(p);
    const wasIndexed = index.has(p);
    if (doc) {
      if (wasIndexed) index.replace(toIndexedDoc(doc));
      else index.add(toIndexedDoc(doc));
    } else if (wasIndexed) {
      index.discard(p);
    }
  }
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
): KeywordResult {
  const terms = query.split(/\s+/).filter(Boolean);
  const matched = index.search(query).filter((r) => !space || r.space === space);
  return {
    total: matched.length,
    hits: matched.slice(0, limit).map((r) => ({
      path: r.path as string,
      title: r.title as string,
      space: r.space as string | null,
      snippet: makeSnippet(corpus.docs.get(r.id as string)?.body ?? "", terms),
      score: r.score,
      modified: corpus.docs.get(r.id as string)?.modified ?? "",
    })),
  };
}

/**
 * Filename matches across every file, markdown or not, excluding the ones the
 * full-text index already returned — a document that matched on content should
 * not also appear as a weaker name match.
 *
 * Every term must appear somewhere in the path, so "mortgage offer" finds
 * `House-Move/Mortgage/offer-2026.pdf`. Ranking is by how early the first term
 * lands in the basename: a name that *starts* with the term beats one that
 * merely contains it, and a hit in the filename beats one in a parent folder.
 */
export function searchFilenames(
  corpus: Corpus,
  query: string,
  space: string | null,
  exclude: ReadonlySet<string>,
  limit = 12
): FileHit[] {
  const terms = query.split(/\s+/).filter(Boolean).map((t) => t.toLowerCase());
  if (terms.length === 0) return [];

  const scored: { hit: FileHit; rank: number }[] = [];
  for (const p of corpus.files) {
    if (exclude.has(p)) continue;
    const hitSpace = spaceOf(p);
    if (space && hitSpace !== space) continue;

    // Plain substring containment, which already sees through this workspace's
    // hyphen and underscore naming — "mortgage offer" reaches
    // `Mortgage-offer.pdf` because both terms sit inside that string as-is.
    // Word-boundary matching would be stricter and worse here: filenames are
    // where partial words live (`week-29`, `q1-fcast`).
    const haystack = p.toLowerCase();
    if (!terms.every((t) => haystack.includes(t))) continue;

    const name = p.slice(p.lastIndexOf("/") + 1);
    const at = name.toLowerCase().indexOf(terms[0]!);
    scored.push({
      hit: {
        path: p,
        name,
        space: hitSpace,
        ext: name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "",
      },
      // Not in the basename at all — it matched a folder, so it ranks last.
      rank: at === -1 ? 1000 : at,
    });
  }

  return scored
    .sort((a, b) => a.rank - b.rank || a.hit.path.localeCompare(b.hit.path, "en-GB"))
    .slice(0, limit)
    .map((s) => s.hit);
}
