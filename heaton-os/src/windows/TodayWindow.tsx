import { useEffect, useMemo, useRef, useState } from "react";
import {
  completeTask,
  fetchToday,
  formatDate,
  type ChangedGroup,
  type Task,
  type TodayResponse,
} from "../api";
import { AppIcon } from "../icons";
import { useLive } from "../store/live";
import { openFile, useTabs } from "../store/tabs";

/**
 * Today — the answer to "what is going on across everything?".
 *
 * Ordered by what needs a decision soonest: things that are late, then things
 * due now, then the day's scheduled runs, then what has moved, then what is
 * parked with someone else. Sections that have nothing to say render nothing
 * at all, so the page shortens on a quiet day rather than filling with
 * reassurances. The ranking itself lives server-side in server/today.ts.
 */

const SEEN_KEY = "heaton-os.today.v1";

function readLastSeen(): string | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return null;
    const at = (JSON.parse(raw) as { lastSeenAt?: string }).lastSeenAt;
    return typeof at === "string" ? at : null;
  } catch {
    return null;
  }
}

function writeLastSeen(iso: string): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify({ lastSeenAt: iso }));
  } catch {
    /* storage unavailable — Today just always shows a default window */
  }
}

/** "3 days ago", "12 minutes ago" — for the since-line only. */
function ago(iso: string, now: Date): string {
  const mins = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60000));
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

function daysLate(due: string, now: Date): number {
  const d = new Date(`${due}T00:00:00`);
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((midnight.getTime() - d.getTime()) / 86_400_000);
}

