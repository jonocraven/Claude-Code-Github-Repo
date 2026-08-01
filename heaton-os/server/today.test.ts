import { describe, expect, it } from "vitest";
import { bucketTasks, groupBySpace } from "./today.js";
import type { Task } from "./todoist.js";
import type { ActivityFile } from "./recent.js";

/**
 * These lock the *ranking rules* of the Today screen — the product judgement
 * about what earns a place and in what order. Changing an expectation here
 * should be a deliberate decision about the screen, not a fix to make a test
 * pass.
 */

function task(over: Partial<Task> & { id: string }): Task {
  return {
    content: `task ${over.id}`,
    description: "",
    priority: "p3",
    owner: "jono",
    due: null,
    sectionId: null,
    sectionName: null,
    url: "https://todoist.com/x",
    ...over,
  };
}

const TODAY = "2026-07-27";
const HORIZON = "2026-08-03"; // +7 days

describe("bucketTasks", () => {
  it("splits by due date relative to today", () => {
    const { overdue, dueToday, upcoming } = bucketTasks(
      [
        task({ id: "late", due: "2026-07-20" }),
        task({ id: "now", due: TODAY }),
        task({ id: "soon", due: "2026-07-30" }),
        task({ id: "far", due: "2026-09-01" }),
        task({ id: "undated", due: null }),
      ],
      TODAY,
      HORIZON
    );
    expect(overdue.map((t) => t.id)).toEqual(["late"]);
    expect(dueToday.map((t) => t.id)).toEqual(["now"]);
    expect(upcoming.map((t) => t.id)).toEqual(["soon"]);
  });

  it("excludes undated and beyond-horizon tasks from every bucket", () => {
    const b = bucketTasks(
      [task({ id: "far", due: "2026-09-01" }), task({ id: "undated" })],
      TODAY,
      HORIZON
    );
    const seen = [...b.overdue, ...b.dueToday, ...b.upcoming].map((t) => t.id);
    expect(seen).toEqual([]);
  });

  it("treats the horizon as inclusive and the day after as out", () => {
    const b = bucketTasks(
      [task({ id: "edge", due: HORIZON }), task({ id: "past", due: "2026-08-04" })],
      TODAY,
      HORIZON
    );
    expect(b.upcoming.map((t) => t.id)).toEqual(["edge"]);
  });

  it("orders overdue by how late, oldest first", () => {
    const b = bucketTasks(
      [
        task({ id: "b", due: "2026-07-25" }),
        task({ id: "a", due: "2026-07-01" }),
        task({ id: "c", due: "2026-07-26" }),
      ],
      TODAY,
      HORIZON
    );
    expect(b.overdue.map((t) => t.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks same-day ties by priority", () => {
    const b = bucketTasks(
      [
        task({ id: "low", due: TODAY, priority: "p4" }),
        task({ id: "high", due: TODAY, priority: "p1" }),
        task({ id: "mid", due: TODAY, priority: "p2" }),
      ],
      TODAY,
      HORIZON
    );
    expect(b.dueToday.map((t) => t.id)).toEqual(["high", "mid", "low"]);
  });

  it("routes anything not owned by Jono to 'waiting', whatever its due date", () => {
    const b = bucketTasks(
      [
        task({ id: "claude", owner: "claude", due: "2026-07-01" }),
        task({ id: "blocked", owner: "waiting", due: TODAY }),
        task({ id: "mine", due: TODAY }),
      ],
      TODAY,
      HORIZON
    );
    expect(b.waiting.map((t) => t.id).sort()).toEqual(["blocked", "claude"]);
    // Crucially, a delegated task must not also appear as Jono's overdue.
    expect(b.overdue).toEqual([]);
    expect(b.dueToday.map((t) => t.id)).toEqual(["mine"]);
  });

  it("caps upcoming and waiting so the screen stays a triage surface", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      task({ id: `u${i}`, due: "2026-07-30" })
    );
    const delegated = Array.from({ length: 20 }, (_, i) =>
      task({ id: `w${i}`, owner: "claude" })
    );
    const b = bucketTasks([...many, ...delegated], TODAY, HORIZON);
    expect(b.upcoming).toHaveLength(6);
    expect(b.waiting).toHaveLength(5);
    // Overdue is deliberately uncapped — you should see all of what is late.
    const late = Array.from({ length: 20 }, (_, i) =>
      task({ id: `o${i}`, due: "2026-07-01" })
    );
    expect(bucketTasks(late, TODAY, HORIZON).overdue).toHaveLength(20);
  });
});

function file(over: Partial<ActivityFile> & { name: string; area: string }): ActivityFile {
  return {
    path: `Spaces/${over.area}/${over.name}`,
    ext: "md",
    space: over.area,
    modified: "2026-07-27T09:00:00.000Z",
    ...over,
  };
}

describe("groupBySpace", () => {
  it("puts the busiest space first", () => {
    const groups = groupBySpace([
      file({ name: "a.md", area: "Home" }),
      file({ name: "b.md", area: "Job-Search" }),
      file({ name: "c.md", area: "Job-Search" }),
      file({ name: "d.md", area: "Job-Search" }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Job Search", "Home"]);
    expect(groups[0]!.total).toBe(3);
  });

  it("caps the visible files but keeps the true total", () => {
    const files = Array.from({ length: 9 }, (_, i) =>
      file({ name: `f${i}.md`, area: "Home" })
    );
    const [group] = groupBySpace(files);
    expect(group!.files).toHaveLength(4);
    expect(group!.total).toBe(9);
  });

  it("resolves a space id for routing, and null for non-space folders", () => {
    const groups = groupBySpace([
      file({ name: "a.md", area: "Job-Search" }),
      file({ name: "b.md", area: "References" }),
    ]);
    expect(groups.find((g) => g.label === "Job Search")!.id).toBe("job-search");
    expect(groups.find((g) => g.label === "References")!.id).toBeNull();
  });

  it("sorts equally-busy spaces alphabetically so the order is stable", () => {
    const groups = groupBySpace([
      file({ name: "a.md", area: "Home" }),
      file({ name: "b.md", area: "Finances" }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["Finances", "Home"]);
  });
});
