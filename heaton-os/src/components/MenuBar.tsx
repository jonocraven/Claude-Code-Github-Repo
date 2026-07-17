import { useEffect, useState } from "react";
import { getApp } from "../apps";
import { useWindows } from "../store/windows";

function clock(now: Date): string {
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${now.getFullYear()}  ${hh}:${min}`;
}

export function MenuBar({ onSearch }: { onSearch: () => void }) {
  const focusedId = useWindows((s) => s.focusedId);
  const windows = useWindows((s) => s.windows);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const focused = windows.find((w) => w.id === focusedId && !w.minimized);
  const accentVar = focused ? getApp(focused.appId).accentVar : null;

  return (
    <header className="menubar">
      <div className="menubar-left">
        <span className="menubar-wordmark">Heaton OS</span>
        {focused && (
          <span
            className="menubar-appname"
            style={accentVar ? { color: `var(${accentVar})` } : undefined}
          >
            {focused.title}
          </span>
        )}
      </div>
      <div className="menubar-right">
        <button
          type="button"
          className="menubar-item"
          title="Memory Monitor arrives in Phase 4"
          aria-label="Memory health (arrives in Phase 4)"
        >
          <span className="memory-dot" aria-hidden="true" />
        </button>
        <button
          type="button"
          className="menubar-item"
          title="Search (⌘K)"
          aria-label="Search (⌘K)"
          onClick={onSearch}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="square"
            aria-hidden="true"
          >
            <circle cx="10.5" cy="10.5" r="6" />
            <path d="m15 15 5 5" />
          </svg>
        </button>
        <span className="menubar-clock">{clock(now)}</span>
      </div>
    </header>
  );
}
