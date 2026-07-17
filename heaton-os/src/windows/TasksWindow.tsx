import { useEffect, useState } from "react";
import { fetchPlate, fetchSpaceTasks, type TasksResult } from "../api";
import { TaskList } from "../components/TaskList";

// My Plate first, then a tab per space that has a Todoist section (brief §4.4).
const TABS: { id: string; label: string }[] = [
  { id: "plate", label: "🍽 My Plate" },
  { id: "job-search", label: "Job Search" },
  { id: "side-hustle", label: "Side Hustle" },
  { id: "home", label: "Home" },
  { id: "house-move", label: "House Move" },
  { id: "finances", label: "Finances" },
  { id: "wfdinner", label: "WFDinner" },
];

function SetupCard() {
  return (
    <div className="tree-state">
      <p className="tree-state-title">Connect Todoist</p>
      <p>
        Paste your Todoist API token into <code>.env</code> as{" "}
        <code>TODOIST_API_TOKEN</code>, then restart <code>npm run os</code>.
        The token stays server-side — it never reaches this page.
      </p>
      <p className="tree-meta">
        Find it in Todoist → Settings → Integrations → Developer.
      </p>
    </div>
  );
}

export function TasksWindow() {
  const [tab, setTab] = useState("plate");
  const [data, setData] = useState<TasksResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    const load = tab === "plate" ? fetchPlate() : fetchSpaceTasks(tab);
    load
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [tab]);

  return (
    <div className="tasksapp">
      <nav className="tabs" role="tablist" aria-label="Task views">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`tab${tab === t.id ? " is-active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="tasksapp-body">
        {error && (
          <div className="tree-state" role="alert">
            <p className="tree-state-title">Couldn't reach Todoist</p>
            <p>{error}</p>
          </div>
        )}
        {!error && data && !data.configured && <SetupCard />}
        {!error && data && data.configured && (
          <>
            {data.source === "fixture" && (
              <p className="tasksapp-note">
                Showing sample tasks — add your token for live data.
              </p>
            )}
            <TaskList
              tasks={data.tasks}
              emptyLabel={
                tab === "plate"
                  ? "Your plate is clear. Nice."
                  : "No tasks in this section."
              }
            />
          </>
        )}
        {!error && !data && <p className="tree-state">Loading tasks…</p>}
      </div>
    </div>
  );
}
