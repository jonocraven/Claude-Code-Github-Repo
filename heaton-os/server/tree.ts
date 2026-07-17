import fs from "node:fs/promises";
import path from "node:path";
import { IGNORE_NAMES } from "./config.js";

export interface TreeFile {
  type: "file";
  name: string;
  /** Workspace-relative path, always with forward slashes. */
  path: string;
  ext: string;
  size: number;
  modified: string; // ISO 8601
}

export interface TreeDir {
  type: "dir";
  name: string;
  path: string;
  /** Recursive count of files beneath this node. */
  fileCount: number;
  /** ISO date of the most recently modified file beneath this node, if any. */
  latestModified: string | null;
  children: TreeNode[];
}

export type TreeNode = TreeFile | TreeDir;

function relPath(root: string, abs: string): string {
  return path.relative(root, abs).split(path.sep).join("/");
}

export async function buildTree(root: string, dir = root): Promise<TreeDir> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const children: TreeNode[] = [];
  let fileCount = 0;
  let latestModified: string | null = null;

  const bump = (iso: string | null) => {
    if (iso && (!latestModified || iso > latestModified)) latestModified = iso;
  };

  for (const entry of entries) {
    if (IGNORE_NAMES.has(entry.name)) continue;
    const abs = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      const sub = await buildTree(root, abs);
      children.push(sub);
      fileCount += sub.fileCount;
      bump(sub.latestModified);
    } else if (entry.isFile()) {
      const stat = await fs.stat(abs);
      const modified = stat.mtime.toISOString();
      children.push({
        type: "file",
        name: entry.name,
        path: relPath(root, abs),
        ext: path.extname(entry.name).replace(/^\./, "").toLowerCase(),
        size: stat.size,
        modified,
      });
      fileCount += 1;
      bump(modified);
    }
    // Symlinks and anything exotic are skipped deliberately.
  }

  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, "en-GB");
  });

  return {
    type: "dir",
    name: dir === root ? path.basename(root) : path.basename(dir),
    path: dir === root ? "" : relPath(root, dir),
    fileCount,
    latestModified,
    children,
  };
}
