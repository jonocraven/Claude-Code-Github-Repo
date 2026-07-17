import { APPS } from "../apps";
import { AppIcon } from "../icons";
import { useTabs } from "../store/tabs";

// System apps that appear as nav items (Reader/Viewer/Welcome are tab-only;
// Search is the palette, handled specially).
const SYSTEM_NAV = ["files", "tasks", "calendar", "memory", "activity"];

export function Sidebar({ onSearch }: { onSearch: () => void }) {
  const tabs = useTabs((s) => s.tabs);
  const activeLeft = useTabs((s) => s.activeLeft);
  const activeRight = useTabs((s) => s.activeRight);
  const openApp = useTabs((s) => s.openApp);
  const collapsed = useTabs((s) => s.sidebarCollapsed);
  const toggleSidebar = useTabs((s) => s.toggleSidebar);

  // A nav entry is active if any open tab in either pane is that app.
  const openAppIds = new Set(
    tabs
      .filter((t) => t.id === activeLeft || t.id === activeRight)
      .map((t) => t.appId)
  );

  const spaces = APPS.filter((a) => a.kind === "space");
  const system = SYSTEM_NAV.map((id) => APPS.find((a) => a.id === id)!).filter(Boolean);

  const navItem = (app: (typeof APPS)[number]) => (
    <li key={app.id}>
      <button
        type="button"
        className={`nav-item${openAppIds.has(app.id) ? " is-active" : ""}`}
        style={{ "--nav-accent": `var(${app.accentVar})` } as React.CSSProperties}
        onClick={() => openApp(app.id)}
        title={collapsed ? app.name : undefined}
      >
        <span className="nav-icon">
          <AppIcon appId={app.id} size={22} />
        </span>
        <span className="nav-label">{app.name}</span>
      </button>
    </li>
  );

  return (
    <nav className={`sidebar${collapsed ? " is-collapsed" : ""}`} aria-label="Navigation">
      <div className="sidebar-brand">
        <span className="sidebar-wordmark">
          Heaton<span className="sidebar-wordmark-os">OS</span>
        </span>
      </div>

      <button
        type="button"
        className="nav-item nav-search"
        onClick={onSearch}
        title={collapsed ? "Search (⌘K)" : undefined}
      >
        <span className="nav-icon">
          <AppIcon appId="search" size={22} />
        </span>
        <span className="nav-label">Search</span>
        <span className="nav-kbd" aria-hidden="true">⌘K</span>
      </button>

      <p className="sidebar-heading">Spaces</p>
      <ul className="nav-list">{spaces.map(navItem)}</ul>

      <p className="sidebar-heading">System</p>
      <ul className="nav-list">{system.map(navItem)}</ul>

      <button
        type="button"
        className="sidebar-collapse"
        onClick={toggleSidebar}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand" : "Collapse"}
      >
        {collapsed ? "»" : "«"}
      </button>
    </nav>
  );
}
