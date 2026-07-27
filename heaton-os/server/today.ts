import { SPACE_SECTIONS } from "./config.js";
import { memoryHealth, type MemoryGauge } from "./memory.js";
import { recentActivity, type ActivityFile } from "./recent.js";
import { scheduledMonth, type ScheduledEvent } from "./scheduled.js";
import { allTasks, type Task, type TasksResult } from "./todoist.js";

/**
 * Today — the cross-space answer to "what is going on?".
 *
 * Everything here already existed as its own siloed endpoint; the value is in
 * the composition and, above all, the ranking. The screen is only useful if it
 * can be read in about ten seconds, so the rule is that a thing earns a place
 * by *needing a decision today*, not by merely existing. Anything that is
 * simply true — a green memory gauge, a task due next month, a file touched by
 * a Drive sync — is deliberately left off. Completeness belongs in the
 * dedicated apps; this is a triage surface.
 */

/** A space label both tasks and files can be grouped under. */
export interface SpaceRef {
  /** Space id used by the client router, e.g. "job-search". */
  id: string | null;
  /** Human label, e.g. "Job Search". */
  label: string;
}

export interface ChangedGroup extends SpaceRef {
  files: ActivityFile[];
  /** Total in the window — `files` is capped for display. */
  total: number;
}

export interface TodayResponse {
  now: string;
  /** The cutoff actually used for "changed", after any widening. */
  since: string;
  /**
   * True when the caller's `since` produced nothing and the window was
   * widened, so the UI can say so rather than showing a silently different
   * range. Prevents "nothing changed" reading as "the feature is broken".
   */
  sinceWidened: boolean;
  tasksConfigured: boolean;
  overdue: Task[];
  dueToday: Task[];
  upcoming: Task[];
  waiting: Task[];
  runsToday: ScheduledEvent[];
  memoryBreaches: MemoryGauge[];
  changed: ChangedGroup[];
  changedTotal: number;
}

/** Folder name ("Job-Search") → space id ("job-search"). */
function spaceIdFromFolder(folder: string): string | null {
  const id = folder.toLowerCase();
  return id in SPACE_SECTIONS ? id : null;
}

/** Todoist section name ("Job Search") → space id, via the configured map. */
function spaceIdFromSection(section: string | null): string | null {
  if (!section) return null;
  const hit = Object.entries(SPACE_SECTIONS).find(([, name]) => name === section);
  return hit ? hit[0] : null;
}

/** Local YYYY-MM-DD — Todoist due dates are date-only and local to Jono. */
function localISODate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const PRIORITY_RANK: Record<Task["priority"], number> = { p1: 0, p2: 1, p3: 2, p4: 3 };

/** Sooner first, then more urgent; undated last. */
function byDueThenPriority(a: Task, b: Task): number {
  if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due);
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
}

/** How far ahead "upcoming" looks. A week is one planning horizon. */
const UPCOMING_DAYS = 7;
/** Files shown per space before collapsing to a count. */
const FILES_PER_SPACE = 4;
/** Caps — this is triage, not an inbox. */
const MAX_UPCOMING = 6;
const MAX_WAITING = 5;

/**
 * Widening ladder for "changed since you last looked". Opening Today twice in
 * an hour would otherwise show an empty feed, which reads as breakage rather
 * than calm. If the caller's cutoff finds nothing, fall back through
 * progressively wider windows and tell the client it happened.
 */
const WIDEN_HOURS = [24, 72, 24 * 7];

/**
 * The ranking rules, kept pure so they can be tested without a workspace or a
 * Todoist token. This is the product judgement of the screen: what is late,
 * what is due now, what is near enough to matter, and what is not yours.
 */
export function bucketTasks(
  tasks: Task[],
  todayStr: string,
  horizonStr: string
): { overdue: Task[]; dueToday: Task[]; upcoming: Task[]; waiting: Task[] } {
  const mine = tasks.filter((t) => t.owner === "jono");
  return {
    overdue: mine
      .filter((t) => t.due !== null && t.due < todayStr)
      .sort(byDueThenPriority),
    dueToday: mine.filter((t) => t.due === todayStr).sort(byDueThenPriority),
    upcoming: mine
      .filter((t) => t.due !== null && t.due > todayStr && t.due <= horizonStr)
      .sort(byDueThenPriority)
      .slice(0, MAX_UPCOMING),
    waiting: tasks
      .filter((t) => t.owner !== "jono")
      .sort(byDueThenPriority)
      .slice(0, MAX_WAITING),
  };
}

export function groupBySpace(files: ActivityFile[]): ChangedGroup[] {
  const groups = new Map<string, ActivityFile[]>();
  for (const f of files) {
    const list = groups.get(f.area) ?? [];
    list.push(f);
    groups.set(f.area, list);
  }
  return [...groups.entries()]
    .map(([area, list]) => ({
      id: spaceIdFromFolder(area),
      label: area.replace(/-/g, " "),
      files: list.slice(0, FILES_PER_SPACE),
      total: list.length,
    }))
    // Busiest space first — that is where the work has been happening.
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, "en-GB"));
}

export async function today(sinceISO: string | null): Promise<TodayResponse> {
  const now = new Date();
  const todayStr = localISODate(now);

  const [tasks, health, scheduled] = await Promise.all([
    allTasks(),
    memoryHealth(),
    scheduledMonth(now.getFullYear(), now.getMonth() + 1),
  ]);

  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + UPCOMING_DAYS);
  const { overdue, dueToday, upcoming, waiting } = bucketTasks(
    tasks.tasks,
    todayStr,
    localISODate(horizon)
  );

  const runsToday = scheduled.filter((e) => e.date === todayStr);

  // Green gauges say nothing actionable; the top-bar dot already carries the
  // ambient signal. Only breaches earn space here.
  const memoryBreaches = health.gauges
    .filter((g) => g.status !== "green")
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "red" ? -1 : 1));

  // "Changed" — widen until something shows, so the section is never a
  // confusing blank.
  const requested = sinceISO ? new Date(sinceISO) : null;
  const validSince =
    requested && !Number.isNaN(requested.getTime()) ? requested : null;

  const activityWindow = await recentActivity(30);
  const flat = activityWindow.flatMap((d) => d.files);

  const cutoffs: Date[] = [];
  if (validSince) cutoffs.push(validSince);
  for (const h of WIDEN_HOURS) {
    cutoffs.push(new Date(now.getTime() - h * 3600_000));
  }

  let picked = cutoffs[0]!;
  let matched: ActivityFile[] = [];
  let widened = false;
  for (let i = 0; i < cutoffs.length; i++) {
    const cutoff = cutoffs[i]!;
    const hits = flat.filter((f) => new Date(f.modified).getTime() > cutoff.getTime());
    if (hits.length > 0 || i === cutoffs.length - 1) {
      picked = cutoff;
      matched = hits;
      widened = i > 0 && validSince !== null;
      break;
    }
  }

  return {
    now: now.toISOString(),
    since: picked.toISOString(),
    sinceWidened: widened,
    tasksConfigured: tasks.configured,
    overdue,
    dueToday,
    upcoming,
    waiting,
    runsToday,
    memoryBreaches,
    changed: groupBySpace(matched),
    changedTotal: matched.length,
  };
}

/** Re-exported so the route can report the Todoist source alongside. */
export type { Task, TasksResult, MemoryGauge, ScheduledEvent, ActivityFile };
export { spaceIdFromSection };
