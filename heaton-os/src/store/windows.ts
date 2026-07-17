import { create } from "zustand";
import { getApp } from "../apps";

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface WindowPayload {
  /** Workspace-relative path for reader/viewer windows. */
  path?: string;
  /** Viewer kind: image | pdf | html | csv | text | other. */
  kind?: string;
}

export interface Win {
  id: string;
  appId: string;
  /** Distinguishes instances of one app (e.g. one Reader per document). */
  instanceKey: string;
  title: string;
  bounds: Bounds;
  z: number;
  minimized: boolean;
  /** Bounds to restore when un-maximising; null when not maximised. */
  premax: Bounds | null;
  payload: WindowPayload;
}

export interface OpenWindowOpts {
  appId: string;
  instanceKey?: string;
  title?: string;
  payload?: WindowPayload;
}

interface WindowState {
  windows: Win[];
  nextZ: number;
  focusedId: string | null;
  /** Path the Files app should expand to and highlight, if any. */
  revealPath: string | null;
  openWindow: (opts: OpenWindowOpts) => void;
  openApp: (appId: string) => void;
  reveal: (path: string) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  toggleMaximize: (id: string) => void;
  setBounds: (id: string, bounds: Bounds) => void;
  setTitle: (id: string, title: string) => void;
  cycle: () => void;
}

const POS_KEY = (appId: string) => `heaton-os.window.${appId}`;

function savedBounds(appId: string): Bounds | null {
  try {
    const raw = localStorage.getItem(POS_KEY(appId));
    if (!raw) return null;
    const b = JSON.parse(raw);
    if ([b.x, b.y, b.w, b.h].every((n: unknown) => typeof n === "number")) {
      return b;
    }
  } catch {
    /* corrupt entry — fall through to defaults */
  }
  return null;
}

function persistBounds(appId: string, bounds: Bounds) {
  try {
    localStorage.setItem(POS_KEY(appId), JSON.stringify(bounds));
  } catch {
    /* storage full or unavailable — position just won't persist */
  }
}

function desktopSize() {
  return { dw: window.innerWidth, dh: window.innerHeight };
}

function clampToDesktop(b: Bounds): Bounds {
  const { dw, dh } = desktopSize();
  const w = Math.min(b.w, dw - 24);
  const h = Math.min(b.h, dh - 130);
  return {
    x: Math.max(12, Math.min(b.x, dw - w - 12)),
    y: Math.max(4, Math.min(b.y, dh - h - 84)),
    w,
    h,
  };
}

function defaultBounds(index: number, wide = false): Bounds {
  const { dw, dh } = desktopSize();
  const w = Math.min(wide ? 760 : 560, dw - 24);
  const h = Math.min(wide ? dh - 160 : 440, dh - 140);
  const step = 32;
  return clampToDesktop({ x: 80 + index * step, y: 64 + (index % 8) * step, w, h });
}

/** A comfortable reading size, deliberately not full-bleed (brief §3). */
function comfortableBounds(): Bounds {
  const { dw, dh } = desktopSize();
  const w = Math.min(920, dw - 64);
  const h = dh - 140;
  return { x: Math.round((dw - w) / 2), y: 52, w, h };
}

// Apps that open at the wider reading/dashboard size.
const WIDE_APPS = new Set(["reader", "tasks", "calendar", "memory", "activity"]);

let uid = 0;

export const useWindows = create<WindowState>((set, get) => ({
  windows: [],
  nextZ: 1,
  focusedId: null,
  revealPath: null,

  openWindow: ({ appId, instanceKey = "", title, payload = {} }) => {
    const { windows, nextZ } = get();
    const existing = windows.find(
      (w) => w.appId === appId && w.instanceKey === instanceKey
    );
    if (existing) {
      set({
        windows: windows.map((w) =>
          w.id === existing.id ? { ...w, minimized: false, z: nextZ } : w
        ),
        nextZ: nextZ + 1,
        focusedId: existing.id,
      });
      return;
    }
    const app = getApp(appId);
    const siblings = windows.filter((w) => w.appId === appId).length;
    const saved = savedBounds(appId);
    const base =
      saved && siblings === 0
        ? clampToDesktop(saved)
        : defaultBounds(windows.length, WIDE_APPS.has(appId) || getApp(appId).kind === "space");
    const offset = siblings * 28;
    const id = `win-${uid++}`;
    const win: Win = {
      id,
      appId,
      instanceKey,
      title: title ?? app.name,
      bounds: clampToDesktop({ ...base, x: base.x + offset, y: base.y + offset }),
      z: nextZ,
      minimized: false,
      premax: null,
      payload,
    };
    set({ windows: [...windows, win], nextZ: nextZ + 1, focusedId: id });
  },

  openApp: (appId) => get().openWindow({ appId }),

  reveal: (path) => {
    // Strip a trailing slash so a folder path matches tree node paths.
    const clean = path.replace(/\/$/, "");
    get().openWindow({ appId: "files" });
    set({ revealPath: clean });
  },


  close: (id) => {
    const { windows, focusedId } = get();
    const remaining = windows.filter((w) => w.id !== id);
    const top = [...remaining]
      .filter((w) => !w.minimized)
      .sort((a, b) => b.z - a.z)[0];
    set({
      windows: remaining,
      focusedId: focusedId === id ? (top?.id ?? null) : focusedId,
    });
  },

  focus: (id) => {
    const { windows, nextZ, focusedId } = get();
    if (focusedId === id) return;
    set({
      windows: windows.map((w) => (w.id === id ? { ...w, z: nextZ } : w)),
      nextZ: nextZ + 1,
      focusedId: id,
    });
  },

  minimize: (id) => {
    const { windows, focusedId } = get();
    const rest = windows.filter((w) => w.id !== id && !w.minimized);
    const top = [...rest].sort((a, b) => b.z - a.z)[0];
    set({
      windows: windows.map((w) =>
        w.id === id ? { ...w, minimized: true } : w
      ),
      focusedId: focusedId === id ? (top?.id ?? null) : focusedId,
    });
  },

  toggleMaximize: (id) => {
    const { windows } = get();
    set({
      windows: windows.map((w) => {
        if (w.id !== id) return w;
        if (w.premax) return { ...w, bounds: w.premax, premax: null };
        return { ...w, premax: w.bounds, bounds: comfortableBounds() };
      }),
    });
    get().focus(id);
  },

  setBounds: (id, bounds) => {
    const { windows } = get();
    const win = windows.find((w) => w.id === id);
    if (!win) return;
    persistBounds(win.appId, bounds);
    set({
      windows: windows.map((w) =>
        w.id === id ? { ...w, bounds, premax: null } : w
      ),
    });
  },

  setTitle: (id, title) => {
    set({
      windows: get().windows.map((w) => (w.id === id ? { ...w, title } : w)),
    });
  },

  cycle: () => {
    const { windows, focus } = get();
    const visible = [...windows]
      .filter((w) => !w.minimized)
      .sort((a, b) => a.z - b.z);
    if (visible.length < 2) return;
    // The bottom-most window comes to the top — repeated ⌘` walks the stack.
    focus(visible[0]!.id);
  },
}));

/** Route a workspace file to the right window type (brief §4 Files). */
export function openFile(path: string): void {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const name = path.split("/").pop() ?? path;
  const open = useWindows.getState().openWindow;
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
  open({
    appId: "viewer",
    instanceKey: path,
    title: name,
    payload: { path, kind },
  });
}