function Section({
  title,
  count,
  tone,
  children,
}: {
  title: string;
  count?: number;
  tone?: "urgent";
  children: React.ReactNode;
}) {
  return (
    <section className={`today-section${tone ? ` today-section-${tone}` : ""}`}>
      <h3 className="today-section-title">
        {title}
        {count !== undefined && <span className="today-count">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

function TaskRow({
  task,
  now,
  onDone,
  showLate,
}: {
  task: Task;
  now: Date;
  onDone: (t: Task) => void;
  showLate?: boolean;
}) {
  const late = showLate && task.due ? daysLate(task.due, now) : 0;
  return (
    <li className="today-task">
      <button
        type="button"
        className="task-check today-task-check"
        title="Complete this task"
        aria-label={`Complete: ${task.content}`}
        onClick={() => onDone(task)}
      />
      <span className="today-task-main">
        <span className="today-task-content">{task.content}</span>
        <span className="today-task-meta">
          <span className={`task-pri task-pri-${task.priority}`}>
            {task.priority.toUpperCase()}
          </span>
          {task.sectionName && <span className="today-task-space">{task.sectionName}</span>}
          {task.due && (
            <span className={`task-due${late > 0 ? " is-overdue" : ""}`}>
              {late > 0
                ? `${late} ${late === 1 ? "day" : "days"} late`
                : formatDate(task.due)}
            </span>
          )}
        </span>
      </span>
      <a
        className="task-link"
        href={task.url}
        target="_blank"
        rel="noreferrer"
        title="Open in Todoist"
        aria-label={`Open "${task.content}" in Todoist`}
      >
        ↗
      </a>
    </li>
  );
}

function ChangedSpace({ group }: { group: ChangedGroup }) {
  const openApp = useTabs((s) => s.openApp);
  const more = group.total - group.files.length;
  return (
    <li className="today-changed-space">
      <button
        type="button"
        className="today-changed-head"
        disabled={!group.id}
        onClick={() => group.id && openApp(group.id)}
        title={group.id ? `Open ${group.label}` : undefined}
      >
        {group.id && <AppIcon appId={group.id} size={16} />}
        <span className="today-changed-label">{group.label}</span>
        <span className="today-count">{group.total}</span>
      </button>
      <ul className="today-changed-files">
        {group.files.map((f) => (
          <li key={f.path}>
            <button type="button" className="today-file" onClick={() => openFile(f.path)}>
              <span className="tree-ext">{f.ext || "?"}</span>
              <span className="today-file-name">{f.name}</span>
            </button>
          </li>
        ))}
        {more > 0 && (
          <li className="today-changed-more">and {more} more</li>
        )}
      </ul>
    </li>
  );
}

export function TodayWindow() {
  const [data, setData] = useState<TodayResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const openApp = useTabs((s) => s.openApp);
  const liveSeq = useLive((s) => s.seq);

  // Captured once, so the "since" line does not move under the reader while
  // they are looking at it. Written back on unmount — leaving the screen is
  // what counts as having looked.
  const since = useRef<string | null>(readLastSeen());
  const now = useMemo(() => (data ? new Date(data.now) : new Date()), [data]);

  useEffect(() => {
    let cancelled = false;
    fetchToday(since.current)
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [liveSeq]);

  useEffect(() => {
    return () => writeLastSeen(new Date().toISOString());
  }, []);

  const complete = (t: Task) => {
    setDone((s) => new Set(s).add(t.id));
    void completeTask(t.id);
  };
  const live = (list: Task[]) => list.filter((t) => !done.has(t.id));

  if (error) {
    return (
      <div className="tree-state" role="alert">
        <p className="tree-state-title">Couldn't build Today</p>
        <p>{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="tree-state" role="status">
        <p>Gathering the day…</p>
      </div>
    );
  }

  const overdue = live(data.overdue);
  const dueToday = live(data.dueToday);
  const upcoming = live(data.upcoming);
  const waiting = live(data.waiting);
  const needsYou = overdue.length + dueToday.length + data.memoryBreaches.length;

  const greeting = (() => {
    const h = now.getHours();
    if (h < 12) return "Good morning, Jono.";
    if (h < 18) return "Good afternoon, Jono.";
    return "Good evening, Jono.";
  })();

  return (
    <div className="today">
      <header className="today-head">
        <div>
          <p className="today-kicker">
            {now.toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h2 className="today-greeting">{greeting}</h2>
        </div>
        <p className="today-since">
          Changes since {ago(data.since, now)}
          {data.sinceWidened && " — nothing new since your last visit, so showing a wider window"}
        </p>
      </header>

      {needsYou === 0 && (
        <p className="today-clear">
          Nothing needs a decision today. {upcoming.length > 0
            ? `${upcoming.length} thing${upcoming.length === 1 ? "" : "s"} coming up this week.`
            : "Nothing due this week either."}
        </p>
      )}

      {overdue.length > 0 && (
        <Section title="Overdue" count={overdue.length} tone="urgent">
          <ul className="today-tasks">
            {overdue.map((t) => (
              <TaskRow key={t.id} task={t} now={now} onDone={complete} showLate />
            ))}
          </ul>
        </Section>
      )}

      {dueToday.length > 0 && (
        <Section title="Due today" count={dueToday.length}>
          <ul className="today-tasks">
            {dueToday.map((t) => (
              <TaskRow key={t.id} task={t} now={now} onDone={complete} />
            ))}
          </ul>
        </Section>
      )}

      {data.memoryBreaches.length > 0 && (
        <Section title="Memory needs a trim" count={data.memoryBreaches.length}>
          <ul className="today-breaches">
            {data.memoryBreaches.map((g) => (
              <li key={g.path}>
                <button
                  type="button"
                  className={`today-breach today-breach-${g.status}`}
                  onClick={() => openFile(g.path)}
                >
                  <span className={`gauge-dot gauge-dot-${g.status}`} aria-hidden="true" />
                  <span className="today-breach-name">{g.label}</span>
                  <span className="today-breach-num">
                    {g.lines}/{g.lineCeiling} lines · {g.words}/{g.wordCeiling} words
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.runsToday.length > 0 && (
        <Section title="Running today" count={data.runsToday.length}>
          <ul className="today-runs">
            {data.runsToday.map((e, i) => (
              <li key={i} className="today-run">
                <span className="today-run-time">{e.time}</span>
                <span className="today-run-title">{e.title}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {data.changedTotal > 0 && (
        <Section title="Changed" count={data.changedTotal}>
          <ul className="today-changed">
            {data.changed.map((g) => (
              <ChangedSpace key={g.label} group={g} />
            ))}
          </ul>
        </Section>
      )}

      {upcoming.length > 0 && (
        <Section title="Coming up" count={upcoming.length}>
          <ul className="today-tasks">
            {upcoming.map((t) => (
              <TaskRow key={t.id} task={t} now={now} onDone={complete} />
            ))}
          </ul>
        </Section>
      )}

      {waiting.length > 0 && (
        <Section title="Not on you" count={waiting.length}>
          <ul className="today-tasks today-tasks-quiet">
            {waiting.map((t) => (
              <li key={t.id} className="today-task">
                <span className={`task-owner task-owner-${t.owner}`}>@{t.owner}</span>
                <span className="today-task-main">
                  <span className="today-task-content">{t.content}</span>
                  {t.sectionName && (
                    <span className="today-task-meta">
                      <span className="today-task-space">{t.sectionName}</span>
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {!data.tasksConfigured && (
        <p className="today-setup">
          Tasks aren't connected — add <code>TODOIST_API_TOKEN</code> to{" "}
          <code>.env</code> to see what's due here.
        </p>
      )}

      <footer className="today-foot">
        <button type="button" className="tree-sort-btn" onClick={() => openApp("tasks")}>
          All tasks
        </button>
        <button type="button" className="tree-sort-btn" onClick={() => openApp("activity")}>
          Full activity
        </button>
        <button type="button" className="tree-sort-btn" onClick={() => openApp("calendar")}>
          Calendar
        </button>
      </footer>
    </div>
  );
}
