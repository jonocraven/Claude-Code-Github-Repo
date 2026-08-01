import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  fetchPlate,
  fetchRecent,
  fetchScheduled,
  type ActivityFile,
  type ScheduledEvent,
  type Task,
} from "../api";
import { openFile, useTabs } from "../store/tabs";
import { CalendarWindow } from "./CalendarWindow";

/**
 * Timeline — the merge of Activity and Calendar.
 *
 * They were two windows asking the same question from opposite ends: Activity
 * listed what had changed, Calendar showed what was scheduled, and neither
 * could tell you the thing you actually want to know, which is what this week
 * looks like. Splitting time by tense is an implementation detail leaking into
 * the UI — the workspace does not experience Tuesday twice.
 *
 * So: one spine of days running past → future with today anchored in it, and
 * the month grid kept as a second view because a month at a glance is a real
 * question the spine answers badly.
 *
 * The encoding problem (three event types in one row without mush) is solved
 * by *not* spending colour on it. Colour already means space, everywhere in
 * this app, and overloading it would break that for a gain of nothing. Type is
 * carried by shape instead: a change is a filled square, a scheduled run is a
 * ring, a task is a checkbox.
 */

const AREA_ACCENT: Record<string, string> = {
  "Cookery-Books": "--accent-cookery-books",
  WFDinner: "--accent-wfdinner",
  Home: "--accent-home",
  "House-Move": "--accent-house-move",
  "Job-Search": "--accent-job-search",
  Finances: "--accent-finances",
  "Side-Hustle": "--accent-side-hustle",
  "Life-Plan": "--accent-life-plan",
};

const CADENCE_ACCENT: Record<string, string> = {
  "memory-tidy": "--accent-life-plan",
  "strategic-review": "--accent-job-search",
  "job-search-refresh": "--accent-job-search",
  "finance-refresh": "--accent-finances",
  "hygiene-check": "--accent-side-hustle",
  "monday-pulse": "--accent-home",
};

/** Windows are symmetrical: as far back as forward, so today sits in the middle. */
const SPANS = [7, 14, 30];
/** Beyond this, a day's changes collapse behind a count — a Drive sync can
 *  touch dozens of files at once and that is noise, not history. */
const FILES_PER_DAY = 6;

type Entry =
  | { kind: "change"; at: string; file: ActivityFile }
  | { kind: "run"; at: string; event: ScheduledEvent }
  | { kind: "task"; at: string; task: Task };

interface Day {
  date: string;
  entries: Entry[];
}

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

