import { beforeEach, describe, it, expect, vi } from "vitest";

describe("useTheme store", () => {
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

  it("defaults to system with nothing persisted", async () => {
    const { useTheme } = await import("./theme");
    expect(useTheme.getState().preference).toBe("system");
  });

  it("restores a persisted preference", async () => {
    localStorage.setItem("heaton-os.theme.v1", "dark");
    const { useTheme } = await import("./theme");
    expect(useTheme.getState().preference).toBe("dark");
  });

  it("falls back to system for a corrupted value", async () => {
    localStorage.setItem("heaton-os.theme.v1", "purple");
    const { useTheme } = await import("./theme");
    expect(useTheme.getState().preference).toBe("system");
  });

  it("cycles light -> dark -> system -> light", async () => {
    localStorage.setItem("heaton-os.theme.v1", "light");
    const { useTheme } = await import("./theme");

    useTheme.getState().cycle();
    expect(useTheme.getState().preference).toBe("dark");

    useTheme.getState().cycle();
    expect(useTheme.getState().preference).toBe("system");

    useTheme.getState().cycle();
    expect(useTheme.getState().preference).toBe("light");
  });

  it("persists each step of the cycle to localStorage", async () => {
    const { useTheme } = await import("./theme");
    useTheme.getState().cycle();
    expect(localStorage.getItem("heaton-os.theme.v1")).toBe(useTheme.getState().preference);
  });

  it("does not throw when localStorage is unavailable", async () => {
    vi.stubGlobal("localStorage", undefined);
    const { useTheme } = await import("./theme");
    expect(useTheme.getState().preference).toBe("system");
    expect(() => useTheme.getState().cycle()).not.toThrow();
  });
});
