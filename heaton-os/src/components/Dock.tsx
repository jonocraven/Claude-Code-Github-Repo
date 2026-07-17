import { APPS } from "../apps";
import { AppIcon } from "../icons";
import { useWindows } from "../store/windows";

export function Dock() {
  const windows = useWindows((s) => s.windows);
  const openApp = useWindows((s) => s.openApp);

  const running = new Set(windows.map((w) => w.appId));
  const spaces = APPS.filter((a) => a.kind === "space");
  const system = APPS.filter((a) => a.kind === "system");

  const item = (app: (typeof APPS)[number]) => (
    <button
      key={app.id}
      type="button"
      className="dock-item"
      style={{ color: `var(${app.accentVar})` }}
      onClick={() => openApp(app.id)}
      aria-label={`Open ${app.name}`}
    >
      <span className="dock-icon">
        <AppIcon appId={app.id} />
      </span>
      <span className="dock-label" role="presentation">
        {app.name}
      </span>
      <span
        className={`dock-running${running.has(app.id) ? " is-running" : ""}`}
        aria-hidden="true"
      />
    </button>
  );

  return (
    <nav className="dock" aria-label="Dock">
      <div className="dock-shelf">
        {spaces.map(item)}
        <span className="dock-divider" aria-hidden="true" />
        {system.map(item)}
      </div>
    </nav>
  );
}
