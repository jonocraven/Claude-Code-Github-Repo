import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildTree, type TreeDir, type TreeNode } from "./tree.js";

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "sample-workspace"
);

function flatten(node: TreeNode): TreeNode[] {
  if (node.type === "file") return [node];
  return [node, ...node.children.flatMap(flatten)];
}

describe("buildTree over the fixture workspace", () => {
  it("walks real hazard names: spaces, em-dashes, parentheses (§10)", async () => {
    const tree = await buildTree(FIXTURE);
    const paths = flatten(tree).map((n) => n.path);

    expect(paths).toContain(
      "Design System/The Family Table Co — Design System/notes.md"
    );
    expect(paths).toContain(
      "Spaces/Job-Search/Resources/digests/State (machine memory — ignore)/state.md"
    );
    // Those paths must survive an encodeURIComponent round-trip per segment.
    for (const p of paths) {
      const roundTripped = p
        .split("/")
        .map((seg) => decodeURIComponent(encodeURIComponent(seg)))
        .join("/");
      expect(roundTripped).toBe(p);
    }
  });

  it("respects the ignore list", async () => {
    const tree = await buildTree(FIXTURE);
    const names = flatten(tree).map((n) => n.name);
    for (const banned of [".DS_Store", ".tmp.driveupload", ".obsidian"]) {
      expect(names).not.toContain(banned);
    }
  });

  it("reports per-node file counts and latest-modified dates", async () => {
    const tree = await buildTree(FIXTURE);
    expect(tree.fileCount).toBeGreaterThanOrEqual(15);
    expect(tree.latestModified).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const spaces = tree.children.find(
      (n): n is TreeDir => n.type === "dir" && n.name === "Spaces"
    );
    expect(spaces).toBeDefined();
    expect(spaces!.children).toHaveLength(8); // the eight space folders
    expect(spaces!.fileCount).toBeGreaterThanOrEqual(11);
  });

  it("sorts directories before files, alphabetically", async () => {
    const tree = await buildTree(FIXTURE);
    const types = tree.children.map((n) => n.type);
    const firstFile = types.indexOf("file");
    const lastDir = types.lastIndexOf("dir");
    expect(lastDir).toBeLessThan(firstFile);
  });
});
