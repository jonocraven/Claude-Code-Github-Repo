import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the apps module before any imports
// Mirrors the real registry closely enough for the store's purposes: `kind`
// decides whether a rail launch is kept or a preview, so a mock without it
// would silently exercise the wrong branch.
const SPACE_IDS = new Set(["cookery-books", "wfdinner", "home", "house-move"]);
vi.mock("../apps", () => ({
  getApp: (appId: string) => ({
    name: appId.charAt(0).toUpperCase() + appId.slice(1),
    kind: SPACE_IDS.has(appId) ? "space" : "system",
  }),
}));

describe("useTabs store", () => {
  let mem: Map<string, string>;

  beforeEach(async () => {
    mem = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
    });
    // Reset modules to get a fresh store instance for each test
    vi.resetModules();
  });

  // Preview (transient) tabs

  it("openTab defaults to transient: true", async () => {
    const { useTabs } = await import("./tabs.js");
    useTabs.getState().openTab({ appId: "reader", title: "Reader" });
    const tab = useTabs.getState().tabs[0];
    expect(tab?.transient).toBe(true);
  });

  it("opening a second preview in the same pane replaces the first", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", instanceKey: "one", title: "Reader" });
    const firstId = useTabs.getState().tabs[0]?.id;
    state.openTab({ appId: "files", title: "Files" });
    expect(useTabs.getState().tabs).toHaveLength(1);
    expect(useTabs.getState().tabs[0]?.id).not.toBe(firstId);
  });

  it("opening a preview in the right pane does not disturb a preview in the left", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", instanceKey: "left-one", title: "Reader" });
    const leftId = useTabs.getState().tabs[0]?.id;
    state.openTab({ appId: "files", pane: "right", title: "Files" });
    expect(useTabs.getState().tabs).toHaveLength(2);
    expect(useTabs.getState().tabs[0]?.id).toBe(leftId);
  });

  it("openTab with transient: false appends without evicting the pane's preview", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", title: "Reader" });
    const previewId = useTabs.getState().tabs[0]?.id;
    state.openTab({ appId: "files", transient: false, title: "Files" });
    expect(useTabs.getState().tabs).toHaveLength(2);
    expect(useTabs.getState().tabs[0]?.id).toBe(previewId);
    expect(useTabs.getState().tabs[1]?.transient).toBe(false);
  });

  // Pinning

  it("pinTab clears transient, and a subsequently-opened preview no longer evicts it", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", title: "Reader" });
    const tab = useTabs.getState().tabs[0]!;
    expect(tab.transient).toBe(true);
    state.pinTab(tab.id);
    expect(useTabs.getState().tabs[0]?.transient).toBe(false);
    state.openTab({ appId: "files", title: "Files" });
    expect(useTabs.getState().tabs).toHaveLength(2);
    expect(useTabs.getState().tabs[0]?.id).toBe(tab.id);
  });

  it("pinTab on an already-kept tab is a no-op", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", transient: false, title: "Reader" });
    const before = JSON.stringify(useTabs.getState().tabs);
    const tabId = useTabs.getState().tabs[0]!.id;
    state.pinTab(tabId);
    expect(JSON.stringify(useTabs.getState().tabs)).toBe(before);
  });

  it("re-opening the same app/instanceKey with transient: false promotes an existing preview to kept", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", instanceKey: "doc1", title: "Document" });
    const tabId = useTabs.getState().tabs[0]!.id;
    expect(useTabs.getState().tabs[0]?.transient).toBe(true);
    state.openTab({ appId: "reader", instanceKey: "doc1", transient: false, title: "Document" });
    expect(useTabs.getState().tabs).toHaveLength(1);
    expect(useTabs.getState().tabs[0]?.id).toBe(tabId);
    expect(useTabs.getState().tabs[0]?.transient).toBe(false);
  });

  it("re-opening the same app/instanceKey with transient: true does not demote a kept tab back to a preview", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", instanceKey: "doc1", transient: false, title: "Document" });
    const tabId = useTabs.getState().tabs[0]!.id;
    state.openTab({ appId: "reader", instanceKey: "doc1", transient: true, title: "Document" });
    expect(useTabs.getState().tabs).toHaveLength(1);
    expect(useTabs.getState().tabs[0]?.id).toBe(tabId);
    expect(useTabs.getState().tabs[0]?.transient).toBe(false);
  });

  // Identity

  it("openTab twice with the same appId + instanceKey yields one tab and activates the existing one", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", instanceKey: "doc1", title: "Document" });
    const tabId = useTabs.getState().tabs[0]!.id;
    state.openTab({ appId: "reader", instanceKey: "doc1", title: "Document" });
    expect(useTabs.getState().tabs).toHaveLength(1);
    expect(useTabs.getState().activeLeft).toBe(tabId);
  });

  it("treats different instanceKeys as separate documents, not one reused tab", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    // Kept, not preview: two previews in one pane correctly collapse to one,
    // so identity has to be proven with tabs that are allowed to coexist.
    state.openTab({ appId: "reader", instanceKey: "doc1", title: "Doc One", transient: false });
    state.openTab({ appId: "reader", instanceKey: "doc2", title: "Doc Two", transient: false });
    expect(useTabs.getState().tabs).toHaveLength(2);
    expect(useTabs.getState().tabs[0]?.instanceKey).toBe("doc1");
    expect(useTabs.getState().tabs[1]?.instanceKey).toBe("doc2");
  });

  it("still replaces a preview when the next document has a different instanceKey", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", instanceKey: "doc1", title: "Doc One" });
    state.openTab({ appId: "reader", instanceKey: "doc2", title: "Doc Two" });
    expect(useTabs.getState().tabs).toHaveLength(1);
    expect(useTabs.getState().tabs[0]?.instanceKey).toBe("doc2");
  });

  // Search is a surface now, not only the palette. It used to be refused a
  // tab outright; these pin the behaviour that replaced that.

  it("openSearch opens a kept tab, never a preview", async () => {
    const { useTabs, openSearch } = await import("./tabs.js");
    openSearch("mortgage");
    const tabs = useTabs.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.appId).toBe("search");
    // A search you can destroy by clicking its own first result is not a
    // surface you can work from, so it must not be transient.
    expect(tabs[0]?.transient).toBe(false);
    expect(tabs[0]?.title).toBe("Search: mortgage");
    expect(tabs[0]?.payload.query).toBe("mortgage");
  });

  it("openSearch re-aims the existing tab rather than opening a second", async () => {
    const { useTabs, openSearch } = await import("./tabs.js");
    openSearch("mortgage");
    const firstId = useTabs.getState().tabs[0]?.id;
    openSearch("solicitor", "House-Move");
    const tabs = useTabs.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.id).toBe(firstId);
    expect(tabs[0]?.payload.query).toBe("solicitor");
    expect(tabs[0]?.payload.space).toBe("House-Move");
    expect(tabs[0]?.title).toBe("Search: solicitor");
  });

  // The Activity/Calendar → Timeline merge.

  it("rewrites a tab saved under a retired app id, title and all", async () => {
    mem.set("heaton-os.tabs.v1", JSON.stringify({
      tabs: [{ id: "tab-0", appId: "activity", instanceKey: "", title: "Activity",
               pane: "left", payload: {}, transient: false }],
      activeLeft: "tab-0", activeRight: null, split: false, sidebarCollapsed: false,
    }));
    const { useTabs } = await import("./tabs.js");
    const tabs = useTabs.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.appId).toBe("timeline");
    // The rail says Timeline; a tab still saying Activity would just be a lie.
    expect(tabs[0]?.title).toBe("Timeline");
  });

  it("collapses Activity and Calendar restored side by side into one Timeline", async () => {
    mem.set("heaton-os.tabs.v1", JSON.stringify({
      tabs: [
        { id: "tab-0", appId: "activity", instanceKey: "", title: "Activity",
          pane: "left", payload: {}, transient: false },
        { id: "tab-1", appId: "calendar", instanceKey: "", title: "Calendar",
          pane: "left", payload: {}, transient: false },
      ],
      activeLeft: "tab-0", activeRight: null, split: false, sidebarCollapsed: false,
    }));
    const { useTabs } = await import("./tabs.js");
    expect(useTabs.getState().tabs).toHaveLength(1);
    expect(useTabs.getState().tabs[0]?.id).toBe("tab-0");
  });

  it("leaves tabs that were not retired completely alone", async () => {
    mem.set("heaton-os.tabs.v1", JSON.stringify({
      tabs: [
        { id: "tab-0", appId: "reader", instanceKey: "a.md", title: "A note",
          pane: "left", payload: { path: "a.md" }, transient: false },
        { id: "tab-1", appId: "reader", instanceKey: "b.md", title: "B note",
          pane: "left", payload: { path: "b.md" }, transient: false },
      ],
      activeLeft: "tab-0", activeRight: null, split: false, sidebarCollapsed: false,
    }));
    const { useTabs } = await import("./tabs.js");
    const tabs = useTabs.getState().tabs;
    expect(tabs).toHaveLength(2);
    expect(tabs.map((t) => t.title)).toEqual(["A note", "B note"]);
  });

  it("only ever drops a tab it rewrote, never one it left alone", async () => {
    // Two tabs that collide on appId + instanceKey + pane. That state should
    // not arise, but it has before (the tab-id collision bug), and a load-time
    // function that silently discards tabs is the dangerous kind. Collapsing
    // is reserved for the pair migrate itself created.
    mem.set("heaton-os.tabs.v1", JSON.stringify({
      tabs: [
        { id: "tab-0", appId: "files", instanceKey: "", title: "Files",
          pane: "left", payload: {}, transient: false },
        { id: "tab-1", appId: "files", instanceKey: "", title: "Files",
          pane: "left", payload: {}, transient: false },
      ],
      activeLeft: "tab-0", activeRight: null, split: false, sidebarCollapsed: false,
    }));
    const { useTabs } = await import("./tabs.js");
    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual(["tab-0", "tab-1"]);
  });

  it("a system surface launched from the rail is kept, not a preview", async () => {
    const { useTabs } = await import("./tabs.js");
    useTabs.getState().openApp("timeline");
    // Clicking through to a document must not destroy the surface you clicked
    // it from — the Timeline exists to be clicked through.
    useTabs.getState().openTab({ appId: "reader", instanceKey: "doc1", title: "Doc One" });
    expect(useTabs.getState().tabs.map((t) => t.appId)).toEqual(["timeline", "reader"]);
  });

  it("a space launched from the rail is still a preview", async () => {
    const { useTabs } = await import("./tabs.js");
    useTabs.getState().openApp("home");
    useTabs.getState().openApp("wfdinner");
    // The case previews exist for: browsing spaces costs one tab, not eight.
    expect(useTabs.getState().tabs).toHaveLength(1);
    expect(useTabs.getState().tabs[0]?.appId).toBe("wfdinner");
  });

  it("launching Search from the dock cold gets the kept tab, not a preview", async () => {
    const { useTabs } = await import("./tabs.js");
    // openApp routes search through openSearch; without that it would fall to
    // the generic path and open a transient tab the next preview would evict.
    useTabs.getState().openApp("search");
    const tabs = useTabs.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.appId).toBe("search");
    expect(tabs[0]?.transient).toBe(false);
  });

  it("launching Search with no query shows what was there, it does not wipe it", async () => {
    const { useTabs, openSearch } = await import("./tabs.js");
    openSearch("mortgage");
    // Reaching for Search in the dock means "show me that again".
    useTabs.getState().openApp("search");
    const tabs = useTabs.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.payload.query).toBe("mortgage");
    expect(tabs[0]?.title).toBe("Search: mortgage");
  });

  it("a preview opened from Search does not evict the search itself", async () => {
    const { useTabs, openSearch } = await import("./tabs.js");
    openSearch("mortgage");
    useTabs.getState().openTab({ appId: "reader", instanceKey: "doc1", title: "Doc One" });
    expect(useTabs.getState().tabs.map((t) => t.appId)).toEqual(["search", "reader"]);
  });

  it("the search query survives a reload", async () => {
    const { openSearch } = await import("./tabs.js");
    openSearch("mortgage", "House-Move");
    vi.resetModules();
    const { useTabs: reloaded } = await import("./tabs.js");
    const tabs = reloaded.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.payload).toMatchObject({ query: "mortgage", space: "House-Move" });
  });

  // Closing

  it("closeTab removes only the named tab", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", instanceKey: "doc1", transient: false, title: "Doc One" });
    state.openTab({ appId: "files", transient: false, title: "Files" });
    const tabIds = useTabs.getState().tabs.map((t) => t.id);
    state.closeTab(tabIds[0]!);
    expect(useTabs.getState().tabs).toHaveLength(1);
    expect(useTabs.getState().tabs[0]?.id).toBe(tabIds[1]);
  });

  it("closing the active tab moves activation to another tab in the same pane", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", transient: false, title: "Reader" });
    state.openTab({ appId: "files", transient: false, title: "Files" });
    const activeId = useTabs.getState().activeLeft;
    const other = useTabs.getState().tabs.find((t) => t.id !== activeId)!;
    state.closeTab(activeId!);
    expect(useTabs.getState().activeLeft).toBe(other.id);
  });

  it("closeOthers leaves exactly one tab in that pane, keeps it, and leaves the other pane untouched", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", title: "Reader" });
    state.openTab({ appId: "files", transient: false, title: "Files" });
    state.openTab({ appId: "calendar", transient: false, title: "Calendar" });
    const keepId = useTabs.getState().tabs[1]!.id;
    state.openTab({ appId: "notes", pane: "right", transient: false, title: "Notes" });
    const rightCount = useTabs.getState().tabs.filter((t) => t.pane === "right").length;
    state.closeOthers(keepId);
    expect(useTabs.getState().tabs.filter((t) => t.pane === "left")).toHaveLength(1);
    expect(useTabs.getState().tabs.filter((t) => t.pane === "left")[0]?.id).toBe(keepId);
    expect(useTabs.getState().tabs.filter((t) => t.pane === "left")[0]?.transient).toBe(false);
    expect(useTabs.getState().tabs.filter((t) => t.pane === "right")).toHaveLength(rightCount);
  });

  it("closing the last right-pane tab collapses the split", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", transient: false, title: "Reader" });
    state.openTab({ appId: "files", pane: "right", transient: false, title: "Files" });
    const rightTabId = useTabs.getState().tabs[1]!.id;
    state.closeTab(rightTabId);
    expect(useTabs.getState().split).toBe(false);
    expect(useTabs.getState().activeRight).toBe(null);
  });

  it("closing the last left-pane tab while the right has tabs pulls them back to the left and collapses the split", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", transient: false, title: "Reader" });
    state.openTab({ appId: "files", pane: "right", transient: false, title: "Files" });
    const leftTabId = useTabs.getState().tabs[0]!.id;
    const rightTabId = useTabs.getState().tabs[1]!.id;
    state.closeTab(leftTabId);
    expect(useTabs.getState().tabs).toHaveLength(1);
    expect(useTabs.getState().tabs[0]?.id).toBe(rightTabId);
    expect(useTabs.getState().tabs[0]?.pane).toBe("left");
    expect(useTabs.getState().split).toBe(false);
  });

  // Split

  it("sendToRight refuses when it would empty the left pane", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", title: "Reader" });
    const tabId = useTabs.getState().tabs[0]!.id;
    const before = JSON.stringify(useTabs.getState().tabs);
    state.sendToRight(tabId);
    expect(JSON.stringify(useTabs.getState().tabs)).toBe(before);
    expect(useTabs.getState().split).toBe(false);
  });

  it("sendToRight pins the moved tab", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", transient: false, title: "Reader" });
    state.openTab({ appId: "files", transient: false, title: "Files" });
    const moveId = useTabs.getState().tabs[0]!.id;
    state.sendToRight(moveId);
    const moved = useTabs.getState().tabs.find((t) => t.id === moveId)!;
    expect(moved.transient).toBe(false);
  });

  // Persistence & migration

  it("state written by one instance is restored on re-import", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", transient: false, title: "Reader" });
    state.openTab({ appId: "files", transient: false, title: "Files" });
    // Split via the real path — sendToRight is what sets `split`, so building
    // the pane by hand would persist a right-pane tab with split still false.
    state.sendToRight(useTabs.getState().tabs[0]!.id);

    const savedTabs = useTabs.getState().tabs.map((t) => t.id);
    const savedActiveLeft = useTabs.getState().activeLeft;
    const savedActiveRight = useTabs.getState().activeRight;

    vi.resetModules();
    const { useTabs: restored } = await import("./tabs.js");
    expect(restored.getState().tabs.map((t) => t.id)).toEqual(savedTabs);
    expect(restored.getState().activeLeft).toBe(savedActiveLeft);
    expect(restored.getState().activeRight).toBe(savedActiveRight);
    expect(restored.getState().split).toBe(true);
  });

  it("migration: persisted tabs with no transient field restore as transient: false", async () => {
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
    });
    const payload = {
      tabs: [
        {
          id: "tab-0",
          appId: "reader",
          instanceKey: "doc1",
          title: "Document",
          pane: "left" as const,
          payload: {},
        },
      ],
      activeLeft: "tab-0",
      activeRight: null,
      split: false,
      sidebarCollapsed: false,
    };
    mem.set("heaton-os.tabs.v1", JSON.stringify(payload));
    vi.resetModules();
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    expect(useTabs.getState().tabs[0]?.transient).toBe(false);
  });

  it("activeRight is dropped on load when split was false", async () => {
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
    });
    const payload = {
      tabs: [
        {
          id: "tab-0",
          appId: "reader",
          instanceKey: "doc1",
          title: "Document",
          pane: "left" as const,
          payload: {},
          transient: false,
        },
      ],
      activeLeft: "tab-0",
      activeRight: "should-be-dropped",
      split: false,
      sidebarCollapsed: false,
    };
    mem.set("heaton-os.tabs.v1", JSON.stringify(payload));
    vi.resetModules();
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    expect(useTabs.getState().activeRight).toBe(null);
  });

  it("a corrupt payload falls back to empty state without throwing", async () => {
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
    });
    mem.set("heaton-os.tabs.v1", "not json");
    vi.resetModules();
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    expect(useTabs.getState().tabs).toEqual([]);
  });

  it("a corrupt payload with wrong schema falls back to empty state without throwing", async () => {
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
    });
    mem.set("heaton-os.tabs.v1", JSON.stringify({ tabs: "nope" }));
    vi.resetModules();
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    expect(useTabs.getState().tabs).toEqual([]);
  });

  it("seeded persisted tabs tab-0 through tab-4 do not collide with a newly-opened tab", async () => {
    const payload = {
      tabs: [
        {
          id: "tab-0",
          appId: "reader",
          instanceKey: "doc1",
          title: "One",
          pane: "left" as const,
          payload: {},
          transient: false,
        },
        {
          id: "tab-1",
          appId: "reader",
          instanceKey: "doc2",
          title: "Two",
          pane: "left" as const,
          payload: {},
          transient: false,
        },
        {
          id: "tab-2",
          appId: "reader",
          instanceKey: "doc3",
          title: "Three",
          pane: "left" as const,
          payload: {},
          transient: false,
        },
        {
          id: "tab-3",
          appId: "reader",
          instanceKey: "doc4",
          title: "Four",
          pane: "left" as const,
          payload: {},
          transient: false,
        },
        {
          id: "tab-4",
          appId: "reader",
          instanceKey: "doc5",
          title: "Five",
          pane: "left" as const,
          payload: {},
          transient: false,
        },
      ],
      activeLeft: "tab-0",
      activeRight: null,
      split: false,
      sidebarCollapsed: false,
    };
    mem.set("heaton-os.tabs.v1", JSON.stringify(payload));
    vi.resetModules();
    const { useTabs } = await import("./tabs.js");
    let state = useTabs.getState();
    state.openTab({ appId: "files", title: "Files" });
    const newTabId = useTabs.getState().tabs[5]!.id;
    const existingIds = ["tab-0", "tab-1", "tab-2", "tab-3", "tab-4"];
    expect(existingIds).not.toContain(newTabId);
  });

  // Cycling

  it("cycle moves to the next tab within the active pane and wraps", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", instanceKey: "doc1", transient: false, title: "Doc One" });
    state.openTab({ appId: "files", transient: false, title: "Files" });
    state.openTab({ appId: "calendar", transient: false, title: "Calendar" });
    const firstId = useTabs.getState().activeLeft;
    state.cycle();
    expect(useTabs.getState().activeLeft).not.toBe(firstId);
    const secondId = useTabs.getState().activeLeft;
    state.cycle();
    expect(useTabs.getState().activeLeft).not.toBe(secondId);
    const thirdId = useTabs.getState().activeLeft;
    state.cycle();
    expect(useTabs.getState().activeLeft).toBe(firstId);
  });

  it("cycle is a no-op with fewer than two tabs in the pane", async () => {
    const { useTabs } = await import("./tabs.js");
    const state = useTabs.getState();
    state.openTab({ appId: "reader", title: "Reader" });
    const activeId = useTabs.getState().activeLeft;
    state.cycle();
    expect(useTabs.getState().activeLeft).toBe(activeId);
  });
});
