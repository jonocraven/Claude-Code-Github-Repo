/**
 * Reading position memory (brief 03 §3). Keyed by document path, capped at
 * 50 entries with oldest evicted first. Plain functions, not a zustand store —
 * nothing here is rendered, it's read/written imperatively from ReaderWindow's
 * scroll handler and restore effect.
 */

interface ReadPosEntry {
  scrollTop: number;
  at: number;
}

type ReadPosMap = Record<string, ReadPosEntry>;

const STORE_KEY = "heaton-os.readpos.v1";
const MAX_ENTRIES = 50;

function load(): ReadPosMap {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as unknown;
    return data && typeof data === "object" ? (data as ReadPosMap) : {};
  } catch {
    return {};
  }
}

function persist(map: ReadPosMap): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(map));
  } catch {
    /* storage unavailable — position just won't be remembered */
  }
}

/** The remembered scroll offset for a document, or null if never recorded. */
export function getReadPos(path: string): number | null {
  return load()[path]?.scrollTop ?? null;
}

/** Save the scroll offset for a document, evicting the oldest entry over the cap. */
export function saveReadPos(path: string, scrollTop: number): void {
  const map = load();
  map[path] = { scrollTop, at: Date.now() };
  const keys = Object.keys(map);
  if (keys.length > MAX_ENTRIES) {
    const oldest = keys.sort((a, b) => map[a]!.at - map[b]!.at);
    for (let i = 0; i < keys.length - MAX_ENTRIES; i++) delete map[oldest[i]!];
  }
  persist(map);
}