function dayLabel(iso: string, todayIso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const diff = Math.round(
    (new Date(`${iso}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) /
      86_400_000
  );
  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/**
 * Bucket everything by day, then drop the empty days — but remember how many
 * were dropped. A spine padded with blank Wednesdays reads as a system with
 * nothing to say; a spine that says "4 quiet days" reads as a system that
 * checked. The gap is information, the blanks are not.
 */
export function buildDays(
  changes: ActivityFile[],
  runs: ScheduledEvent[],
  tasks: Task[],
  from: string,
  to: string
): Day[] {
  const byDay = new Map<string, Entry[]>();
  const push = (date: string, entry: Entry) => {
    if (date < from || date > to) return;
    const list = byDay.get(date) ?? [];
    list.push(entry);
    byDay.set(date, list);
  };

  for (const f of changes) push(f.modified.slice(0, 10), { kind: "change", at: f.modified, file: f });
  for (const e of runs) push(e.date, { kind: "run", at: `${e.date}T${e.time}`, event: e });
  for (const t of tasks) {
    if (t.due) push(t.due.slice(0, 10), { kind: "task", at: t.due, task: t });
  }

  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, entries]) => ({
      date,
      // Within a day: scheduled runs first (they have clock times and set the
      // day's shape), then tasks, then the changes they produced.
      entries: entries.sort((a, b) => {
        const rank = { run: 0, task: 1, change: 2 };
        return rank[a.kind] - rank[b.kind] || a.at.localeCompare(b.at);
      }),
    }));
}

/** Whole days between two ISO dates, exclusive of both — the size of a gap. */
export function gapBetween(a: string, b: string): number {
  const days = Math.round(
    (new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / 86_400_000
  );
  return Math.max(days - 1, 0);
}

function ChangeRow({ file }: { file: ActivityFile }) {
  const accent = AREA_ACCENT[file.area] ?? "--accent-system";
  return (
    <button type="button" className="tl-entry" onClick={() => openFile(file.path)} title={file.path}>
      <span
        className="tl-mark tl-mark-change"
        style={{ "--mark": `var(${accent})` } as React.CSSProperties}
        aria-hidden="true"
      />
      <span className="tl-entry-name">{file.name}</span>
      <span className="tl-entry-meta">{file.area}</span>
      <span className="tl-entry-time">
        {new Date(file.modified).toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </span>
    </button>
  );
}

function RunRow({ event }: { event: ScheduledEvent }) {
  const reveal = useTabs((s) => s.reveal);
  const accent = CADENCE_ACCENT[event.cadence] ?? "--accent-system";
  return (
    <button
      type="button"
      className="tl-entry tl-entry-run"
      disabled={!event.folder}
      onClick={() => event.folder && reveal(event.folder)}
      title={event.folder ? `${event.title} — open folder` : event.title}
    >
      <span
        className="tl-mark tl-mark-run"
        style={{ "--mark": `var(${accent})` } as React.CSSProperties}
        aria-hidden="true"
      />
      <span className="tl-entry-name">{event.title}</span>
      <span className="tl-entry-meta">scheduled</span>
      <span className="tl-entry-time">{event.time}</span>
    </button>
  );
}

function TaskRow({ task, overdue }: { task: Task; overdue: boolean }) {
  return (
    <a
      className={`tl-entry tl-entry-task${overdue ? " is-overdue" : ""}`}
      href={task.url}
      target="_blank"
      rel="noreferrer"
      title={task.content}
    >
      <span className="tl-mark tl-mark-task" aria-hidden="true" />
      <span className="tl-entry-name">{task.content}</span>
      <span className="tl-entry-meta">{task.sectionName ?? "task"}</span>
      <span className="tl-entry-time">{overdue ? "overdue" : "due"}</span>
    </a>
  );
}

function Agenda({ span }: { span: number }) {
  const todayIso = useMemo(() => isoDay(new Date()), []);
  const [days, setDays] = useState<Day[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const anchor = useRef<HTMLDivElement>(null);

  const { from, to } = useMemo(() => {
    const f = new Date();
    f.setDate(f.getDate() - span);
    const t = new Date();
    t.setDate(t.getDate() + span);
    return { from: isoDay(f), to: isoDay(t) };
  }, [span]);

  useEffect(() => {
    let cancelled = false;
    setDays(null);
    setError(null);

    // The forward half can cross a month boundary, so the scheduled runs are
    // fetched for every month the window touches, not just the current one.
    const months = new Set<string>();
    for (const iso of [from, to]) months.add(iso.slice(0, 7));

    Promise.all([
      fetchRecent(span),
      Promise.all(
        [...months].map((m) => {
          const [y, mo] = m.split("-");
          return fetchScheduled(Number(y), Number(mo)).then((r) => r.events);
        })
      ),
      // Tasks are optional: without a Todoist token the plate is empty, and
      // the timeline should degrade to changes and runs rather than error.
      fetchPlate().catch(() => ({ configured: false, source: "none" as const, tasks: [] })),
    ])
      .then(([recent, runs, plate]) => {
        if (cancelled) return;
        const changes = recent.activity.flatMap((d) => d.files);
        setDays(buildDays(changes, runs.flat(), plate.tasks, from, to));
      })
      .catch((e: Error) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
    };
  }, [span, from, to]);

  // Land on today rather than at the top: the past half is context, the point
  // of arrival is now. useLayoutEffect so it happens before paint and the user
  // never sees the list jump.
  useLayoutEffect(() => {
    if (days) anchor.current?.scrollIntoView({ block: "center" });
  }, [days]);

  if (error) {
    return (
      <div className="tree-state" role="alert">
        <p className="tree-state-title">Couldn't build the timeline</p>
        <p>{error}</p>
      </div>
    );
  }
  if (!days) return <div className="tree-state" role="status">Reading the last {span} days…</div>;

  const hasToday = days.some((d) => d.date === todayIso);

  return (
    <div className="tl">
      {days.length === 0 && (
        <p className="tree-state">
          Nothing in this window — no changes, no scheduled runs, nothing due.
        </p>
      )}

      {days.map((day, i) => {
        const prev = days[i - 1];
        const gap = prev ? gapBetween(prev.date, day.date) : 0;
        const isToday = day.date === todayIso;
        const isPast = day.date < todayIso;
        const changes = day.entries.filter((e) => e.kind === "change");
        const others = day.entries.filter((e) => e.kind !== "change");
        const isOpen = expanded.has(day.date);
        const shown = isOpen ? changes : changes.slice(0, FILES_PER_DAY);

        return (
          <div key={day.date}>
            {gap > 0 && (
              <p className="tl-gap">
                {gap} quiet {gap === 1 ? "day" : "days"}
              </p>
            )}
            {/* Today's rule is drawn even when today itself has no entries —
                otherwise the anchor vanishes on a quiet day, which is exactly
                the day you most need to know where you are. */}
            {!hasToday && prev && prev.date < todayIso && day.date > todayIso && (
              <div className="tl-day tl-day-today tl-day-empty" ref={anchor}>
                <p className="tl-daylabel">Today</p>
                <p className="tl-quiet">Nothing yet.</p>
              </div>
            )}
            <section
              className={`tl-day${isToday ? " tl-day-today" : ""}${isPast ? " is-past" : ""}`}
              ref={isToday ? anchor : undefined}
            >
              <p className="tl-daylabel">
                {dayLabel(day.date, todayIso)}
                <span className="tl-daycount">{day.entries.length}</span>
              </p>
              <div className="tl-entries">
                {others.map((e, j) =>
                  e.kind === "run" ? (
                    <RunRow key={`r${j}`} event={e.event} />
                  ) : (
                    <TaskRow key={`t${j}`} task={e.task} overdue={day.date < todayIso} />
                  )
                )}
                {shown.map((e) => (
                  <ChangeRow key={e.file.path} file={(e as { file: ActivityFile }).file} />
                ))}
                {changes.length > FILES_PER_DAY && (
                  <button
                    type="button"
                    className="tl-more"
                    onClick={() =>
                      setExpanded((s) => {
                        const next = new Set(s);
                        if (next.has(day.date)) next.delete(day.date);
                        else next.add(day.date);
                        return next;
                      })
                    }
                  >
                    {isOpen
                      ? "show fewer"
                      : `and ${changes.length - FILES_PER_DAY} more changed`}
                  </button>
                )}
              </div>
            </section>
          </div>
        );
      })}
    </div>
  );
}

export function TimelineWindow() {
  const [view, setView] = useState<"agenda" | "month">("agenda");
  const [span, setSpan] = useState(14);

  return (
    <div className="timeline">
      <header className="timeline-head">
        <div className="tree-sort" role="group" aria-label="View">
          <button
            type="button"
            className={`tree-sort-btn${view === "agenda" ? " is-active" : ""}`}
            aria-pressed={view === "agenda"}
            onClick={() => setView("agenda")}
          >
            Agenda
          </button>
          <button
            type="button"
            className={`tree-sort-btn${view === "month" ? " is-active" : ""}`}
            aria-pressed={view === "month"}
            onClick={() => setView("month")}
          >
            Month
          </button>
        </div>

        {view === "agenda" && (
          <div className="tree-sort" role="group" aria-label="Time span">
            {SPANS.map((s) => (
              <button
                key={s}
                type="button"
                className={`tree-sort-btn${span === s ? " is-active" : ""}`}
                aria-pressed={span === s}
                onClick={() => setSpan(s)}
                title={`${s} days either side of today`}
              >
                ±{s}d
              </button>
            ))}
          </div>
        )}
      </header>

      <div className="timeline-body">
        {view === "agenda" ? <Agenda span={span} /> : <CalendarWindow />}
      </div>
    </div>
  );
}
