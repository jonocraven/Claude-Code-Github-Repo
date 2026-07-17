import { useEffect, useRef, useState } from "react";
import { completeTask, formatDate, type Task } from "../api";

const OWNER_LABEL: Record<Task["owner"], string> = {
  jono: "@jono",
  claude: "@claude",
  waiting: "@waiting",
};

const UNDO_MS = 5000;

function dueTone(due: string | null): string {
  if (!due) return "";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(due);
  if (d < today) return " is-overdue";
  const soon = new Date(today);
  soon.setDate(soon.getDate() + 2);
  if (d <= soon) return " is-soon";
  return "";
}

/**
 * A list of Todoist tasks with tick-to-complete and a genuine undo
 * (brief §4.4). Completion is optimistic and deferred: the row hides at
 * once, a toast offers Undo, and the API call only fires after the undo
 * window closes — so Undo simply cancels the pending call, no reopen needed.
 */
export function TaskList({
  tasks,
  emptyLabel = "Nothing here.",
}: {
  tasks: Task[];
  emptyLabel?: string;
}) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<Task | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const complete = (task: Task) => {
    setHidden((h) => new Set(h).add(task.id));
    setToast(task);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), UNDO_MS);

    const timer = setTimeout(() => {
      void completeTask(task.id);
      timers.current.delete(task.id);
    }, UNDO_MS);
    timers.current.set(task.id, timer);
  };

  const undo = (id: string) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setHidden((h) => {
      const next = new Set(h);
      next.delete(id);
      return next;
    });
    setToast(null);
  };

  const visible = tasks.filter((t) => !hidden.has(t.id));

  return (
    <div className="tasklist">
      {visible.length === 0 ? (
        <p className="tasklist-empty">{emptyLabel}</p>
      ) : (
        <ul className="tasklist-items">
          {visible.map((task) => (
            <li key={task.id} className="task">
              <button
                type="button"
                className="task-check"
                aria-label={`Complete: ${task.content}`}
                onClick={() => complete(task)}
              />
              <div className="task-main">
                <p className="task-content">{task.content}</p>
                {task.description && (
                  <p className="task-desc">{task.description}</p>
                )}
                <div className="task-meta">
                  <span className={`task-pri task-pri-${task.priority}`}>
                    {task.priority.toUpperCase()}
                  </span>
                  <span className={`task-owner task-owner-${task.owner}`}>
                    {OWNER_LABEL[task.owner]}
                  </span>
                  {task.sectionName && (
                    <span className="task-section">{task.sectionName}</span>
                  )}
                  {task.due && (
                    <span className={`task-due${dueTone(task.due)}`}>
                      {formatDate(task.due)}
                    </span>
                  )}
                  <a
                    className="task-link"
                    href={task.url}
                    target="_blank"
                    rel="noreferrer"
                    title="Open in Todoist"
                  >
                    ↗
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {toast && (
        <div className="toast" role="status">
          <span>Completed “{toast.content.slice(0, 40)}”</span>
          <button type="button" className="toast-undo" onClick={() => undo(toast.id)}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
