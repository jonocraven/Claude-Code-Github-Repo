import { useEffect, useState } from "react";
import { fetchMemoryHealth, type MemoryStatus } from "../api";
import { useTabs } from "../store/tabs";

function clock(now: Date): string {
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${now.getFullYear()}  ${hh}:${min}`;
}

const MEMORY_TITLE: Record<MemoryStatus, string> = {
  green: "Memory: all within ceilings",
  amber: "Memory: a file is approaching its ceiling",
  red: "Memory: a file is over its ceiling",
};

export function TopBar({ onSearch }: { onSearch: () => void }) {
  const tabs = useTabs((s) => s.tabs);
  const activeLeft = useTabs((s) => s.activeLeft);
  const activeRight = useTabs((s) => s.activeRight);
  const activePane = useTabs((s) => s.activePane);
  const split = useTabs((s) => s.split);
  const toggleSplit = useTabs((s) => s.toggleSplit);
  const openApp = useTabs((s) => s.openApp);

  const [now, setNow] = useState(() => new Date());
  const [memory, setMemory] = useState<MemoryStatus>("green");

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchMemoryHealth()
        .then((h) => alive && setMemory(h.worst))
        .catch(() => undefined);
    load();
    const t = setInterval(load, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const activeId = activePane === "right" ? activeRight : activeLeft;
  const active = tabs.find((t) => t.id === activeId);

  return (
    <header className="topbar">
      <div className="topbar-title">{active ? active.title : "Heaton OS"}</div>
      <div className="topbar-right">
        <button
          type="button"
          className={`topbar-btn${split ? " is-active" : ""}`}
          onClick={toggleSplit}
          title={split ? "Close split view" : "Split view (⌘\\)"}
          aria-label={split ? "Close split view" : "Split view"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
            <path d="M12 4.5v15" />
          </svg>
        </button>
        <button type="button" className="topbar-btn" onClick={onSearch} title="Search (⌘K)" aria-label="Search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <circle cx="10.5" cy="10.5" r="6" />
            <path d="m15 15 5 5" />
          </svg>
        </button>
        <button
          type="button"
          className="topbar-btn"
          onClick={() => openApp("memory")}
          title={MEMORY_TITLE[memory]}
          aria-label={MEMORY_TITLE[memory]}
        >
          <span className={`memory-dot memory-dot-${memory}`} aria-hidden="true" />
        </button>
        <span className="topbar-clock">{clock(now)}</span>
      </div>
    </header>
  );
}
