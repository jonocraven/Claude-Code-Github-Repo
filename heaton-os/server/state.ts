import chokidar from "chokidar";
import path from "node:path";
import type MiniSearch from "minisearch";
import { IGNORE_NAMES, WORKSPACE_ROOT } from "./config.js";
import { buildBacklinks, type BacklinkIndex } from "./backlinks.js";
import { scanCorpus, type Corpus } from "./corpus.js";
import { buildSearchIndex } from "./search.js";
import { buildSemanticIndex } from "./semantic.js";

/**
 * The filesystem is the database (brief §2.2): everything derived —
 * search index, backlinks — is rebuilt in memory from a corpus scan,
 * and the watcher keeps it fresh while the app is open.
 */

interface AppState {
  corpus: Corpus;
  search: ReturnType<typeof buildSearchIndex>;
  backlinks: BacklinkIndex;
}

let state: AppState | null = null;
let rebuildTimer: NodeJS.Timeout | null = null;

export function getState(): AppState {
  if (!state) throw new Error("state not initialised");
  return state;
}

// Change broadcast (brief §2.2): the watcher collects the workspace-relative
// paths that moved during a debounce window and, once the indexes are rebuilt,
// hands them to every subscriber (the WebSocket) so open windows live-update.
export type ChangeListener = (paths: string[]) => void;
const listeners = new Set<ChangeListener>();

export function onChange(listener: ChangeListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange(paths: string[]): void {
  for (const listener of listeners) listener(paths);
}

async function rebuild(): Promise<void> {
  const corpus = await scanCorpus(WORKSPACE_ROOT);
  state = {
    corpus,
    search: buildSearchIndex(corpus),
    backlinks: buildBacklinks(corpus),
  };
}

export async function initState(): Promise<{ files: number; docs: number }> {
  await rebuild();
  const { corpus } = getState();

  // Semantic embedding happens in the background — never blocks boot (§10).
  void buildSemanticIndex(corpus);

  const watcher = chokidar.watch(WORKSPACE_ROOT, {
    ignored: (p) => p.split(path.sep).some((seg) => IGNORE_NAMES.has(seg)),
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
  });

  const pending = new Set<string>();
  watcher.on("all", (_event, changed) => {
    if (changed) {
      pending.add(path.relative(WORKSPACE_ROOT, changed).split(path.sep).join("/"));
    }
    // Debounced full rebuild — ~275 md files, cheap; Drive sync storms of
    // events collapse into one pass, then a single broadcast.
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      const paths = [...pending];
      pending.clear();
      void rebuild().then(() => {
        emitChange(paths);
        void buildSemanticIndex(getState().corpus);
      });
    }, 800);
  });

  return { files: corpus.files.size, docs: corpus.docs.size };
}
