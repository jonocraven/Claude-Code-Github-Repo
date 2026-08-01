import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { activityFromTree, type ActivityDay, type ActivityFile } from "./recent.js";
import { buildTree } from "./tree.js";

/**
 * Brief 07's correctness gate: the tree-derived activity feed must produce
 * exactly the same output as the old fs-walking implementation. See the
 * "oracle" below — kept only for this comparison, never imported by the app.
 */

const IGNORE_NAMES = new Set([
  ".DS_Store",
  ".tmp.driveupload",
  ".tmp.drivedownload",
  ".obsidian",
  ".claude",
  "__pycache__",
  "node_modules",
]);
const IGNORE_SUFFIX = /ignore\)(\.[a-z0-9]+)?\s*$/i;
function isIgnored(name: string): boolean {
  return IGNORE_NAMES.has(name) || IGNORE_SUFFIX.test(name);
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

/**
 * ORACLE — a straight copy of the pre-brief-07 `recentActivity`, kept only so
 * the new tree-derived implementation can be asserted against it. It is not
 * imported anywhere in the app; if you find yourself "fixing" it to make a
 * test pass, that is the mirror trap the brief warns about — don't.
 */
async function oracleWalk(root: string, dir: string, out: ActivityFile[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  // Sequential, not Promise.all: the point of this oracle is a byte-identical
  // comparison, and concurrent stats race on completion order when many
  // fixture files share a tie-broken sort key.
  for (const entry of entries) {
    if (isIgnored(entry.name)) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await oracleWalk(root, abs, out);
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
  }
}

async function oracleRecentActivity(root: string, days: number): Promise<ActivityDay[]> {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const all: ActivityFile[] = [];
  await oracleWalk(root, root, all);

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

const FIXTURE = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "fixtures",
  "sample-workspace"
);

const DAY = 24 * 60 * 60 * 1000;
// Fixed reference "now" so mtimes set once at setup and the cutoff computed
// inside the code under test never drift apart by however long the test
// takes to run — without this, a boundary-exact assertion is a coin flip.
const NOW = new Date("2026-08-01T12:00:00.000Z").getTime();

let root: string;

async function listFiles(dir: string, out: string[] = []): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) await listFiles(abs, out);
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  root = await fs.mkdtemp(path.join(os.tmpdir(), "heaton-os-recent-test-"));
  await fs.cp(FIXTURE, root, { recursive: true });
});

afterEach(async () => {
  vi.useRealTimers();
  await fs.rm(root, { recursive: true, force: true });
});

const touch = (rel: string, when: Date) => fs.utimes(path.join(root, rel), when, when);

describe("activityFromTree equality contract vs the old fs-walking oracle", () => {
  for (const days of [7, 14, 30]) {
    it(`deep-equals the oracle for days=${days}`, async () => {
      // Give every fixture file a unique mtime, one day apart, spanning well
      // past 30 days — this exercises the filter and both sort orders for
      // real instead of relying on the fixture's tied default mtimes (which
      // makes tie-break order implementation-defined and the comparison
      // flaky either way).
      const files = await listFiles(root);
      await Promise.all(
        files.map((abs, i) => fs.utimes(abs, new Date(NOW - i * DAY), new Date(NOW - i * DAY)))
      );

      const tree = await buildTree(root);
      const actual = activityFromTree(tree, days);
      const expected = await oracleRecentActivity(root, days);
      expect(actual).toEqual(expected);
    });
  }
});

describe("bucketing edges", () => {
  it("includes a file modified exactly on the cutoff boundary", async () => {
    const days = 7;
    const boundary = new Date(NOW - days * DAY); // exactly `days` * 24h ago
    await touch("Spaces/Home/MEMORY.md", boundary);

    const tree = await buildTree(root);
    const result = activityFromTree(tree, days);
    const paths = result.flatMap((d) => d.files.map((f) => f.path));
    expect(paths).toContain("Spaces/Home/MEMORY.md");
  });

  it("excludes a file modified one second before the cutoff boundary", async () => {
    const days = 7;
    const justBefore = new Date(NOW - days * DAY - 1000);
    await touch("Spaces/Home/MEMORY.md", justBefore);

    const tree = await buildTree(root);
    const result = activityFromTree(tree, days);
    const paths = result.flatMap((d) => d.files.map((f) => f.path));
    expect(paths).not.toContain("Spaces/Home/MEMORY.md");
  });

  it("groups two files on the same day into one bucket, newest first", async () => {
    const day = new Date(NOW);
    day.setUTCHours(10, 0, 0, 0);
    const earlier = new Date(day.getTime());
    const later = new Date(day.getTime() + 60 * 60 * 1000); // +1h, same day

    await touch("Spaces/Home/MEMORY.md", earlier);
    await touch("Spaces/Finances/MEMORY.md", later);

    const tree = await buildTree(root);
    const result = activityFromTree(tree, 7);
    const bucket = result.find((d) => d.date === day.toISOString().slice(0, 10));
    expect(bucket).toBeDefined();
    const idxLater = bucket!.files.findIndex((f) => f.path === "Spaces/Finances/MEMORY.md");
    const idxEarlier = bucket!.files.findIndex((f) => f.path === "Spaces/Home/MEMORY.md");
    expect(idxLater).toBeGreaterThanOrEqual(0);
    expect(idxEarlier).toBeGreaterThanOrEqual(0);
    expect(idxLater).toBeLessThan(idxEarlier); // newest-first within a day
  });

  it("never produces an empty day bucket", async () => {
    const tree = await buildTree(root);
    const result = activityFromTree(tree, 30);
    for (const day of result) {
      expect(day.files.length).toBeGreaterThan(0);
    }
  });
});

describe("ignore convention", () => {
  it("never surfaces a file named '(ignore)'", async () => {
    await fs.writeFile(
      path.join(root, "Spaces/Home/Draft (ignore).md"),
      "# hidden\n",
      "utf8"
    );
    await touch("Spaces/Home/Draft (ignore).md", new Date(NOW));

    const tree = await buildTree(root);
    const result = activityFromTree(tree, 30);
    const names = result.flatMap((d) => d.files.map((f) => f.name));
    expect(names).not.toContain("Draft (ignore).md");
  });
});
