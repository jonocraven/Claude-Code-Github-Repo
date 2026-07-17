import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv();

// The workspace is read via a configured absolute path — the app repo lives
// outside it (brief §2.1). Default matches Jono's machine; .env overrides.
export const WORKSPACE_ROOT = path.resolve(
  process.env.WORKSPACE_ROOT ?? "/Users/jonathancraven/Claude"
);

export const PORT = Number(process.env.PORT ?? 4400);

// Bind to loopback only — never 0.0.0.0 (brief §2.2).
export const HOST = "127.0.0.1";

// Never surfaced anywhere (brief §2.2 / §10): Drive temp folders, editor and
// tool state, OS noise.
export const IGNORE_NAMES = new Set([
  ".DS_Store",
  ".tmp.driveupload",
  ".tmp.drivedownload",
  ".obsidian",
  ".claude",
  "__pycache__",
  "node_modules",
]);
