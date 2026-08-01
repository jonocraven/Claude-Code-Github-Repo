import { create } from "zustand";
import { getApp } from "../apps";
import { record as recordRecent } from "./recent";

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
  /** Search tabs only — persisted so a reload restores the result set. */
  query?: string;
  space?: string | null;
}

export interface Tab {
  id: string;
  appId: string;
  instanceKey: string;
  title: string;
  pane: Pane;
  payload: TabPayload;
  /**
   * A transient tab is a preview: at most one per pane, and the next preview
   * replaces it. Browsing spaces therefore costs one tab, not eight. Pin it
   * (double-click, the pin control, or by starting an edit) to keep it.
   */
  transient: boolean;
}

interface OpenOpts {
  appId: string;
  instanceKey?: string;
  title?: string;
  payload?: TabPayload;
  pane?: Pane;
  /** Default true — opens as a preview. Pass false to open a kept tab. */
  transient?: boolean;
}

interface TabState {
  tabs: Tab[];
  activeLeft: string | null;
  activeRight: string | null;
  split: boolean;
  activePane: Pane;
  revealPath: string | null;
  sidebarCollapsed: boolean;

  /** Returns the id of the tab now active for these opts (existing or new) —
   *  openFile needs it to key the search-open "don't restore" flag below. */
  openTab: (opts: OpenOpts) => string;
  openApp: (appId: string) => void;
  reveal: (path: string) => void;
  closeTab: (id: string) => void;
  closeOthers: (id: string) => void;
  pinTab: (id: string) => void;
  activate: (id: string) => void;
  setActivePane: (pane: Pane) => void;
  sendToRight: (id: string) => void;
  closeSplit: () => void;
  toggleSplit: () => void;
  setTitle: (id: string, title: string) => void;
  cycle: () => void;
  toggleSidebar: () => void;
  /** Point an existing tab at a different document, in place (brief 03 §4:
   *  next/prev reuses the tab id rather than opening a new one). */
  retarget: (id: string, opts: { instanceKey: string; title: string; payload: TabPayload }) => void;
}

const STORE_KEY = "heaton-os.tabs.v1";

interface Persisted {
  tabs: Tab[];
  activeLeft: string | null;
  activeRight: string | null;
  split: boolean;
  sidebarCollapsed: boolean;
}

/**
 * Activity and Calendar merged into Timeline. A saved layout still carries the
 * old ids, and while ContentArea resolves both, a restored tab would otherwise
 * keep its stale title for ever — the rail says Timeline and the tab says
 * Activity. Rewriting them on load also collapses the pair, since a workspace
 * with both open would otherwise restore two identical Timelines.
 */
const RETIRED_APPS: Record<string, string> = { activity: "timeline", calendar: "timeline" };

function migrate(tabs: Tab[]): Tab[] {
  const seen = new Set<string>();
  const out: Tab[] = [];
  for (const t of tabs) {
    const appId = RETIRED_APPS[t.appId] ?? t.appId;
    const title = appId === t.appId ? t.title : "Timeline";
    const key = `${appId}:${t.instanceKey}:${t.pane}`;
    if (appId !== t.appId && seen.has(key)) continue;
    seen.add(key);
    out.push({ ...t, appId, title });
  }
  return out;
}

