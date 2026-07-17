import { useState } from "react";
import { formatDate, type TreeDir, type TreeNode } from "../api";

function FileRow({ node }: { node: Extract<TreeNode, { type: "file" }> }) {
  return (
    <li className="tree-row tree-file">
      <span className="tree-ext">{node.ext || "?"}</span>
      <span className="tree-name">{node.name}</span>
      <span className="tree-meta">{formatDate(node.modified)}</span>
    </li>
  );
}

function DirRow({ node, depth }: { node: TreeDir; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  return (
    <li className="tree-dir">
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
          {node.children.map((child) =>
            child.type === "dir" ? (
              <DirRow key={child.path} node={child} depth={depth + 1} />
            ) : (
              <FileRow key={child.path} node={child} />
            )
          )}
        </ul>
      )}
    </li>
  );
}

export function TreeWindow({
  tree,
  error,
}: {
  tree: TreeDir | null;
  error: string | null;
}) {
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
  return (
    <div className="tree">
      <p className="tree-summary">
        <strong>{tree.fileCount}</strong> files · latest change{" "}
        {formatDate(tree.latestModified)}
      </p>
      <ul className="tree-children tree-root">
        {tree.children.map((child) =>
          child.type === "dir" ? (
            <DirRow key={child.path} node={child} depth={0} />
          ) : (
            <FileRow key={child.path} node={child} />
          )
        )}
      </ul>
    </div>
  );
}
