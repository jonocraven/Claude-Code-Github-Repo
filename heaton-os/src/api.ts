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
  source?: string; // raw markdown, for the editor
}

export interface SaveResult {
  ok: boolean;
  conflict?: boolean;
  modified?: string;
  message?: string;
}

/** Save an edited markdown file (the app's only write). */
export async function saveFile(
  path: string,
  content: string,
  baseModified: string
): Promise<SaveResult> {
  const res = await fetch(`/api/file?path=${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, baseModified }),
  });
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, conflict: true, message: body.message, modified: body.currentModified };
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    return { ok: false, message: body.message ?? `Save failed (${res.status})` };
  }
  const body = await res.json();
  return { ok: true, modified: body.modified };
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

// --- Phase 4: system-app data --------------------------------------------

export type MemoryStatus = "green" | "amber" | "red";

export interface MemoryGauge {
  path: string;
  label: string;
  lines: number;
  words: number;
  lineCeiling: number;
  wordCeiling: number;
  linePct: number;
  wordPct: number;
  status: MemoryStatus;
}

export interface MemoryHealth {
  gauges: MemoryGauge[];
  worst: MemoryStatus;
}

export function fetchMemoryHealth(): Promise<MemoryHealth> {
  return getJson("/api/memory-health");
}

export interface ActivityFile {
  path: string;
  name: string;
  ext: string;
  space: string | null;
  area: string;
  modified: string;
}

export interface ActivityDay {
  date: string;
  files: ActivityFile[];
}

export function fetchRecent(days: number): Promise<{ days: number; activity: ActivityDay[] }> {
  return getJson(`/api/recent?days=${days}`);
}

export interface ScheduledEvent {
  date: string;
  time: string;
  title: string;
  cadence: string;
  folder: string | null;
}

export function fetchScheduled(
  year: number,
  month: number
): Promise<{ year: number; month: number; events: ScheduledEvent[] }> {
  return getJson(`/api/scheduled?year=${year}&month=${month}`);
}

export type Owner = "jono" | "claude" | "waiting";

export interface Task {
  id: string;
  content: string;
  description: string;
  priority: "p1" | "p2" | "p3" | "p4";
  owner: Owner;
  due: string | null;
  sectionId: string | null;
  sectionName: string | null;
  url: string;
}

export interface TasksResult {
  configured: boolean;
  source: "live" | "fixture" | "none";
  tasks: Task[];
}

export function fetchPlate(): Promise<TasksResult> {
  return getJson("/api/todoist/plate");
}

export function fetchSpaceTasks(space: string): Promise<TasksResult> {
  return getJson(`/api/todoist/space?space=${encodeURIComponent(space)}`);
}

export function completeTask(id: string): Promise<Response> {
  return fetch(`/api/todoist/complete?id=${encodeURIComponent(id)}`, {
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
