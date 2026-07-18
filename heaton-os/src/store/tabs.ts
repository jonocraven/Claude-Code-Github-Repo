import { create } from "zustand";
import { getApp } from "../apps";

/**
 * Tab + pane model for the dashboard shell. Open apps and documents are tabs,
 * not floating windows. There are one or two panes (left, and an optional
 * right for side-by-side reading). Each tab lives in one pane; the active pane
 * receives new opens. State persists to localStorage so a reload restores the
 * workspace. openFile/reveal keep their old signatures so content components
 * are unchanged.
 */

export type Pane = "left" | "right";

export interface TabPayload {
  path?: string;
  kind?: string;
}

export interface Tab {
  id: string;
  appId: string;
  instanceKey: string;
  title: string;
  pane: Pane;
  payload: TabPayload;
}

interface OpenOpts {
  appId: string;
  instanceKey?: string;
  title?: string;
  payload?: TabPayload;
  pane?: Pane;
}

interface TabState {
  tabs: Tab[];
  activeLeft: string | null;
  activeRight: string | null;
  split: boolean;
  activePane: Pane;
  revealPath: string | null;
  sidebarCollapsed: boolean;

  openTab: (opts: OpenOpts) => void;
  openApp: (appId: string) => void;
  reveal: (path: string) => void;
  closeTab: (id: string) => void;
  activate: (id: string) => void;
  setActivePane: (pane: Pane) => void;
  sendToRight: (id: string) => void;
  closeSplit: () => void;
  toggleSplit: () => void;
  setTitle: (id: string, title: string) => void;
  cycle: () => void;
  toggleSidebar: () => void;
}

const STORE_KEY = "heaton-os.tabs.v1";

interface Persisted {
  tabs: Tab[];
  activeLeft: string | null;
  activeRight: string | null;
  split: boolean;
  sidebarCollapsed: boolean;
}

function load(): Partial<TabState> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Persisted;
    if (!Array.isArray(p.tabs)) return {};
    return {
      tabs: p.tabs,
      activeLeft: p.activeLeft ?? null,
      activeRight: p.split ? (p.activeRight ?? null) : null,
      split: !!p.split,
      sidebarCollapsed: !!p.sidebarCollapsed,
    };
  } catch {
    return {};
  }
}

