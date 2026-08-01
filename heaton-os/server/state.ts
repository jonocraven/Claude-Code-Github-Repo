import chokidar from "chokidar";
import path from "node:path";
import type MiniSearch from "minisearch";
import { isIgnored, WORKSPACE_ROOT } from "./config.js";
import {
  buildBacklinks,
  buildForwardIndex,
  updateBacklinks,
  type BacklinkIndex,
  type ForwardIndex,
} from "./backlinks.js";
import { scanCorpus, updateCorpus, type Corpus } from "./corpus.js";
import { buildSearchIndex, updateSearchIndex } from "./search.js";
import { buildSemanticIndex } from "./semantic.js";
import { buildTree, type TreeDir } from "./tree.js";

/**
 * The filesystem is the database (brief §2.2): everything derived —
 * search index, backlinks — is rebuilt in memory from a corpus scan,
 * and the watcher keeps it fresh while the app is open.
 */

interface AppState {
  corpus: Corpus;
  search: ReturnType<typeof buildSearchIndex>;
  backlinks: BacklinkIndex;
  /** Not part of any API response — kept only so incremental updates (brief
   * 04) can diff a changed document's outgoing refs without a full rescan. */
  forward: ForwardIndex;
  /** Served by GET /api/tree (brief 06) — kept in state so a request never
   * triggers its own walk of the workspace. */
  tree: TreeDir;
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

/** Full scan — used only on initial boot (brief 04 §5: unchanged behaviour). */
async function rebuild(): Promise<void> {
  const corpus = await scanCorpus(WORKSPACE_ROOT);
  state = {
    corpus,
    search: buildSearchIndex(corpus),
    backlinks: buildBacklinks(corpus),
    forward: buildForwardIndex(corpus),
    tree: await buildTree(WORKSPACE_ROOT),
  };
}

/**
 * Incremental update (brief 04): re-stat/re-read only the paths the watcher
 * collected, patch the search index in place, and diff backlinks via the
 * forward map rather than re-walking and re-parsing the whole workspace.
 *
 * The forward-map diff is only valid while the set of files is unchanged.
 * A reference resolves against `corpus.files`, so creating or deleting *any*
 * file can change how an unrelated, unchanged document's references resolve —
 * a ref that dangled may now resolve, and vice versa. Those documents are not
 * in `changedPaths`, so a diff keyed on changed paths alone silently drifts
 * from what a full rebuild would produce (verified: it does, within a couple
 * of create/delete cycles). Content edits keep the fast path; a membership
 * change falls back to rebuilding the graph, which is the cheap half anyway —
 * it re-parses nothing, since the corpus is already in memory.
 */
async function incrementalUpdate(changedPaths: readonly string[]): Promise<void> {
  const current = getState();
  // Per-path membership, not `files.size` — a rename removes one and adds
  // another, leaving the count identical while the basis has changed.
  const existedBefore = changedPaths.map((p) => current.corpus.files.has(p));
  await updateCorpus(current.corpus, WORKSPACE_ROOT, changedPaths);
  updateSearchIndex(current.search, current.corpus, changedPaths);
  const membershipHeld = changedPaths.every(
    (p, i) => current.corpus.files.has(p) === existedBefore[i]
  );

  if (membershipHeld) {
    updateBacklinks(current.backlinks, current.forward, current.corpus, changedPaths);
  } else {
    state = {
      ...current,
      backlinks: buildBacklinks(current.corpus),
      forward: buildForwardIndex(current.corpus),
    };
  }

  // Re-walk rather than patch (brief 06): a changed file alters `fileCount`
  // and `latestModified` on every ancestor directory, which is exactly the
  // kind of surgical-patch drift brief 04 hit for backlinks. This still only
  // runs once per debounced change burst, not once per request.
  getState().tree = await buildTree(WORKSPACE_ROOT);
}

export async function initState(): Promise<{ files: number; docs: number }> {
  await rebuild();
  const { corpus } = getState();

  // Semantic embedding happens in the background — never blocks boot (§10).
  void buildSemanticIndex(corpus);

  const watcher = chokidar.watch(WORKSPACE_ROOT, {
    ignored: (p) => p.split(path.sep).some((seg) => isIgnored(seg)),
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 400, pollInterval: 100 },
  });

  const pending = new Set<string>();
  watcher.on("all", (_event, changed) => {
    if (changed) {
      pending.add(path.relative(WORKSPACE_ROOT, changed).split(path.sep).join("/"));
    }
    // Debounced incremental update — Drive sync storms of events collapse
    // into one pass keyed on the paths that actually moved, then a single
    // broadcast.
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      const paths = [...pending];
      pending.clear();
      void incrementalUpdate(paths).then(() => {
        emitChange(paths);
        void buildSemanticIndex(getState().corpus);
      });
    }, 800);
  });

  return { files: corpus.files.size, docs: corpus.docs.size };
}
