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
  watcher.on("all", () => {
    // Debounced full rebuild — ~275 md files, cheap; Drive sync storms of
    // events collapse into one pass.
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      void rebuild().then(() => buildSemanticIndex(getState().corpus));
    }, 800);
  });

  return { files: corpus.files.size, docs: corpus.docs.size };
}
