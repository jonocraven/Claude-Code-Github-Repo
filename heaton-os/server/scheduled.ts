import fs from "node:fs/promises";
import path from "node:path";
import { WORKSPACE_ROOT } from "./config.js";

/**
 * Scheduled-task calendar (brief §4.5 / Appendix B). The known cadences are
 * expanded into concrete dated runs for a requested month. Design intent:
 * dated runs are staggered so no week stacks heavy runs. Each cadence links
 * to its folder under Scheduled/ when one exists (cross-checked at request
 * time, per the brief's "in case these have changed").
 */

export interface ScheduledEvent {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  title: string;
  cadence: string;
  folder: string | null;
}

interface Cadence {
  id: string;
  title: string;
  time: string;
  /** Keyword(s) to match a Scheduled/ subfolder name. */
  folderHints: string[];
  /** Does this cadence run on the given date? */
  runsOn: (d: Date) => boolean;
}

const CADENCES: Cadence[] = [
  {
    id: "memory-tidy",
    title: "Monthly memory tidy",
    time: "09:00",
    folderHints: ["memory", "tidy"],
    runsOn: (d) => d.getDate() === 1,
  },
  {
    id: "strategic-review",
    title: "Monthly strategic review",
    time: "09:00",
    folderHints: ["strategic", "review"],
    runsOn: (d) => d.getDate() === 8,
  },
  {
    id: "job-search-refresh",
    title: "Job-search refresh",
    time: "09:00",
    folderHints: ["job", "search"],
    runsOn: (d) => d.getDate() === 14 || d.getDate() === 28,
  },
  {
    id: "finance-refresh",
    title: "Bi-monthly finance refresh",
    time: "09:00",
    folderHints: ["finance"],
    // 21st of even months (month index is 0-based, so odd index = even month).
    runsOn: (d) => d.getDate() === 21 && (d.getMonth() + 1) % 2 === 0,
  },
  {
    id: "hygiene-check",
    title: "Weekly hygiene check",
    time: "09:00",
    folderHints: ["hygiene"],
    runsOn: (d) => d.getDay() === 5, // Friday
  },
  {
    id: "monday-pulse",
    title: "Monday pulse",
    time: "09:00",
    folderHints: ["monday", "pulse"],
    runsOn: (d) => d.getDay() === 1, // Monday
  },
];

async function scheduledFolders(): Promise<string[]> {
  try {
    const entries = await fs.readdir(path.join(WORKSPACE_ROOT, "Scheduled"), {
      withFileTypes: true,
    });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

function matchFolder(hints: string[], folders: string[]): string | null {
  const found = folders.find((f) => {
    const lower = f.toLowerCase();
    return hints.some((h) => lower.includes(h));
  });
  return found ? `Scheduled/${found}` : null;
}

export async function scheduledMonth(
  year: number,
  month: number // 1-based
): Promise<ScheduledEvent[]> {
  const folders = await scheduledFolders();
  const daysInMonth = new Date(year, month, 0).getDate();
  const events: ScheduledEvent[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day);
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    for (const c of CADENCES) {
      if (c.runsOn(date)) {
        events.push({
          date: iso,
          time: c.time,
          title: c.title,
          cadence: c.id,
          folder: matchFolder(c.folderHints, folders),
        });
      }
    }
  }
  return events;
}
