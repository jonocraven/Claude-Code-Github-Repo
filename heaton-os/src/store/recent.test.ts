import { beforeEach, describe, it, expect, vi } from "vitest";
import { formatAge } from "./recent";

describe("formatAge", () => {
  it("returns 'just now' for less than 60 seconds", () => {
    const now = Date.now();
    expect(formatAge(now - 30 * 1000)).toBe("just now");
  });

  it("returns 'just now' at the 59-second boundary", () => {
    const now = Date.now();
    expect(formatAge(now - 59 * 1000)).toBe("just now");
  });

  it("returns minutes for 1-59 minutes ago", () => {
    const now = Date.now();
    expect(formatAge(now - 12 * 60 * 1000)).toBe("12m ago");
    expect(formatAge(now - 1 * 60 * 1000)).toBe("1m ago");
    expect(formatAge(now - 59 * 60 * 1000)).toBe("59m ago");
  });

  it("returns hours for 1-23 hours ago", () => {
    const now = Date.now();
    expect(formatAge(now - 3 * 60 * 60 * 1000)).toBe("3h ago");
    expect(formatAge(now - 1 * 60 * 60 * 1000)).toBe("1h ago");
    expect(formatAge(now - 23 * 60 * 60 * 1000)).toBe("23h ago");
  });

  it("returns days for 1 or more days ago", () => {
    const now = Date.now();
    expect(formatAge(now - 2 * 24 * 60 * 60 * 1000)).toBe("2d ago");
    expect(formatAge(now - 1 * 24 * 60 * 60 * 1000)).toBe("1d ago");
  });
});

describe("useRecent store", () => {
  beforeEach(() => {
    const mem = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
    });
    vi.resetModules();
  });

  it("records a new entry at the front", async () => {
    const { useRecent, record } = await import("./recent");
    record("path/to/file.md", "file.md");
    const entries = useRecent.getState().entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]!).toMatchObject({
      path: "path/to/file.md",
      title: "file.md",
    });
    expect(typeof entries[0]!.at).toBe("number");
  });

  it("moves an existing entry to the front on repeat", async () => {
    const { useRecent, record } = await import("./recent");
    const now = Date.now();

    record("first.md", "first.md");
    record("second.md", "second.md");
    record("third.md", "third.md");

    // second.md is now at index 1 (most recent is index 0)
    let entries = useRecent.getState().entries;
    expect(entries[0]!.path).toBe("third.md");
    expect(entries[1]!.path).toBe("second.md");
    expect(entries[2]!.path).toBe("first.md");

    // Re-open second.md
    record("second.md", "second.md");

    // It should move to the front
    entries = useRecent.getState().entries;
    expect(entries[0]!.path).toBe("second.md");
    expect(entries[1]!.path).toBe("third.md");
    expect(entries[2]!.path).toBe("first.md");
  });

  it("updates title and timestamp on repeat", async () => {
    const { useRecent, record } = await import("./recent");

    record("file.md", "old-name.md");
    const firstTime = useRecent.getState().entries[0]!.at;

    // Small delay to ensure timestamp changes
    await new Promise((r) => setTimeout(r, 10));

    record("file.md", "new-name.md");
    const state = useRecent.getState();
    const entry = state.entries[0]!;

    expect(entry.title).toBe("new-name.md");
    expect(entry.at).toBeGreaterThan(firstTime);
  });

  it("caps at 20 entries", async () => {
    const { useRecent, record } = await import("./recent");

    for (let i = 0; i < 25; i++) {
      record(`file${i}.md`, `file${i}.md`);
    }

    const entries = useRecent.getState().entries;
    expect(entries).toHaveLength(20);
    // Most recent should be file24, oldest should be file5 (25 - 20 = 5)
    expect(entries[0]!.path).toBe("file24.md");
    expect(entries[19]!.path).toBe("file5.md");
  });

  it("persists to localStorage", async () => {
    const { useRecent, record } = await import("./recent");

    record("test.md", "test.md");
    record("another.md", "another.md");

    // Simulate page reload by resetting modules
    vi.resetModules();
    const { useRecent: reloaded } = await import("./recent");

    const state = reloaded.getState();
    const entries = state.entries;
    expect(entries).toHaveLength(2);
    expect(entries[0]!.path).toBe("another.md");
    expect(entries[1]!.path).toBe("test.md");
  });

  it("restores from corrupted localStorage by returning empty list", async () => {
    // Corrupt localStorage before importing
    const mem = new Map<string, string>();
    mem.set("heaton-os.recent.v1", "not json");
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
    });
    vi.resetModules();

    const { useRecent } = await import("./recent");
    expect(useRecent.getState().entries).toEqual([]);
  });

  it("restores from malformed payload by returning empty list", async () => {
    // Payload with wrong structure
    const mem = new Map<string, string>();
    mem.set("heaton-os.recent.v1", JSON.stringify({ entries: "not-an-array" }));
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
      clear: () => mem.clear(),
    });
    vi.resetModules();

    const { useRecent } = await import("./recent");
    expect(useRecent.getState().entries).toEqual([]);
  });

  it("does not throw on absent localStorage", async () => {
    // Simulate localStorage being unavailable
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("storage not available");
      },
      removeItem: () => {},
      clear: () => {},
    });
    vi.resetModules();

    const { record } = await import("./recent");
    // Should not throw
    expect(() => record("test.md", "test.md")).not.toThrow();
  });

  it("does not duplicate an entry on re-open", async () => {
    const { useRecent, record } = await import("./recent");

    record("file.md", "file.md");
    record("another.md", "another.md");
    record("file.md", "file.md"); // re-open

    const entries = useRecent.getState().entries;
    expect(entries).toHaveLength(2);
    expect(entries[0]!.path).toBe("file.md");
    expect(entries[1]!.path).toBe("another.md");
  });
});
