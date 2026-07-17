export interface TreeFile {
  type: "file";
  name: string;
  path: string;
  ext: string;
  size: number;
  modified: string;
}

export interface TreeDir {
  type: "dir";
  name: string;
  path: string;
  fileCount: number;
  latestModified: string | null;
  children: TreeNode[];
}

export type TreeNode = TreeFile | TreeDir;

export async function fetchTree(): Promise<TreeDir> {
  const res = await fetch("/api/tree");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? `GET /api/tree failed (${res.status})`);
  }
  return res.json();
}

/** DD-MM-YYYY — UK conventions throughout (brief §7). */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}
