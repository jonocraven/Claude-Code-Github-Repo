import { create } from "zustand";

/**
 * Recently-opened files trail. Keeps the 20 most recent, most recent first.
 * On re-opening a file, moves it to the front and updates its title and timestamp.
 * Persists to localStorage so a reload restores the trail.
 */

export interface RecentEntry {
  path: string; // workspace-relative
  title: string; // display name at the time it was opened
  at: number; // Date.now()
}

interface RecentState {
  entries: RecentEntry[];
  record: (path: string, title: string) => void;
}

const STORE_KEY = "heaton-os.recent.v1";
const MAX_ENTRIES = 20;

function load(): Partial<RecentState> {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as { entries: RecentEntry[] };
    if (!Array.isArray(data.entries)) return {};
    return { entries: data.entries };
  } catch {
    return {};
  }
}

function persist(s: RecentState): void {
  try {
    const data = { entries: s.entries };
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    /* storage unavailable — session just won't restore */
  }
}

export const useRecent = create<RecentState>((set, get) => {
  const persisted = load();

  const commit = (partial: Partial<RecentState>) => {
    set(partial);
    persist(get());
  };

  return {
    entries: persisted.entries ?? [],

    record: (path, title) => {
      const current = get().entries;
      const existing = current.findIndex((e) => e.path === path);

      if (existing !== -1) {
        // Re-opening promotes rather than duplicates, so the trail stays a
        // list of distinct files rather than a log of every open.
        const entry = current[existing]!;
        const updated: RecentEntry = { path: entry.path, title, at: Date.now() };
        const reordered = [updated, ...current.slice(0, existing), ...current.slice(existing + 1)];
        commit({ entries: reordered });
      } else {
        // Add new entry at the front
        const newEntry: RecentEntry = { path, title, at: Date.now() };
        let entries = [newEntry, ...current];
        if (entries.length > MAX_ENTRIES) {
          entries = entries.slice(0, MAX_ENTRIES);
        }
        commit({ entries });
      }
    },
  };
});

/** Record a recently-opened file. Call from openFile(), not directly from components. */
export function record(path: string, title: string): void {
  useRecent.getState().record(path, title);
}

/** Format a timestamp as a relative age string. */
export function formatAge(timestamp: number): string {
  const now = Date.now();
  const ms = now - timestamp;
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);

  if (secs < 60) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}
