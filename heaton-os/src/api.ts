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

export interface FrontMatterField {
  label: string;
  html: string;
}

export interface FileResponse {
  kind: "markdown" | "csv" | "image" | "pdf" | "html" | "other";
  path: string;
  name: string;
  ext: string;
  size: number;
  modified: string;
  title?: string;
  frontmatter?: FrontMatterField[];
  html?: string;
  text?: string;
}

export interface Backlink {
  source: string;
  sourceTitle: string;
  snippet: string;
}

export interface SearchHit {
  path: string;
  title: string;
  space: string | null;
  snippet: string;
  score: number;
}

export interface SearchResponse {
  keyword: SearchHit[];
  semantic: SearchHit[];
  semanticStatus: "building" | "ready" | "unavailable";
}

export function rawUrl(path: string): string {
  return `/api/raw?path=${encodeURIComponent(path)}`;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.message ?? body?.error ?? `${url} failed (${res.status})`);
  }
  return res.json();
}

export function fetchFile(path: string): Promise<FileResponse> {
  return getJson(`/api/file?path=${encodeURIComponent(path)}`);
}

export async function fetchBacklinks(path: string): Promise<Backlink[]> {
  const data = await getJson<{ backlinks: Backlink[] }>(
    `/api/backlinks?path=${encodeURIComponent(path)}`
  );
  return data.backlinks;
}

export function fetchSearch(q: string, space: string | null): Promise<SearchResponse> {
  const params = new URLSearchParams({ q });
  if (space) params.set("space", space);
  return getJson(`/api/search?${params}`);
}

export function postAction(action: "reveal" | "open", path: string): Promise<unknown> {
  return fetch(`/api/${action}?path=${encodeURIComponent(path)}`, {
    method: "POST",
  });
}

/** DD-MM-YYYY — UK conventions throughout (brief §7). */
export function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}