function persist(s: TabState): void {
  try {
    const data: Persisted = {
      tabs: s.tabs,
      activeLeft: s.activeLeft,
      activeRight: s.activeRight,
      split: s.split,
      sidebarCollapsed: s.sidebarCollapsed,
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable — session just won't restore */
  }
}

let uid = 0;

function firstIn(tabs: Tab[], pane: Pane): string | null {
  return tabs.find((t) => t.pane === pane)?.id ?? null;
}

// Restored tabs keep their old "tab-N" ids; the in-memory counter must resume
// past the highest of them, or a freshly opened tab can collide with one
// restored from localStorage (same id used by two different tabs at once).
function nextUidAfter(tabs: Tab[]): number {
  let max = -1;
  for (const t of tabs) {
    const n = Number(t.id.match(/^tab-(\d+)$/)?.[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

export const useTabs = create<TabState>((set, get) => {
  const persisted = load();
  uid = nextUidAfter(persisted.tabs ?? []);

  // A helper that commits state and mirrors it to localStorage.
  const commit = (partial: Partial<TabState>) => {
    set(partial);
    persist(get());
  };

  return {
    tabs: persisted.tabs ?? [],
    activeLeft: persisted.activeLeft ?? null,
    activeRight: persisted.activeRight ?? null,
    split: persisted.split ?? false,
    activePane: "left",
    revealPath: null,
    sidebarCollapsed: persisted.sidebarCollapsed ?? false,

    openTab: ({ appId, instanceKey = "", title, payload = {}, pane }) => {
      if (appId === "search") return; // search is the palette, never a tab
      const { tabs, activePane, split } = get();

      const existing = tabs.find(
        (t) => t.appId === appId && t.instanceKey === instanceKey
      );
      if (existing) {
        get().activate(existing.id);
        return;
      }

      const target: Pane = pane ?? (activePane === "right" && split ? "right" : "left");
      const id = `tab-${uid++}`;
      const tab: Tab = {
        id,
        appId,
        instanceKey,
        title: title ?? getApp(appId).name,
        pane: target,
        payload,
      };
      commit({
        tabs: [...tabs, tab],
        ...(target === "left"
          ? { activeLeft: id, activePane: "left" as Pane }
          : { activeRight: id, activePane: "right" as Pane }),
      });
    },

    openApp: (appId) => get().openTab({ appId }),

    reveal: (path) => {
      const clean = path.replace(/\/$/, "");
      get().openTab({ appId: "files" });
      set({ revealPath: clean });
    },

    activate: (id) => {
      const { tabs } = get();
      const tab = tabs.find((t) => t.id === id);
      if (!tab) return;
      commit(
        tab.pane === "left"
          ? { activeLeft: id, activePane: "left" }
          : { activeRight: id, activePane: "right" }
      );
    },

    setActivePane: (pane) => {
      if (pane === "right" && !get().split) return;
      set({ activePane: pane });
    },

    closeTab: (id) => {
      const { tabs } = get();
      const tab = tabs.find((t) => t.id === id);
      if (!tab) return;
      const remaining = tabs.filter((t) => t.id !== id);
      const next: Partial<TabState> = { tabs: remaining };

      if (tab.pane === "left" && get().activeLeft === id) {
        next.activeLeft = firstIn(remaining, "left");
      }
      if (tab.pane === "right" && get().activeRight === id) {
        next.activeRight = firstIn(remaining, "right");
      }
      // Collapse the split if the right pane emptied.
      const rightLeft = remaining.some((t) => t.pane === "right");
      if (get().split && !rightLeft) {
        next.split = false;
        next.activeRight = null;
        next.activePane = "left";
      }
      // If the left emptied but the right has tabs, pull them back left.
      const leftLeft = remaining.some((t) => t.pane === "left");
      if (!leftLeft && rightLeft) {
        const pulled = remaining.map((t) => ({ ...t, pane: "left" as Pane }));
        next.tabs = pulled;
        next.split = false;
        next.activePane = "left";
        next.activeLeft = firstIn(pulled, "left");
        next.activeRight = null;
      }
      commit(next);
    },

    sendToRight: (id) => {
      const { tabs } = get();
      const leftCount = tabs.filter((t) => t.pane === "left").length;
      const tab = tabs.find((t) => t.id === id);
      if (!tab) return;
      // Need at least one tab to remain on the left.
      if (tab.pane === "left" && leftCount < 2) return;
      const moved = tabs.map((t) => (t.id === id ? { ...t, pane: "right" as Pane } : t));
      const next: Partial<TabState> = {
        tabs: moved,
        split: true,
        activeRight: id,
        activePane: "right",
      };
      if (get().activeLeft === id) next.activeLeft = firstIn(moved, "left");
      commit(next);
    },

    closeSplit: () => {
      const { tabs } = get();
      const merged = tabs.map((t) => ({ ...t, pane: "left" as Pane }));
      commit({
        tabs: merged,
        split: false,
        activeRight: null,
        activePane: "left",
      });
    },

    toggleSplit: () => {
      const { split, activeLeft } = get();
      if (split) {
        get().closeSplit();
      } else if (activeLeft) {
        get().sendToRight(activeLeft);
      }
    },

    setTitle: (id, title) => {
      commit({ tabs: get().tabs.map((t) => (t.id === id ? { ...t, title } : t)) });
    },

    cycle: () => {
      const { tabs, activePane } = get();
      const paneTabs = tabs.filter((t) => t.pane === activePane);
      if (paneTabs.length < 2) return;
      const activeId = activePane === "left" ? get().activeLeft : get().activeRight;
      const idx = paneTabs.findIndex((t) => t.id === activeId);
      const nextTab = paneTabs[(idx + 1) % paneTabs.length]!;
      get().activate(nextTab.id);
    },

    toggleSidebar: () => {
      commit({ sidebarCollapsed: !get().sidebarCollapsed });
    },
  };
});

/** Route a workspace file to the right tab type (markdown → Reader, else viewer). */
export function openFile(path: string): void {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const name = path.split("/").pop() ?? path;
  const open = useTabs.getState().openTab;
  if (ext === "md") {
    open({ appId: "reader", instanceKey: path, title: name, payload: { path } });
    return;
  }
  const kind =
    ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext) ? "image"
    : ext === "pdf" ? "pdf"
    : ext === "html" || ext === "htm" ? "html"
    : ext === "csv" ? "csv"
    : ["txt", "sh"].includes(ext) ? "text"
    : "other";
  open({ appId: "viewer", instanceKey: path, title: name, payload: { path, kind } });
}
