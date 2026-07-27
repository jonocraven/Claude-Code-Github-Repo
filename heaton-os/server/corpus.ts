import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { isIgnored } from "./config.js";

export interface CorpusDoc {
  path: string;
  title: string;
  headings: string;
  body: string;
  hash: string;
  modified: string;
}

export interface Corpus {
  /** Every non-ignored file, workspace-relative posix paths. */
  files: Set<string>;
  /** Markdown documents with content, keyed by path. */
  docs: Map<string, CorpusDoc>;
}

function firstH1(body: string, fallback: string): string {
  const m = /^#\s+(.+)$/m.exec(body);
  return m ? m[1]!.trim() : fallback;
}

function headingsOf(body: string): string {
  return [...body.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1]).join(" · ");
}

export async function scanCorpus(root: string): Promise<Corpus> {
  const files = new Set<string>();
  const docs = new Map<string, CorpusDoc>();

  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        if (isIgnored(entry.name)) return;
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(abs);
        } else if (entry.isFile()) {
          const rel = path.relative(root, abs).split(path.sep).join("/");
          files.add(rel);
          if (/\.md$/i.test(entry.name)) {
            const [body, stat] = await Promise.all([
              fs.readFile(abs, "utf8"),
              fs.stat(abs),
            ]);
            docs.set(rel, {
              path: rel,
              title: firstH1(body, entry.name.replace(/\.md$/i, "")),
              headings: headingsOf(body),
              body,
              hash: crypto.createHash("sha256").update(body).digest("hex"),
              modified: stat.mtime.toISOString(),
            });
          }
        }
      })
    );
  }

  await walk(root);
  return { files, docs };
}

/**
 * Incremental counterpart to `scanCorpus` (brief 04): re-stat and re-read only
 * the paths the watcher says changed, and leave every other entry untouched
 * by identity — `corpus` is mutated in place so callers keep the same
 * `files`/`docs` references.
 */
export async function updateCorpus(
  corpus: Corpus,
  root: string,
  changedPaths: readonly string[]
): Promise<void> {
  for (const rel of changedPaths) {
    if (rel.split("/").some((seg) => isIgnored(seg))) continue;
    const abs = path.join(root, ...rel.split("/"));

    let stat: Awaited<ReturnType<typeof fs.stat>> | null;
    try {
      stat = await fs.stat(abs);
    } catch {
      stat = null;
    }

    if (!stat || stat.isDirectory()) {
      // Gone (deleted, or a directory event chokidar reported) — drop it.
      corpus.files.delete(rel);
      corpus.docs.delete(rel);
      continue;
    }

    corpus.files.add(rel);

    if (/\.md$/i.test(rel)) {
      const body = await fs.readFile(abs, "utf8");
      const name = path.posix.basename(rel);
      corpus.docs.set(rel, {
        path: rel,
        title: firstH1(body, name.replace(/\.md$/i, "")),
        headings: headingsOf(body),
        body,
        hash: crypto.createHash("sha256").update(body).digest("hex"),
        modified: stat.mtime.toISOString(),
      });
    } else {
      // Was markdown, changed extension via rename — drop the stale doc.
      corpus.docs.delete(rel);
    }
  }
}
