import { useEffect, useState } from "react";
import { fetchRecent, type ActivityDay } from "../api";
import { openFile } from "../store/windows";

// Space id per area name, to tint the badge on the space palette.
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

const RANGES = [7, 14, 30];

function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function ActivityWindow() {
  const [days, setDays] = useState(14);
  const [activity, setActivity] = useState<ActivityDay[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setActivity(null);
    fetchRecent(days)
      .then((d) => !cancelled && setActivity(d.activity))
      .catch(() => !cancelled && setActivity([]));
    return () => {
      cancelled = true;
    };
  }, [days]);

  return (
    <div className="activity">
      <header className="activity-head">
        <h3 className="activity-title">What's been happening</h3>
        <div className="tree-sort" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              className={`tree-sort-btn${days === r ? " is-active" : ""}`}
              aria-pressed={days === r}
              onClick={() => setDays(r)}
            >
              {r}d
            </button>
          ))}
        </div>
      </header>

      {!activity && <p className="tree-state">Reading recent changes…</p>}
      {activity && activity.length === 0 && (
        <p className="tree-state">No changes in the last {days} days.</p>
      )}

      <div className="activity-timeline">
        {activity?.map((day) => (
          <section key={day.date} className="activity-day">
            <h4 className="activity-daylabel">
              {dayLabel(day.date)}
              <span className="activity-daycount">{day.files.length}</span>
            </h4>
            <ul className="activity-rows">
              {day.files.map((f) => {
                const accent = AREA_ACCENT[f.area] ?? "--accent-system";
                return (
                  <li key={f.path}>
                    <button
                      type="button"
                      className="activity-row"
                      onClick={() => openFile(f.path)}
                    >
                      <span
                        className="activity-badge"
                        style={{ "--badge-accent": `var(${accent})` } as React.CSSProperties}
                      >
                        {f.area}
                      </span>
                      <span className="activity-name">{f.name}</span>
                      <span className="activity-time">
                        {new Date(f.modified).toLocaleTimeString("en-GB", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
