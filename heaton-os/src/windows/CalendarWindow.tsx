import { useEffect, useMemo, useState } from "react";
import { fetchScheduled, type ScheduledEvent } from "../api";
import { useWindows } from "../store/windows";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Cadence → accent, so runs read at a glance and stay on the space palette.
const CADENCE_ACCENT: Record<string, string> = {
  "memory-tidy": "--accent-life-plan",
  "strategic-review": "--accent-job-search",
  "job-search-refresh": "--accent-job-search",
  "finance-refresh": "--accent-finances",
  "hygiene-check": "--accent-side-hustle",
  "monday-pulse": "--accent-home",
};

export function CalendarWindow() {
  const reveal = useWindows((s) => s.reveal);
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-based
  const [events, setEvents] = useState<ScheduledEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchScheduled(year, month)
      .then((d) => !cancelled && setEvents(d.events))
      .catch(() => !cancelled && setEvents([]));
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const byDay = useMemo(() => {
    const map = new Map<number, ScheduledEvent[]>();
    for (const e of events) {
      const day = Number(e.date.slice(8, 10));
      const list = map.get(day) ?? [];
      list.push(e);
      map.set(day, list);
    }
    return map;
  }, [events]);

  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const step = (delta: number) => {
    const m = month + delta;
    if (m < 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else if (m > 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth(m);
    }
  };

  const isToday = (day: number) =>
    year === today.getFullYear() &&
    month === today.getMonth() + 1 &&
    day === today.getDate();

  return (
    <div className="calendar">
      <header className="calendar-head">
        <button type="button" className="calendar-nav" onClick={() => step(-1)} aria-label="Previous month">
          ‹
        </button>
        <h3 className="calendar-title">
          {MONTHS[month - 1]} {year}
        </h3>
        <button type="button" className="calendar-nav" onClick={() => step(1)} aria-label="Next month">
          ›
        </button>
      </header>

      <div className="calendar-grid calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((d) => (
          <div key={d} className="calendar-weekday">
            {d}
          </div>
        ))}
      </div>

      <div className="calendar-grid">
        {cells.map((day, i) => (
          <div
            key={i}
            className={`calendar-cell${day === null ? " is-empty" : ""}${
              day && isToday(day) ? " is-today" : ""
            }`}
          >
            {day !== null && (
              <>
                <span className="calendar-daynum">{day}</span>
                <div className="calendar-runs">
                  {(byDay.get(day) ?? []).map((e, j) => {
                    const accent = CADENCE_ACCENT[e.cadence] ?? "--accent-system";
                    const run = (
                      <span
                        className="calendar-run"
                        style={{ "--run-accent": `var(${accent})` } as React.CSSProperties}
                        title={`${e.title} · ${e.time}`}
                      >
                        {e.title}
                      </span>
                    );
                    return e.folder ? (
                      <button
                        key={j}
                        type="button"
                        className="calendar-run-btn"
                        onClick={() => reveal(e.folder!)}
                        title={`${e.title} · ${e.time} — open folder`}
                      >
                        {run}
                      </button>
                    ) : (
                      <span key={j}>{run}</span>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <p className="calendar-foot">
        Recurring runs from the workspace cadences. Click a run with a folder
        to open it in Files.
      </p>
    </div>
  );
}
