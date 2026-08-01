import { describe, expect, it } from "vitest";
import { buildDays, gapBetween } from "./TimelineWindow";
import type { ActivityFile, ScheduledEvent, Task } from "../api";

/**
 * The merge's judgement lives in two pure functions: how a day's mixed
 * entries are ordered, and how the spine handles days with nothing in them.
 * Everything else in the window is rendering.
 */

const change = (path: string, modified: string): ActivityFile => ({
  path,
  name: path.split("/").pop()!,
  ext: "md",
  space: null,
  area: "Home",
  modified,
});

const run = (date: string, time: string, title: string): ScheduledEvent => ({
  date,
  time,
  title,
  cadence: "hygiene-check",
  folder: null,
});

const task = (due: string | null, content: string): Task => ({
  id: content,
  content,
  description: "",
  priority: "p2",
  owner: "jono",
  due,
  sectionId: null,
  sectionName: null,
  url: "https://example.test",
});

const FROM = "2026-08-01";
const TO = "2026-08-31";

describe("buildDays — bucketing", () => {
  it("puts a change, a run and a task on the same day into one bucket", () => {
    const days = buildDays(
      [change("a.md", "2026-08-10T14:00:00.000Z")],
      [run("2026-08-10", "09:00", "Weekly hygiene check")],
      [task("2026-08-10", "Book the survey")],
      FROM,
      TO
    );
    expect(days).toHaveLength(1);
    expect(days[0]!.date).toBe("2026-08-10");
    expect(days[0]!.entries).toHaveLength(3);
  });

  it("orders a day: scheduled runs, then tasks, then the changes", () => {
    // Runs have clock times and set the shape of the day, so they lead —
    // even when a change landed earlier in the morning.
    const days = buildDays(
      [change("a.md", "2026-08-10T06:00:00.000Z")],
      [run("2026-08-10", "09:00", "Weekly hygiene check")],
      [task("2026-08-10", "Book the survey")],
      FROM,
      TO
    );
    expect(days[0]!.entries.map((e) => e.kind)).toEqual(["run", "task", "change"]);
  });

  it("orders entries of the same kind by time within the day", () => {
    const days = buildDays(
      [
        change("late.md", "2026-08-10T18:00:00.000Z"),
        change("early.md", "2026-08-10T07:00:00.000Z"),
      ],
      [],
      [],
      FROM,
      TO
    );
    expect(
      days[0]!.entries.map((e) => (e.kind === "change" ? e.file.name : ""))
    ).toEqual(["early.md", "late.md"]);
  });

  it("returns days in chronological order, oldest first", () => {
    const days = buildDays(
      [
        change("c.md", "2026-08-20T09:00:00.000Z"),
        change("a.md", "2026-08-05T09:00:00.000Z"),
        change("b.md", "2026-08-12T09:00:00.000Z"),
      ],
      [],
      [],
      FROM,
      TO
    );
    expect(days.map((d) => d.date)).toEqual(["2026-08-05", "2026-08-12", "2026-08-20"]);
  });

  it("emits no bucket at all for a day with nothing in it", () => {
    // The gap is rendered from the distance between buckets, so an empty
    // bucket would double-count as both a day and a gap.
    const days = buildDays(
      [
        change("a.md", "2026-08-05T09:00:00.000Z"),
        change("b.md", "2026-08-09T09:00:00.000Z"),
      ],
      [],
      [],
      FROM,
      TO
    );
    expect(days.map((d) => d.date)).toEqual(["2026-08-05", "2026-08-09"]);
  });
});

describe("buildDays — the window", () => {
  it("drops entries before the window starts", () => {
    const days = buildDays([change("old.md", "2026-07-20T09:00:00.000Z")], [], [], FROM, TO);
    expect(days).toEqual([]);
  });

  it("drops entries after the window ends", () => {
    const days = buildDays([], [run("2026-09-04", "09:00", "Later")], [], FROM, TO);
    expect(days).toEqual([]);
  });

  it("keeps entries exactly on both boundaries", () => {
    const days = buildDays(
      [change("first.md", `${FROM}T09:00:00.000Z`)],
      [run(TO, "09:00", "Last")],
      [],
      FROM,
      TO
    );
    expect(days.map((d) => d.date)).toEqual([FROM, TO]);
  });

  it("ignores a task with no due date rather than bucketing it as today", () => {
    const days = buildDays([], [], [task(null, "Someday")], FROM, TO);
    expect(days).toEqual([]);
  });
});

describe("gapBetween", () => {
  it("is zero for consecutive days", () => {
    expect(gapBetween("2026-08-10", "2026-08-11")).toBe(0);
  });

  it("counts only the days actually skipped", () => {
    // 10th → 14th skips the 11th, 12th and 13th: three quiet days.
    expect(gapBetween("2026-08-10", "2026-08-14")).toBe(3);
  });

  it("is zero for the same day, not negative", () => {
    expect(gapBetween("2026-08-10", "2026-08-10")).toBe(0);
  });

  it("counts across a month boundary", () => {
    expect(gapBetween("2026-08-30", "2026-09-02")).toBe(2);
  });
});
