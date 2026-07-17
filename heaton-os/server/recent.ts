import fs from "node:fs/promises";
import path from "node:path";
import { IGNORE_NAMES, WORKSPACE_ROOT } from "./config.js";

/**
 * Recent-activity feed (brief §4.7). Files changed within the window,
 * grouped by day (newest first) and badged by space — the "what's been
 * happening" timeline.
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

async function walk(root: string, dir: string, out: ActivityFile[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  await Promise.all(
    entries.map(async (entry) => {
      if (IGNORE_NAMES.has(entry.name)) return;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(root, abs, out);
      } else if (entry.isFile()) {
        const stat = await fs.stat(abs);
        const rel = path.relative(root, abs).split(path.sep).join("/");
        out.push({
          path: rel,
          name: entry.name,
          ext: path.extname(entry.name).replace(/^\./, "").toLowerCase(),
          space: spaceOf(rel),
          area: areaOf(rel),
          modified: stat.mtime.toISOString(),
        });
      }
    })
  );
}

export async function recentActivity(days: number): Promise<ActivityDay[]> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const all: ActivityFile[] = [];
  await walk(WORKSPACE_ROOT, WORKSPACE_ROOT, all);

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
