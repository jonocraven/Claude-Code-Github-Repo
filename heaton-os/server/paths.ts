import path from "node:path";
import { WORKSPACE_ROOT } from "./config.js";

/**
 * Resolve a workspace-relative path safely. Returns the absolute path, or
 * null if the input escapes the workspace (traversal) or is absolute.
 */
export function safeAbsolute(relPath: string): string | null {
  if (!relPath || path.isAbsolute(relPath)) return null;
  const abs = path.resolve(WORKSPACE_ROOT, relPath);
  if (abs !== WORKSPACE_ROOT && !abs.startsWith(WORKSPACE_ROOT + path.sep)) {
    return null;
  }
  return abs;
}

/** Space id ("Job-Search") for a workspace-relative path, or null. */
export function spaceOf(relPath: string): string | null {
  const m = /^Spaces\/([^/]+)\//.exec(relPath);
  return m ? m[1]! : null;
}
