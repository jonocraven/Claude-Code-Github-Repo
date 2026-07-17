import path from "node:path";

/**
 * Cross-reference resolution (brief §6 — hard requirement).
 *
 * Documents reference each other by bare path or filename, usually in
 * backticks. A reference resolves by trying, in order:
 *   1. relative to the referencing document's folder,
 *   2. relative to the document's space root (Spaces/<name>/),
 *   3. relative to the workspace root.
 * Unresolvable references are marked, never guessed (§6d).
 */

const PATH_EXT = /\.(md|sh|csv|pdf)$/i;

/** Does a backticked string look like a file reference at all? */
export function looksPathLike(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 260) return false;
  if (/\s{2,}/.test(t)) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return false; // URLs and schemes
  if (t.includes("://") || t.startsWith("#")) return false;
  if (t.includes("/")) {
    // Commands like "npm run os" have spaces around words, paths rarely do —
    // but real folders DO contain spaces ("Design System/…"), so only reject
    // strings whose slashes can't be path separators.
    return !/^\//.test(t) || PATH_EXT.test(t);
  }
  return PATH_EXT.test(t);
}

function normalise(p: string): string | null {
  const clean = path.posix.normalize(p).replace(/^\.\//, "");
  if (clean.startsWith("../") || clean === ".." || path.posix.isAbsolute(clean)) {
    return null;
  }
  return clean;
}

export function resolveRef(
  raw: string,
  docPath: string,
  files: ReadonlySet<string>
): string | null {
  const ref = raw.trim().replace(/^\.\//, "");
  if (!ref) return null;

  const docDir = path.posix.dirname(docPath);
  const spaceMatch = /^(Spaces\/[^/]+)\//.exec(docPath);
  const bases = [
    docDir === "." ? "" : docDir,
    ...(spaceMatch ? [spaceMatch[1]!] : []),
    "",
  ];

  for (const base of bases) {
    const candidate = normalise(base ? path.posix.join(base, ref) : ref);
    if (candidate && files.has(candidate)) return candidate;
  }
  return null;
}
