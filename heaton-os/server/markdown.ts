import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeStringify from "rehype-stringify";
import { visit } from "unist-util-visit";
import { toString as mdToString } from "mdast-util-to-string";
import type { Root, RootContent, PhrasingContent, Blockquote } from "mdast";
import type { Element } from "hast";
import type { Properties } from "hast";
import { looksPathLike, resolveRef } from "./resolver.js";

export interface FrontMatterField {
  label: string;
  html: string;
}

export interface Heading {
  id: string;
  text: string;
  depth: number;
}

export interface RenderedMarkdown {
  title: string;
  frontmatter: FrontMatterField[];
  headings: Heading[];
  html: string;
}

const FRONT_LABELS = /^(What|Why|Headline|Feeds|Status)\s*:?\s*$/i;

function isExternal(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//");
}

/**
 * Turn cross-references into links (brief §6, hard requirement):
 * backticked path-like strings and relative markdown links that resolve to a
 * real file get data-ref attributes; unresolvable ones a dotted marker.
 */
function refPlugin(docPath: string, files: ReadonlySet<string>) {
  return (tree: Root) => {
    visit(tree, "inlineCode", (node) => {
      if (!looksPathLike(node.value)) return;
      const resolved = resolveRef(node.value, docPath, files);
      const code: Element = {
        type: "element",
        tagName: "code",
        properties: {},
        children: [{ type: "text", value: node.value }],
      };
      node.data = resolved
        ? {
            hName: "a",
            hProperties: { className: ["ref"], href: "#", "data-ref": resolved },
            hChildren: [code],
          }
        : {
            hName: "span",
            hProperties: {
              className: ["ref-unresolved"],
              title: "Reference not found in the workspace",
            },
            hChildren: [code],
          };
    });

    visit(tree, "link", (node) => {
      node.data ??= {};
      const props: Properties = {};
      if (isExternal(node.url)) {
        props.target = "_blank";
        props.rel = ["noreferrer"];
      } else {
        const clean = decodeURIComponent(node.url.split("#")[0] ?? "");
        const resolved = clean ? resolveRef(clean, docPath, files) : null;
        if (resolved) {
          props["data-ref"] = resolved;
          props.href = "#";
          props.className = ["ref"];
        } else {
          props.className = ["ref-unresolved"];
          props.title = "Reference not found in the workspace";
        }
      }
      node.data.hProperties = { ...(node.data.hProperties ?? {}), ...props };
    });
  };
}

/**
 * Jono's document standard opens with a blockquote of
 * `**What:** … / **Why:** … / **Status:** …` lines — detect it, pull it out
 * of the flow, and return the fields so the client renders a summary card.
 */
function extractFrontmatter(tree: Root): {
  fields: { label: string; nodes: PhrasingContent[] }[];
  node: Blockquote | null;
} {
  const idx = tree.children.findIndex((n, i) => i < 3 && n.type === "blockquote");
  if (idx === -1) return { fields: [], node: null };
  const quote = tree.children[idx] as Blockquote;

  const fields: { label: string; nodes: PhrasingContent[] }[] = [];
  let current: { label: string; nodes: PhrasingContent[] } | null = null;

  for (const para of quote.children) {
    if (para.type !== "paragraph") return { fields: [], node: null };
    for (const child of para.children) {
      if (child.type === "strong" && FRONT_LABELS.test(mdToString(child))) {
        current = {
          label: mdToString(child).replace(/:\s*$/, ""),
          nodes: [],
        };
        fields.push(current);
      } else if (child.type === "break") {
        current = null;
      } else if (current) {
        current.nodes.push(child);
      }
    }
    current = null;
  }

  if (fields.length < 2) return { fields: [], node: null };
  return { fields, node: quote };
}

/**
 * Slug rule (brief §1): lowercase, strip anything not a-z0-9/space/hyphen,
 * collapse whitespace to a single hyphen. An all-punctuation heading strips
 * to nothing, so it falls back to a generic base that collision-handling
 * still numbers sensibly.
 */
function slugify(text: string): string {
  const stripped = text.toLowerCase().replace(/[^a-z0-9\s-]/g, "");
  return stripped.trim().replace(/\s+/g, "-") || "section";
}

/**
 * Give every heading a stable, collision-free id and hand back the plain-text
 * outline for the client's contents rail. Runs on the mdast tree (not the
 * rendered HTML) so cross-references inside a heading contribute their plain
 * text, not markup — and mutates each heading's `data.hProperties.id` so the
 * id rides through remark-rehype onto the resulting h1-h6 element.
 */
function extractHeadings(tree: Root): Heading[] {
  const headings: Heading[] = [];
  const seen = new Map<string, number>();
  visit(tree, "heading", (node) => {
    const text = mdToString(node).trim();
    const base = slugify(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const id = count === 0 ? base : `${base}-${count + 1}`;
    node.data ??= {};
    node.data.hProperties = { ...(node.data.hProperties ?? {}), id };
    headings.push({ id, text, depth: node.depth });
  });
  return headings;
}

const toHtml = unified()
  .use(remarkRehype, { allowDangerousHtml: false })
  .use(rehypeStringify);

function renderNodes(children: RootContent[]): string {
  const root: Root = { type: "root", children };
  return toHtml.stringify(toHtml.runSync(root)).trim();
}

export function renderMarkdown(
  source: string,
  docPath: string,
  files: ReadonlySet<string>
): RenderedMarkdown {
  const parser = unified().use(remarkParse).use(remarkGfm);
  const tree = parser.parse(source) as Root;
  refPlugin(docPath, files)(tree);

  const { fields, node } = extractFrontmatter(tree);
  if (node) {
    tree.children = tree.children.filter((n) => n !== node);
  }

  // Headings are extracted from the stripped tree so ids line up with what's
  // actually rendered, and before renderNodes() so the ids ride along.
  const headings = extractHeadings(tree);

  const frontmatter: FrontMatterField[] = fields.map((f) => ({
    label: f.label,
    html: renderNodes([{ type: "paragraph", children: f.nodes }])
      .replace(/^<p>/, "")
      .replace(/<\/p>$/, "")
      // A field often starts with the separator after the bold label.
      .replace(/^\s*[:—–-]\s*/, ""),
  }));

  const m = /^#\s+(.+)$/m.exec(source);
  return {
    title: m ? m[1]!.trim() : docPath.split("/").pop()!.replace(/\.md$/i, ""),
    frontmatter,
    headings,
    html: renderNodes(tree.children),
  };
}
