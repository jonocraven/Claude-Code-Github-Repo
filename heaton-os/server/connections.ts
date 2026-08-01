import type { Corpus } from "./corpus.js";
import type { BacklinkIndex, ForwardIndex } from "./backlinks.js";
import { spaceOf } from "./paths.js";

/**
 * The connection graph — orphans, hubs, and the seams between spaces (brief
 * 08). Everything here reads the indexes `server/state.ts` already maintains;
 * nothing here builds or mutates a graph of its own. Pure functions taking
 * their data as arguments, so they can be tested against a hand-built corpus
 * with no filesystem and no `WORKSPACE_ROOT` (house rule 11).
 */

/** A document is a hub, not an orphan, once it links out this many times. */
const HUB_OUTBOUND_THRESHOLD = 3;
/** A document needs at least this many total links (in + out) to count as a hub. */
const HUB_TOTAL_THRESHOLD = 2;
/** How many hubs to return by default. */
const DEFAULT_HUB_LIMIT = 10;

export interface CrossLink {
  source: string; // workspace-relative path
  sourceTitle: string;
  sourceSpace: string; // never null — root docs are excluded, see below
  target: string;
  targetTitle: string;
  targetSpace: string;
  snippet: string; // reuse the Backlink snippet, do not invent another
}

export interface Orphan {
  path: string;
  title: string;
  space: string | null;
  modified: string;
}

export interface Hub {
  path: string;
  title: string;
  space: string | null;
  inbound: number;
  outbound: number;
}

export interface SpaceConnections {
  space: string;
  docs: number;
  internalLinks: number; // both ends inside this space
  outboundCross: number; // this space → another
  inboundCross: number; // another → this space
  orphans: number;
}

/** Title for a link target: its own doc title if it's markdown, else its filename. */
function titleOf(corpus: Corpus, target: string): string {
  const doc = corpus.docs.get(target);
  if (doc) return doc.title;
  return target.split("/").pop() ?? target;
}

/**
 * Every reference whose source and target sit in different spaces — the
 * seams between otherwise-siloed spaces. A document outside `Spaces/` is
 * excluded on both ends: root docs like `CLAUDE.md` link everywhere by
 * nature and would swamp the result with noise, the opposite of the point.
 */
export function crossSpaceLinks(corpus: Corpus, forward: ForwardIndex): CrossLink[] {
  const links: CrossLink[] = [];

  for (const [source, refs] of forward) {
    const sourceSpace = spaceOf(source);
    if (!sourceSpace) continue;

    for (const [target, backlink] of refs) {
      const targetSpace = spaceOf(target);
      if (!targetSpace || targetSpace === sourceSpace) continue;

      links.push({
        source,
        sourceTitle: backlink.sourceTitle,
        sourceSpace,
        target,
        targetTitle: titleOf(corpus, target),
        targetSpace,
        snippet: backlink.snippet,
      });
    }
  }

  return links.sort(
    (a, b) =>
      a.sourceSpace.localeCompare(b.sourceSpace, "en-GB") ||
      a.source.localeCompare(b.source, "en-GB") ||
      a.target.localeCompare(b.target, "en-GB")
  );
}

/** `path`'s filename, ignoring any directory it lives in — for MEMORY.md/CLAUDE.md "at any level". */
function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

/**
 * Markdown documents with zero inbound references, oldest first — age is
 * what makes an orphan worth looking at. Excludes entry points by design
 * (`MEMORY.md`, `CLAUDE.md`), run definitions (`Scheduled/`), and anything
 * that is itself an index: a document with three or more outbound refs is a
 * hub, not an orphan, even if nothing points back at it.
 */
export function orphans(corpus: Corpus, backlinks: BacklinkIndex, forward: ForwardIndex): Orphan[] {
  const result: Orphan[] = [];

  for (const doc of corpus.docs.values()) {
    if (basename(doc.path) === "MEMORY.md" || basename(doc.path) === "CLAUDE.md") continue;
    if (doc.path === "Scheduled/" || doc.path.startsWith("Scheduled/")) continue;

    const inbound = backlinks.get(doc.path) ?? [];
    if (inbound.length > 0) continue;

    const outboundCount = forward.get(doc.path)?.size ?? 0;
    if (outboundCount >= HUB_OUTBOUND_THRESHOLD) continue;

    result.push({ path: doc.path, title: doc.title, space: spaceOf(doc.path), modified: doc.modified });
  }

  return result.sort((a, b) => a.modified.localeCompare(b.modified));
}

/**
 * Documents ranked by total links (inbound + outbound), descending, ties
 * broken by path. A single link is not a hub, so anything under the
 * threshold is excluded rather than padding the list to reach `limit`.
 */
export function hubs(
  corpus: Corpus,
  backlinks: BacklinkIndex,
  forward: ForwardIndex,
  limit = DEFAULT_HUB_LIMIT
): Hub[] {
  const candidates: Hub[] = [];

  for (const doc of corpus.docs.values()) {
    const inbound = backlinks.get(doc.path)?.length ?? 0;
    const outbound = forward.get(doc.path)?.size ?? 0;
    if (inbound + outbound < HUB_TOTAL_THRESHOLD) continue;

    candidates.push({ path: doc.path, title: doc.title, space: spaceOf(doc.path), inbound, outbound });
  }

  return candidates
    .sort((a, b) => {
      const total = b.inbound + b.outbound - (a.inbound + a.outbound);
      return total !== 0 ? total : a.path.localeCompare(b.path, "en-GB");
    })
    .slice(0, limit);
}

/**
 * One row per space with at least one document: how much of its linking is
 * internal versus a seam to another space, and how many of its own documents
 * are orphaned.
 */
export function spaceConnections(
  corpus: Corpus,
  backlinks: BacklinkIndex,
  forward: ForwardIndex
): SpaceConnections[] {
  const rows = new Map<string, SpaceConnections>();

  const rowFor = (space: string): SpaceConnections => {
    let row = rows.get(space);
    if (!row) {
      row = { space, docs: 0, internalLinks: 0, outboundCross: 0, inboundCross: 0, orphans: 0 };
      rows.set(space, row);
    }
    return row;
  };

  for (const doc of corpus.docs.values()) {
    const space = spaceOf(doc.path);
    if (!space) continue;
    rowFor(space).docs += 1;
  }

  for (const [source, refs] of forward) {
    const sourceSpace = spaceOf(source);
    if (!sourceSpace) continue;

    for (const target of refs.keys()) {
      const targetSpace = spaceOf(target);
      if (!targetSpace) continue;

      if (targetSpace === sourceSpace) {
        rowFor(sourceSpace).internalLinks += 1;
      } else {
        rowFor(sourceSpace).outboundCross += 1;
        rowFor(targetSpace).inboundCross += 1;
      }
    }
  }

  for (const orphan of orphans(corpus, backlinks, forward)) {
    if (orphan.space) rowFor(orphan.space).orphans += 1;
  }

  return [...rows.values()].sort((a, b) => a.space.localeCompare(b.space, "en-GB"));
}
