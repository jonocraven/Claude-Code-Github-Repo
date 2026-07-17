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

// Todoist: token lives in .env only, never reaches the client (brief §10).
// The proxy is the only thing that touches it. TODOIST_FIXTURE points the
// proxy at a local JSON sample instead — used for dev/screenshots when no
// real token is present; it never invents "live" data behind Jono's back.
export const TODOIST_API_TOKEN = process.env.TODOIST_API_TOKEN ?? "";
export const TODOIST_FIXTURE = process.env.TODOIST_FIXTURE ?? "";
export const TODOIST_PROJECT_ID = "6gwxG5gJjJmX9fhx"; // the "Tasks" project

// Memory ceilings (brief Appendix C). Amber at 85% of a ceiling, red at
// breach — mirrors References/memory-hygiene-check.sh thresholds.
export const MEMORY_CEILINGS = {
  rootClaude: { lines: 300, words: 1200 },
  memory: { lines: 150, words: 700 }, // root + every space MEMORY.md
} as const;
export const MEMORY_AMBER = 0.85;

// Space id ↔ Todoist section name (brief §5). Cookery-Books and Life-Plan
// have no section in the Tasks project; they resolve to null.
export const SPACE_SECTIONS: Record<string, string | null> = {
  "job-search": "Job Search",
  "side-hustle": "Side Hustle",
  home: "Home",
  "cookery-books": null,
  "house-move": "House Move",
  finances: "Finances",
  "life-plan": null,
  wfdinner: "WFDinner",
};

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
