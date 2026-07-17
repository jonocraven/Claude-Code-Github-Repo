import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";
import type { Corpus } from "./corpus.js";
import { looksPathLike, resolveRef } from "./resolver.js";

export interface Backlink {
  source: string;
  sourceTitle: string;
  snippet: string;
}

/** target path → documents that reference it (brief §6, "and vice versa"). */
export type BacklinkIndex = Map<string, Backlink[]>;

const parser = unified().use(remarkParse).use(remarkGfm);

function snippetAround(body: string, needle: string): string {
  const lines = body.split("\n");
  const line = lines.find((l) => l.includes(needle)) ?? "";
  const clean = line.replace(/^[\s>*-]+/, "").trim();
  return clean.length > 180 ? `${clean.slice(0, 177)}…` : clean;
}

export function buildBacklinks(corpus: Corpus): BacklinkIndex {
  const index: BacklinkIndex = new Map();

  for (const doc of corpus.docs.values()) {
    const tree = parser.parse(doc.body) as Root;
    const seen = new Set<string>();

    const record = (raw: string, resolved: string) => {
      if (resolved === doc.path || seen.has(resolved)) return;
      seen.add(resolved);
      const list = index.get(resolved) ?? [];
      list.push({
        source: doc.path,
        sourceTitle: doc.title,
        snippet: snippetAround(doc.body, raw),
      });
      index.set(resolved, list);
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
  }

  return index;
}
