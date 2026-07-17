import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Corpus } from "./corpus.js";
import { spaceOf } from "./paths.js";

/**
 * Semantic search (brief §2.2): fully local embeddings via transformers.js,
 * all-MiniLM-L6-v2, chunked by heading, cached to disk keyed by file hash.
 * Built in the background after boot — keyword search never waits for this.
 */

export type SemanticStatus = "building" | "ready" | "unavailable";

export interface SemanticHit {
  path: string;
  title: string;
  space: string | null;
  snippet: string;
  score: number;
}

const CACHE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".cache"
);
const EMB_CACHE = path.join(CACHE_DIR, "embeddings.json");
const MODEL = "Xenova/all-MiniLM-L6-v2";
const MIN_SCORE = 0.3;

interface Chunk {
  text: string;
  vec: number[];
}

interface FileEntry {
  hash: string;
  title: string;
  chunks: Chunk[];
}

let status: SemanticStatus = "building";
let store = new Map<string, FileEntry>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: any = null;

export function semanticStatus(): SemanticStatus {
  return status;
}

/** Split a doc into heading-bounded chunks, merging tiny ones. */
export function chunkDocument(body: string): string[] {
  const parts = body.split(/^(?=#{1,6}\s)/m);
  const chunks: string[] = [];
  for (const part of parts) {
    const text = part.trim();
    if (!text) continue;
    if (chunks.length > 0 && text.length < 120) {
      chunks[chunks.length - 1] += `\n\n${text}`;
    } else {
      chunks.push(text.length > 1400 ? text.slice(0, 1400) : text);
    }
  }
  return chunks.filter((c) => c.length >= 40);
}

async function loadCache(): Promise<Map<string, FileEntry>> {
  try {
    const raw = await fsp.readFile(EMB_CACHE, "utf8");
    return new Map(Object.entries(JSON.parse(raw)));
  } catch {
    return new Map();
  }
}

async function saveCache(map: Map<string, FileEntry>): Promise<void> {
  await fsp.mkdir(CACHE_DIR, { recursive: true });
  await fsp.writeFile(EMB_CACHE, JSON.stringify(Object.fromEntries(map)));
}

async function getExtractor() {
  if (extractor) return extractor;
  const { env, pipeline } = await import("@huggingface/transformers");
  env.cacheDir = path.join(CACHE_DIR, "models");
  fs.mkdirSync(env.cacheDir, { recursive: true });
  extractor = await pipeline("feature-extraction", MODEL);
  return extractor;
}

async function embed(texts: string[]): Promise<number[][]> {
  const ex = await getExtractor();
  const out = await ex(texts, { pooling: "mean", normalize: true });
  return out.tolist() as number[][];
}

/** (Re-)embed the corpus; only files whose hash changed hit the model. */
export async function buildSemanticIndex(corpus: Corpus): Promise<void> {
  status = "building";
  try {
    if (store.size === 0) store = await loadCache();
    const next = new Map<string, FileEntry>();
    let changed = false;

    for (const doc of corpus.docs.values()) {
      const cached = store.get(doc.path);
      if (cached && cached.hash === doc.hash) {
        next.set(doc.path, cached);
        continue;
      }
      const texts = chunkDocument(doc.body);
      if (texts.length === 0) continue;
      const vecs = await embed(texts);
      next.set(doc.path, {
        hash: doc.hash,
        title: doc.title,
        chunks: texts.map((text, i) => ({ text, vec: vecs[i]! })),
      });
      changed = true;
    }

    if (changed || next.size !== store.size) await saveCache(next);
    store = next;
    status = "ready";
  } catch (err) {
    // No model, no network, no matter — keyword search carries on alone.
    console.error("semantic index unavailable:", (err as Error).message);
    status = "unavailable";
  }
}

export async function searchSemantic(
  query: string,
  space: string | null,
  limit = 5
): Promise<SemanticHit[]> {
  if (status !== "ready") return [];
  const [qvec] = await embed([query]);
  const best = new Map<string, { score: number; text: string; title: string }>();

  for (const [docPath, entry] of store) {
    const docSpace = spaceOf(docPath);
    if (space && docSpace !== space) continue;
    for (const chunk of entry.chunks) {
      let dot = 0;
      for (let i = 0; i < qvec!.length; i++) dot += qvec![i]! * chunk.vec[i]!;
      const prev = best.get(docPath);
      if (!prev || dot > prev.score) {
        best.set(docPath, { score: dot, text: chunk.text, title: entry.title });
      }
    }
  }

  return [...best.entries()]
    .filter(([, v]) => v.score >= MIN_SCORE)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([p, v]) => ({
      path: p,
      title: v.title,
      space: spaceOf(p),
      snippet:
        v.text.replace(/^#{1,6}\s+/gm, "").replace(/\s+/g, " ").slice(0, 160) +
        (v.text.length > 160 ? "…" : ""),
      score: Math.round(v.score * 1000) / 1000,
    }));
}
