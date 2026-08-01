import { useEffect, useState } from "react";
import { fetchMemoryHealth, type MemoryStatus } from "../api";
import { useTabs } from "../store/tabs";
import { useTheme, type ThemePreference } from "../store/theme";

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

const THEME_TITLE: Record<ThemePreference, string> = {
  light: "Theme: light (click for dark)",
  dark: "Theme: dark (click for system)",
  system: "Theme: system (click for light)",
};

export function TopBar({ onSearch }: { onSearch: () => void }) {
  const tabs = useTabs((s) => s.tabs);
  const activeLeft = useTabs((s) => s.activeLeft);
  const activeRight = useTabs((s) => s.activeRight);
  const activePane = useTabs((s) => s.activePane);
  const split = useTabs((s) => s.split);
  const toggleSplit = useTabs((s) => s.toggleSplit);
  const openApp = useTabs((s) => s.openApp);

  const themePreference = useTheme((s) => s.preference);
  const cycleTheme = useTheme((s) => s.cycle);

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
          onClick={cycleTheme}
          title={THEME_TITLE[themePreference]}
          aria-label={THEME_TITLE[themePreference]}
        >
          {themePreference === "light" && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="4.5" />
              <path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
            </svg>
          )}
          {themePreference === "dark" && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20 13.5A8.5 8.5 0 0 1 10.5 4a8.5 8.5 0 1 0 9.5 9.5Z" />
            </svg>
          )}
          {themePreference === "system" && (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="4.5" width="18" height="12" rx="1.5" />
              <path d="M8.5 20h7M12 16.5V20" />
            </svg>
          )}
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
