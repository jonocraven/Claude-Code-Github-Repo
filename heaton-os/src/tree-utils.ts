import type { TreeDir, TreeFile, TreeNode } from "./api";

/** Find a node (file or dir) at a workspace-relative path. */
export function nodeAt(tree: TreeDir, path: string): TreeNode | null {
  if (path === "") return tree;
  const segments = path.split("/");
  let node: TreeNode = tree;
  for (const seg of segments) {
    if (node.type !== "dir") return null;
    const next: TreeNode | undefined = node.children.find((c) => c.name === seg);
    if (!next) return null;
    node = next;
  }
  return node;
}

/** Every file beneath a node, flattened. */
export function flattenFiles(node: TreeNode): TreeFile[] {
  if (node.type === "file") return [node];
  return node.children.flatMap(flattenFiles);
}

/** The most recently modified files beneath a path (excluding MEMORY.md). */
export function recentUnder(
  tree: TreeDir,
  path: string,
  limit: number
): TreeFile[] {
  const node = nodeAt(tree, path);
  if (!node) return [];
  return flattenFiles(node)
    .filter((f) => f.name !== "MEMORY.md")
    .sort((a, b) => b.modified.localeCompare(a.modified))
    .slice(0, limit);
}

/** Direct file children of a folder path (non-recursive), optionally by ext. */
export function filesIn(
  tree: TreeDir,
  path: string,
  exts?: string[]
): TreeFile[] {
  const node = nodeAt(tree, path);
  if (!node || node.type !== "dir") return [];
  return node.children
    .filter((c): c is TreeFile => c.type === "file")
    .filter((f) => !exts || exts.includes(f.ext))
    .sort((a, b) => b.modified.localeCompare(a.modified));
}
