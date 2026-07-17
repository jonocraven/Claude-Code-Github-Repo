import fs from "node:fs/promises";
import path from "node:path";
import { MEMORY_AMBER, MEMORY_CEILINGS, WORKSPACE_ROOT } from "./config.js";

/**
 * Memory-health port (brief §4.6 / Appendix C). Mirrors the thresholds in
 * References/memory-hygiene-check.sh: root CLAUDE.md ≤300 lines / ~1,200
 * words; root MEMORY.md and every space MEMORY.md ≤150 lines / ~700 words.
 * Amber at 85% of a ceiling, red at breach. Words are whitespace-delimited
 * tokens, matching `wc -w`.
 */

export type MemoryStatus = "green" | "amber" | "red";

export interface MemoryGauge {
  path: string;
  label: string;
  lines: number;
  words: number;
  lineCeiling: number;
  wordCeiling: number;
  linePct: number;
  wordPct: number;
  status: MemoryStatus;
}

export interface MemoryHealth {
  gauges: MemoryGauge[];
  worst: MemoryStatus;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function countLines(text: string): number {
  if (text === "") return 0;
  // `wc -l` counts newlines; a trailing-newline file and a no-newline file
  // both read naturally as "N lines of content", so count content lines.
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines.length;
}

function gaugeFor(
  rel: string,
  label: string,
  text: string,
  ceiling: { lines: number; words: number }
): MemoryGauge {
  const lines = countLines(text);
  const words = countWords(text);
  const linePct = lines / ceiling.lines;
  const wordPct = words / ceiling.words;
  const peak = Math.max(linePct, wordPct);
  const status: MemoryStatus =
    peak > 1 ? "red" : peak >= MEMORY_AMBER ? "amber" : "green";
  return {
    path: rel,
    label,
    lines,
    words,
    lineCeiling: ceiling.lines,
    wordCeiling: ceiling.words,
    linePct: Math.round(linePct * 100),
    wordPct: Math.round(wordPct * 100),
    status,
  };
}

async function read(rel: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(WORKSPACE_ROOT, rel), "utf8");
  } catch {
    return null;
  }
}

async function listSpaces(): Promise<string[]> {
  try {
    const entries = await fs.readdir(path.join(WORKSPACE_ROOT, "Spaces"), {
      withFileTypes: true,
    });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, "en-GB"));
  } catch {
    return [];
  }
}

const RANK: Record<MemoryStatus, number> = { green: 0, amber: 1, red: 2 };

export async function memoryHealth(): Promise<MemoryHealth> {
  const gauges: MemoryGauge[] = [];

  const rootClaude = await read("CLAUDE.md");
  if (rootClaude !== null) {
    gauges.push(
      gaugeFor("CLAUDE.md", "CLAUDE.md", rootClaude, MEMORY_CEILINGS.rootClaude)
    );
  }
  const rootMem = await read("MEMORY.md");
  if (rootMem !== null) {
    gauges.push(
      gaugeFor("MEMORY.md", "MEMORY.md", rootMem, MEMORY_CEILINGS.memory)
    );
  }

  for (const space of await listSpaces()) {
    const rel = `Spaces/${space}/MEMORY.md`;
    const text = await read(rel);
    if (text !== null) {
      gauges.push(gaugeFor(rel, space, text, MEMORY_CEILINGS.memory));
    }
  }

  const worst = gauges.reduce<MemoryStatus>(
    (acc, g) => (RANK[g.status] > RANK[acc] ? g.status : acc),
    "green"
  );
  return { gauges, worst };
}
