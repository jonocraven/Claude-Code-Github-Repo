import { create } from "zustand";
import { getApp } from "../apps";

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Win {
  id: string;
  appId: string;
  title: string;
  bounds: Bounds;
  z: number;
  minimized: boolean;
  /** Bounds to restore when un-maximising; null when not maximised. */
  premax: Bounds | null;
}

interface WindowState {
  windows: Win[];
  nextZ: number;
  focusedId: string | null;
  openApp: (appId: string) => void;
  close: (id: string) => void;
  focus: (id: string) => void;
  minimize: (id: string) => void;
  toggleMaximize: (id: string) => void;
  setBounds: (id: string, bounds: Bounds) => void;
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

function defaultBounds(index: number): Bounds {
  const { dw, dh } = desktopSize();
  const w = Math.min(560, dw - 24);
  const h = Math.min(440, dh - 140);
  // Cascade new windows so they never open exactly on top of each other.
  const step = 32;
  const x = Math.max(12, Math.min(80 + index * step, dw - w - 12));
  const y = Math.max(52, Math.min(64 + index * step, dh - h - 90));
  return { x, y, w, h };
}

/** A comfortable reading size, deliberately not full-bleed (brief §3). */
function comfortableBounds(): Bounds {
  const { dw, dh } = desktopSize();
  const w = Math.min(920, dw - 64);
  const h = dh - 140;
  return { x: Math.round((dw - w) / 2), y: 52, w, h };
}

let uid = 0;

export const useWindows = create<WindowState>((set, get) => ({
  windows: [],
  nextZ: 1,
  focusedId: null,

  openApp: (appId) => {
    const { windows, nextZ } = get();
    const existing = windows.find((w) => w.appId === appId);
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
    const id = `win-${uid++}`;
    const win: Win = {
      id,
      appId,
      title: app.name,
      bounds: savedBounds(appId) ?? defaultBounds(windows.length),
      z: nextZ,
      minimized: false,
      premax: null,
    };
    set({ windows: [...windows, win], nextZ: nextZ + 1, focusedId: id });
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
