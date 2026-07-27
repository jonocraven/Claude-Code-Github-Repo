import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import type { Corpus, CorpusDoc } from "./corpus.js";
import { looksPathLike, resolveRef } from "./resolver.js";

export interface Backlink {
  source: string;
  sourceTitle: string;
  snippet: string;
}

/** target path → documents that reference it (brief §6, "and vice versa"). */
export type BacklinkIndex = Map<string, Backlink[]>;

/**
 * source doc path → (target path it references → the Backlink entry it
 * contributes). This is the forward complement of `BacklinkIndex`, kept
 * around only so the incremental updater (brief 04) can diff a single
 * document's outgoing references without reparsing the whole corpus.
 */
export type ForwardIndex = Map<string, Map<string, Backlink>>;

const parser = unified().use(remarkParse).use(remarkGfm);

function snippetAround(body: string, needle: string): string {
  const lines = body.split("\n");
  const line = lines.find((l) => l.includes(needle)) ?? "";
  const clean = line.replace(/^[\s>*-]+/, "").trim();
  return clean.length > 180 ? `${clean.slice(0, 177)}…` : clean;
}

/** One document's outgoing references: target path → Backlink it contributes. */
export function computeForwardRefs(doc: CorpusDoc, corpus: Corpus): Map<string, Backlink> {
  const tree = parser.parse(doc.body) as Root;
  const refs = new Map<string, Backlink>();

  const record = (raw: string, resolved: string) => {
    if (resolved === doc.path || refs.has(resolved)) return;
    refs.set(resolved, {
      source: doc.path,
      sourceTitle: doc.title,
      snippet: snippetAround(doc.body, raw),
    });
  };

  visit(tree, "inlineCode", (node) => {
    if (!looksPathLike(node.value)) return;
    const resolved = resolveRef(node.value, doc.path, corpus.files);
    if (resolved) record(node.value, resolved);
  });

  visit(tree, "link", (node) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(node.url) || node.url.startsWith("#")) return;
    const clean = decodeURIComponent(node.url.split("#")[0] ?? "");
    if (!clean) return;
    const resolved = resolveRef(clean, doc.path, corpus.files);
    if (resolved) record(node.url, resolved);
  });

  return refs;
}

export function buildBacklinks(corpus: Corpus): BacklinkIndex {
  const index: BacklinkIndex = new Map();

  for (const doc of corpus.docs.values()) {
    for (const [target, backlink] of computeForwardRefs(doc, corpus)) {
      const list = index.get(target) ?? [];
      list.push(backlink);
      index.set(target, list);
    }
  }

  return index;
}

/** Companion to `buildBacklinks`: the forward map for a freshly built corpus. */
export function buildForwardIndex(corpus: Corpus): ForwardIndex {
  const forward: ForwardIndex = new Map();
  for (const doc of corpus.docs.values()) {
    forward.set(doc.path, computeForwardRefs(doc, corpus));
  }
  return forward;
}

/**
 * Incremental backlink update (brief 04's trap): `index` is a GLOBAL INVERSE
 * graph, so editing document A can change the backlinks of documents B, C, D
 * that did not themselves change. Updating only the changed paths' own
 * inverse entries would leave those stale.
 *
 * Instead we maintain `forward` (this doc → refs it makes) alongside the
 * inverse, and for each changed document diff its new forward refs against
 * its previous ones, applying only the resulting add/remove operations to the
 * inverse map — O(refs in the changed doc), and correct regardless of which
 * *other* documents' backlink lists those refs happen to land in.
 *
 * A deleted document is purged both as a source (its old outgoing refs are
 * removed from whichever targets they landed in) and as a target (nothing can
 * validly resolve to a path no longer in `corpus.files`, so a full rebuild
 * would never produce that key either).
 */
export function updateBacklinks(
  index: BacklinkIndex,
  forward: ForwardIndex,
  corpus: Corpus,
  changedPaths: readonly string[]
): void {
  const removeFrom = (target: string, source: string) => {
    const list = index.get(target);
    if (!list) return;
    const next = list.filter((b) => b.source !== source);
    if (next.length) index.set(target, next);
    else index.delete(target);
  };

  for (const p of changedPaths) {
    const doc = corpus.docs.get(p);
    const oldRefs = forward.get(p) ?? new Map<string, Backlink>();

    if (!doc) {
      for (const target of oldRefs.keys()) removeFrom(target, p);
      forward.delete(p);
      index.delete(p); // p can no longer be a valid target either
      continue;
    }

    const newRefs = computeForwardRefs(doc, corpus);

    for (const target of oldRefs.keys()) {
      if (!newRefs.has(target)) removeFrom(target, p);
    }
    for (const [target, backlink] of newRefs) {
      const list = index.get(target);
      if (!list) {
        index.set(target, [backlink]);
      } else {
        const i = list.findIndex((b) => b.source === p);
        if (i === -1) list.push(backlink);
        else list[i] = backlink; // refresh title/snippet even if unchanged target
      }
    }

    forward.set(p, newRefs);
  }
}
