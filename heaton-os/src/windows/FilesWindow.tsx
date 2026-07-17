import { useEffect, useRef, useState } from "react";
import { formatDate, postAction, type TreeDir, type TreeNode } from "../api";
import { openFile, useTabs } from "../store/tabs";

type SortMode = "name" | "modified";

const OPENABLE = new Set([
  "md", "png", "jpg", "jpeg", "gif", "webp", "svg", "pdf", "html", "htm",
  "csv", "txt", "sh",
]);

function sortChildren(children: TreeNode[], mode: SortMode): TreeNode[] {
  const sorted = [...children];
  if (mode === "modified") {
    sorted.sort((a, b) => {
      const am = a.type === "dir" ? (a.latestModified ?? "") : a.modified;
      const bm = b.type === "dir" ? (b.latestModified ?? "") : b.modified;
      return bm.localeCompare(am);
    });
  } else {
    sorted.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name, "en-GB");
    });
  }
  return sorted;
}

function FileRow({ node }: { node: Extract<TreeNode, { type: "file" }> }) {
  const openable = OPENABLE.has(node.ext);
  return (
    <li className="tree-row tree-file">
      <span className="tree-ext">{node.ext || "?"}</span>
      {openable ? (
        <button
          type="button"
          className="tree-open"
          onClick={() => openFile(node.path)}
        >
          {node.name}
        </button>
      ) : (
        <span className="tree-name">{node.name}</span>
      )}
      <span className="tree-actions">
        <button
          type="button"
          className="tree-action"
          title="Reveal in Finder"
          aria-label={`Reveal ${node.name} in Finder`}
          onClick={() => void postAction("reveal", node.path)}
        >
          ⌖
        </button>
        {!openable && (
          <button
            type="button"
            className="tree-action"
            title="Open in default app"
            aria-label={`Open ${node.name} in its default app`}
            onClick={() => void postAction("open", node.path)}
          >
            ↗
          </button>
        )}
      </span>
      <span className="tree-meta">{formatDate(node.modified)}</span>
    </li>
  );
}

function DirRow({
  node,
  depth,
  sort,
  revealPath,
}: {
  node: TreeDir;
  depth: number;
  sort: SortMode;
  revealPath: string | null;
}) {
  const [open, setOpen] = useState(depth < 1);
  const onRevealPath =
    revealPath !== null &&
    node.path !== "" &&
    (revealPath === node.path || revealPath.startsWith(node.path + "/"));
  const isRevealTarget = revealPath !== null && revealPath === node.path;
  const rowRef = useRef<HTMLLIElement>(null);

  // A reveal (from Calendar/Activity) expands the ancestors on the path and
  // scrolls the target into view.
  useEffect(() => {
    if (onRevealPath) setOpen(true);
    if (isRevealTarget) {
      rowRef.current?.scrollIntoView({ block: "center" });
    }
  }, [onRevealPath, isRevealTarget]);

  return (
    <li className={`tree-dir${isRevealTarget ? " is-revealed" : ""}`} ref={rowRef}>
      <button
        type="button"
        className="tree-row tree-dir-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="tree-chevron" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span className="tree-name">{node.name}</span>
        <span className="tree-meta">
          {node.fileCount} {node.fileCount === 1 ? "file" : "files"} ·{" "}
          {formatDate(node.latestModified)}
        </span>
      </button>
      {open && node.children.length > 0 && (
        <ul className="tree-children">
          {sortChildren(node.children, sort).map((child) =>
            child.type === "dir" ? (
              <DirRow
                key={child.path}
                node={child}
                depth={depth + 1}
                sort={sort}
                revealPath={revealPath}
              />
            ) : (
              <FileRow key={child.path} node={child} />
            )
          )}
        </ul>
      )}
    </li>
  );
}

/** Find the subtree at a workspace-relative dir path, for space-scoped Files. */
function subtreeAt(tree: TreeDir, scope: string): TreeDir | null {
  if (scope === "") return tree;
  const segments = scope.split("/");
  let node: TreeDir = tree;
  for (const seg of segments) {
    const next = node.children.find(
      (c): c is TreeDir => c.type === "dir" && c.name === seg
    );
    if (!next) return null;
    node = next;
  }
  return node;
}

export function FilesWindow({
  tree,
  error,
  scope = "",
}: {
  tree: TreeDir | null;
  error: string | null;
  /** Restrict the browser to this workspace-relative folder (Phase 5). */
  scope?: string;
}) {
  const [sort, setSort] = useState<SortMode>("name");
  const revealPath = useTabs((s) => s.revealPath);

  if (error) {
    return (
      <div className="tree-state" role="alert">
        <p className="tree-state-title">Workspace not mounted</p>
        <p>{error}</p>
        <p>
          Check <code>WORKSPACE_ROOT</code> in <code>.env</code>, then restart{" "}
          <code>npm run os</code>.
        </p>
      </div>
    );
  }
  if (!tree) {
    return (
      <div className="tree-state" role="status">
        <p>Reading the workspace…</p>
      </div>
    );
  }
  const root = subtreeAt(tree, scope) ?? tree;
  return (
    <div className="tree">
      <div className="tree-toolbar">
        <p className="tree-summary">
          <strong>{root.fileCount}</strong> files · latest change{" "}
          {formatDate(root.latestModified)}
        </p>
        <div className="tree-sort" role="group" aria-label="Sort files">
          {(["name", "modified"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={`tree-sort-btn${sort === mode ? " is-active" : ""}`}
              aria-pressed={sort === mode}
              onClick={() => setSort(mode)}
            >
              {mode === "name" ? "A–Z" : "Recent"}
            </button>
          ))}
        </div>
      </div>
      <ul className="tree-children tree-root">
        {sortChildren(root.children, sort).map((child) =>
          child.type === "dir" ? (
            <DirRow
              key={child.path}
              node={child}
              depth={0}
              sort={sort}
              revealPath={revealPath}
            />
          ) : (
            <FileRow key={child.path} node={child} />
          )
        )}
      </ul>
    </div>
  );
}