function load(): Partial<TabState> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Persisted;
    if (!Array.isArray(p.tabs)) return {};
    return {
      // Sessions saved before previews existed have no `transient` field.
      // Treat those tabs as kept — restoring a workspace must never drop one.
      tabs: migrate(p.tabs.map((t) => ({ ...t, transient: t.transient ?? false }))),
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

    openTab: ({ appId, instanceKey = "", title, payload = {}, pane, transient = true }) => {
      const { tabs, activePane, split } = get();

      const existing = tabs.find(
        (t) => t.appId === appId && t.instanceKey === instanceKey
      );
      if (existing) {
        // Re-opening a kept tab must never demote it back to a preview.
        if (!transient && existing.transient) get().pinTab(existing.id);
        get().activate(existing.id);
        return existing.id;
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
        transient,
      };
      // A new preview takes the place of the pane's outgoing preview.
      const next = transient
        ? tabs.filter((t) => !(t.pane === target && t.transient))
        : tabs;
      commit({
        tabs: [...next, tab],
        ...(target === "left"
          ? { activeLeft: id, activePane: "left" as Pane }
          : { activeRight: id, activePane: "right" as Pane }),
      });
      return id;
    },

    /**
     * Launching an app from the rail.
     *
     * System surfaces (Today, Timeline, Search, Files, Tasks, Memory) open
     * *kept*. You reach for one of those in order to work from it, and a
     * surface you destroy by clicking its own first result is not one you can
     * work from — the Timeline in particular exists to be clicked through.
     *
     * Spaces stay previews. That is the case previews were introduced for:
     * browsing eight spaces should cost one tab, not eight.
     *
     * Search additionally carries a query, so it routes through openSearch,
     * which reuses and re-aims rather than opening a blank second one.
     */
    openApp: (appId) => {
      if (appId === "search") {
        openSearch();
        return;
      }
      get().openTab({ appId, transient: getApp(appId).kind !== "system" });
    },

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

    pinTab: (id) => {
      const { tabs } = get();
      if (!tabs.some((t) => t.id === id && t.transient)) return;
      commit({
        tabs: tabs.map((t) => (t.id === id ? { ...t, transient: false } : t)),
      });
    },

    /** Close every other tab in the same pane; the survivor is kept, not preview. */
    closeOthers: (id) => {
      const { tabs } = get();
      const tab = tabs.find((t) => t.id === id);
      if (!tab) return;
      const remaining = tabs.filter(
        (t) => t.pane !== tab.pane || t.id === id
      );
      const next: Partial<TabState> = {
        tabs: remaining.map((t) =>
          t.id === id ? { ...t, transient: false } : t
        ),
      };
      if (tab.pane === "left") next.activeLeft = id;
      else next.activeRight = id;
      commit(next);
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
      // Setting up a side-by-side comparison is a deliberate keep, so the
      // moved tab is pinned — a later preview must not evict it.
      const moved = tabs.map((t) =>
        t.id === id ? { ...t, pane: "right" as Pane, transient: false } : t
      );
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

    retarget: (id, { instanceKey, title, payload }) => {
      commit({
        tabs: get().tabs.map((t) =>
          t.id === id ? { ...t, instanceKey, title, payload } : t
        ),
      });
    },
  };
});

// Tab ids opened with `restore: false` (a search hit) — consumed once by the
// Reader so a fresh document identity there knows to land at the top instead
// of restoring a remembered scroll position (brief 03 §3). Keyed on tab id,
// not path, so it can never bleed across panes or across a later plain open.
const skipRestoreTabs = new Set<string>();

/** Consume (and clear) the skip-restore flag for a tab, if one was set. */
export function consumeSkipRestore(tabId: string): boolean {
  const had = skipRestoreTabs.has(tabId);
  skipRestoreTabs.delete(tabId);
  return had;
}

/**
 * Open (or reuse) the Search window, optionally carrying a query in.
 *
 * There is deliberately one Search tab per pane rather than one per query.
 * The window is a place you go back to and re-aim, so a second tab for every
 * phrase you tried would be tab litter, not history — and the tab title
 * tracking the query already tells you which search it is holding.
 *
 * It opens *kept*, never as a preview: a search you can lose by clicking its
 * own first result is not a surface you can work from.
 */
export function openSearch(query = "", space: string | null = null): void {
  const title = query.trim() ? `Search: ${query.trim()}` : "Search";
  const open = useTabs.getState().openTab;
  const existing = useTabs
    .getState()
    .tabs.find((t) => t.appId === "search");
  if (existing) {
    // Re-aim the tab that exists rather than stacking another one beside it —
    // but only when a query was actually supplied. Reaching for Search in the
    // dock means "show me that again", not "throw away what I had typed".
    if (query.trim()) {
      useTabs.getState().retarget(existing.id, {
        instanceKey: "",
        title,
        payload: { query, space },
      });
    }
    useTabs.getState().activate(existing.id);
    return;
  }
  open({ appId: "search", title, payload: { query, space }, transient: false });
}

/** Route a workspace file to the right tab type (markdown → Reader, else viewer). */
export function openFile(path: string, opts?: { restore?: boolean }): void {
  const restore = opts?.restore ?? true;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const name = path.split("/").pop() ?? path;
  const open = useTabs.getState().openTab;
  // Every file open funnels through here, so this is the one place the trail
  // needs recording — never from the individual callers.
  recordRecent(path, name);
  if (ext === "md") {
    const wasOpen = useTabs
      .getState()
      .tabs.some((t) => t.appId === "reader" && t.instanceKey === path);
    const id = open({ appId: "reader", instanceKey: path, title: name, payload: { path } });
    if (!restore && !wasOpen && id) skipRestoreTabs.add(id);
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
