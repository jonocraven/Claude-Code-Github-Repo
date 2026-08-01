import { getState } from "./state.js";
import type { TreeDir, TreeNode } from "./tree.js";

/**
 * Recent-activity feed (brief §4.7). Files changed within the window,
 * grouped by day (newest first) and badged by space — the "what's been
 * happening" timeline.
 *
 * Derived from the watcher-maintained tree (brief 07) rather than a fresh
 * `fs.stat` walk per request — the tree already carries everything an
 * ActivityFile needs (name, ext, modified) and already respects the ignore
 * convention, so flattening it is the entire job.
 */

export interface ActivityFile {
  path: string;
  name: string;
  ext: string;
  space: string | null;
  area: string; // space name, or the top-level folder, for the badge
  modified: string;
}

export interface ActivityDay {
  date: string; // YYYY-MM-DD
  files: ActivityFile[];
}

function spaceOf(rel: string): string | null {
  const m = /^Spaces\/([^/]+)\//.exec(rel);
  return m ? m[1]! : null;
}

function areaOf(rel: string): string {
  const space = spaceOf(rel);
  if (space) return space;
  const top = rel.split("/")[0]!;
  return rel.includes("/") ? top : "Root";
}

/** Recursively collect every file node beneath `dir`, as `ActivityFile`s. */
function flatten(dir: TreeDir, out: ActivityFile[]): void {
  for (const child of dir.children) {
    flattenNode(child, out);
  }
}

function flattenNode(node: TreeNode, out: ActivityFile[]): void {
  if (node.type === "dir") {
    flatten(node, out);
    return;
  }
  out.push({
    path: node.path,
    name: node.name,
    ext: node.ext,
    space: spaceOf(node.path),
    area: areaOf(node.path),
    modified: node.modified,
  });
}

/**
 * Pure derivation: everything but the tree lookup, so it can be exercised
 * against a fixture tree in tests without touching `WORKSPACE_ROOT`.
 */
export function activityFromTree(tree: TreeDir, days: number): ActivityDay[] {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const all: ActivityFile[] = [];
  flatten(tree, all);

  const recent = all
    .filter((f) => new Date(f.modified).getTime() >= cutoff)
    .sort((a, b) => b.modified.localeCompare(a.modified));

  const byDay = new Map<string, ActivityFile[]>();
  for (const file of recent) {
    const day = file.modified.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push(file);
    byDay.set(day, list);
  }

  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, files]) => ({ date, files }));
}

export async function recentActivity(days: number): Promise<ActivityDay[]> {
  return activityFromTree(getState().tree, days);
}
