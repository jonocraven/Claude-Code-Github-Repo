import { useEffect, useState } from "react";
import type { TreeDir } from "../api";
import { AppIcon } from "../icons";
import { SPACE_CONFIG } from "../spaces";
import { useTabs, type Pane, type Tab } from "../store/tabs";
import { ActivityWindow } from "../windows/ActivityWindow";
import { CalendarWindow } from "../windows/CalendarWindow";
import { FilesWindow } from "../windows/FilesWindow";
import { MemoryWindow } from "../windows/MemoryWindow";
import { ReaderWindow } from "../windows/ReaderWindow";
import { SpaceWindow } from "../windows/SpaceWindow";
import { TasksWindow } from "../windows/TasksWindow";
import { TodayWindow } from "../windows/TodayWindow";
import { ViewerWindow } from "../windows/ViewerWindow";
import { WelcomeWindow } from "../windows/WelcomeWindow";

function renderTab(tab: Tab, tree: TreeDir | null, error: string | null) {
  switch (tab.appId) {
    case "today":
      return <TodayWindow />;
    case "welcome":
      return <WelcomeWindow />;
    case "files":
      return <FilesWindow tree={tree} error={error} />;
    case "reader":
      return <ReaderWindow windowId={tab.id} path={tab.payload.path} />;
    case "viewer":
      return <ViewerWindow path={tab.payload.path} kind={tab.payload.kind} />;
    case "tasks":
      return <TasksWindow />;
    case "calendar":
      return <CalendarWindow />;
    case "memory":
      return <MemoryWindow />;
    case "activity":
      return <ActivityWindow />;
    default:
      if (SPACE_CONFIG[tab.appId]) return <SpaceWindow spaceId={tab.appId} tree={tree} />;
      return <div className="tree-state">Unknown view.</div>;
  }
}

function PaneView({
  pane,
  tree,
  error,
}: {
  pane: Pane;
  tree: TreeDir | null;
  error: string | null;
}) {
  const tabs = useTabs((s) => s.tabs);
  const activeLeft = useTabs((s) => s.activeLeft);
  const activeRight = useTabs((s) => s.activeRight);
  const activePane = useTabs((s) => s.activePane);
  const activate = useTabs((s) => s.activate);
  const closeTab = useTabs((s) => s.closeTab);
  const closeOthers = useTabs((s) => s.closeOthers);
  const pinTab = useTabs((s) => s.pinTab);
  const sendToRight = useTabs((s) => s.sendToRight);
  const setActivePane = useTabs((s) => s.setActivePane);
  const split = useTabs((s) => s.split);
  const [menuOpen, setMenuOpen] = useState(false);

  const paneTabs = tabs.filter((t) => t.pane === pane);
  const activeId = pane === "left" ? activeLeft : activeRight;
  const active = paneTabs.find((t) => t.id === activeId) ?? null;
  const canSend = pane === "left" && paneTabs.length >= 2;

  // Close the overflow list on any outside click or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <section
      className={`pane${split && activePane === pane ? " is-active-pane" : ""}`}
      onMouseDownCapture={() => setActivePane(pane)}
      aria-label={pane === "left" ? "Primary pane" : "Secondary pane"}
    >
      <div className="tabstrip-row">
        <div className="tabstrip" role="tablist">
          {paneTabs.map((tab) => (
            <div
              key={tab.id}
              className={`doctab${tab.id === activeId ? " is-active" : ""}${
                tab.transient ? " is-transient" : ""
              }`}
              role="tab"
              aria-selected={tab.id === activeId}
              // Middle-click closes, the usual browser/editor convention.
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  closeTab(tab.id);
                }
              }}
            >
              <button
                type="button"
                className="doctab-open"
                onClick={() => activate(tab.id)}
                onDoubleClick={() => pinTab(tab.id)}
                title={tab.transient ? `${tab.title} — preview, double-click to keep` : tab.title}
              >
                <span className="doctab-icon">
                  <AppIcon appId={tab.appId} size={15} />
                </span>
                <span className="doctab-title">{tab.title}</span>
              </button>
              {tab.transient && (
                <button
                  type="button"
                  className="doctab-pin"
                  title="Keep this tab open"
                  aria-label={`Keep ${tab.title} open`}
                  onClick={() => pinTab(tab.id)}
                >
                  ⌾
                </button>
              )}
              {canSend && (
                <button
                  type="button"
                  className="doctab-split"
                  title="Open in split view"
                  aria-label={`Open ${tab.title} in split view`}
                  onClick={() => sendToRight(tab.id)}
                >
                  ◨
                </button>
              )}
              <button
                type="button"
                className="doctab-close"
                title="Close tab"
                aria-label={`Close ${tab.title}`}
                onClick={() => closeTab(tab.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {paneTabs.length > 1 && (
          <div className="tabmenu">
            <button
              type="button"
              className="tabmenu-btn"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              title={`All ${paneTabs.length} tabs in this pane`}
              aria-label={`All ${paneTabs.length} tabs in this pane`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setMenuOpen((o) => !o)}
            >
              {paneTabs.length} ⌄
            </button>
            {menuOpen && (
              <div
                className="tabmenu-list"
                role="menu"
                onPointerDown={(e) => e.stopPropagation()}
              >
                {paneTabs.map((tab) => (
                  <div key={tab.id} className="tabmenu-row">
                    <button
                      type="button"
                      role="menuitem"
                      className={`tabmenu-open${tab.id === activeId ? " is-active" : ""}`}
                      onClick={() => {
                        activate(tab.id);
                        setMenuOpen(false);
                      }}
                    >
                      <AppIcon appId={tab.appId} size={15} />
                      <span className="tabmenu-title">{tab.title}</span>
                      {tab.transient && <span className="tabmenu-tag">preview</span>}
                    </button>
                    <button
                      type="button"
                      className="tabmenu-close"
                      title={`Close ${tab.title}`}
                      aria-label={`Close ${tab.title}`}
                      onClick={() => closeTab(tab.id)}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  role="menuitem"
                  className="tabmenu-action"
                  disabled={!activeId}
                  onClick={() => {
                    if (activeId) closeOthers(activeId);
                    setMenuOpen(false);
                  }}
                >
                  Close others
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="pane-body">
        {active ? (
          renderTab(active, tree, error)
        ) : (
          <div className="tree-state">
            <p className="tree-state-title">Nothing open here</p>
            <p>Pick a space or a file from the left, or press ⌘K to search.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function ContentArea({
  tree,
  error,
}: {
  tree: TreeDir | null;
  error: string | null;
}) {
  const split = useTabs((s) => s.split);
  return (
    <div className={`content${split ? " is-split" : ""}`}>
      <PaneView pane="left" tree={tree} error={error} />
      {split && <PaneView pane="right" tree={tree} error={error} />}
    </div>
  );
}
