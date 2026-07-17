import fs from "node:fs/promises";
import {
  SPACE_SECTIONS,
  TODOIST_API_TOKEN,
  TODOIST_FIXTURE,
  TODOIST_PROJECT_ID,
} from "./config.js";

/**
 * Todoist proxy (brief §2.2 / §4.4). The token lives in .env and never
 * reaches the client — this module is the only thing that touches it.
 * Responses cache ~60s. With no token and no fixture the proxy reports
 * `configured: false` so the Tasks app can show a calm setup card rather
 * than inventing data.
 */

const REST = "https://api.todoist.com/rest/v2";
const CACHE_MS = 60_000;

export type Owner = "jono" | "claude" | "waiting";

export interface Task {
  id: string;
  content: string;
  description: string;
  priority: "p1" | "p2" | "p3" | "p4";
  owner: Owner;
  due: string | null; // YYYY-MM-DD
  sectionId: string | null;
  sectionName: string | null;
  url: string;
}

export interface TasksResult {
  configured: boolean;
  source: "live" | "fixture" | "none";
  tasks: Task[];
}

interface RestTask {
  id: string;
  content: string;
  description?: string;
  priority?: number; // 1 (normal) … 4 (urgent) — inverse of the p1–p4 UI
  labels?: string[];
  section_id?: string | null;
  due?: { date?: string } | null;
  url?: string;
}

interface RestSection {
  id: string;
  name: string;
}

const PRIORITY_MAP: Record<number, Task["priority"]> = {
  4: "p1",
  3: "p2",
  2: "p3",
  1: "p4",
};

function ownerOf(labels: string[]): Owner {
  if (labels.includes("waiting")) return "waiting";
  if (labels.includes("claude")) return "claude";
  return "jono";
}

let cache: { at: number; result: TasksResult } | null = null;

async function restGet<T>(pathname: string): Promise<T> {
  const res = await fetch(`${REST}${pathname}`, {
    headers: { Authorization: `Bearer ${TODOIST_API_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Todoist ${pathname} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function loadLive(): Promise<Task[]> {
  const [rawTasks, sections] = await Promise.all([
    restGet<RestTask[]>(`/tasks?project_id=${TODOIST_PROJECT_ID}`),
    restGet<RestSection[]>(`/sections?project_id=${TODOIST_PROJECT_ID}`),
  ]);
  const sectionName = new Map(sections.map((s) => [s.id, s.name]));
  return rawTasks.map((t) => ({
    id: t.id,
    content: t.content,
    description: t.description ?? "",
    priority: PRIORITY_MAP[t.priority ?? 1] ?? "p4",
    owner: ownerOf(t.labels ?? []),
    due: t.due?.date ?? null,
    sectionId: t.section_id ?? null,
    sectionName: t.section_id ? (sectionName.get(t.section_id) ?? null) : null,
    url: t.url ?? `https://todoist.com/showTask?id=${t.id}`,
  }));
}

async function loadFixture(): Promise<Task[]> {
  const raw = await fs.readFile(TODOIST_FIXTURE, "utf8");
  return JSON.parse(raw) as Task[];
}

async function loadTasks(): Promise<TasksResult> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.result;

  let result: TasksResult;
  if (TODOIST_API_TOKEN) {
    result = { configured: true, source: "live", tasks: await loadLive() };
  } else if (TODOIST_FIXTURE) {
    result = { configured: true, source: "fixture", tasks: await loadFixture() };
  } else {
    result = { configured: false, source: "none", tasks: [] };
  }
  cache = { at: Date.now(), result };
  return result;
}

const PRIORITY_RANK: Record<Task["priority"], number> = {
  p1: 0,
  p2: 1,
  p3: 2,
  p4: 3,
};

function byPriorityThenDue(a: Task, b: Task): number {
  if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority]) {
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  }
  if (a.due && b.due) return a.due.localeCompare(b.due);
  if (a.due) return -1;
  if (b.due) return 1;
  return 0;
}

/** My Plate: Jono's own actionable tasks, most pressing first (brief §4.4). */
export async function plate(): Promise<TasksResult> {
  const all = await loadTasks();
  return {
    ...all,
    tasks: all.tasks
      .filter((t) => t.owner === "jono")
      .sort(byPriorityThenDue),
  };
}

/** Tasks for a space's Todoist section (by space id). */
export async function sectionTasks(spaceId: string): Promise<TasksResult> {
  const all = await loadTasks();
  const name = SPACE_SECTIONS[spaceId];
  if (name === null || name === undefined) {
    return { ...all, tasks: [] };
  }
  return {
    ...all,
    tasks: all.tasks
      .filter((t) => t.sectionName === name)
      .sort(byPriorityThenDue),
  };
}

export async function completeTask(
  id: string
): Promise<{ ok: boolean; source: string }> {
  if (TODOIST_API_TOKEN) {
    const res = await fetch(`${REST}/tasks/${encodeURIComponent(id)}/close`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TODOIST_API_TOKEN}` },
    });
    cache = null; // let the next read reflect the completion
    return { ok: res.ok, source: "live" };
  }
  // Fixture/none: optimistic — drop it from the cached list so the UI settles.
  if (cache) {
    cache.result = {
      ...cache.result,
      tasks: cache.result.tasks.filter((t) => t.id !== id),
    };
  }
  return { ok: true, source: TODOIST_FIXTURE ? "fixture" : "none" };
}
