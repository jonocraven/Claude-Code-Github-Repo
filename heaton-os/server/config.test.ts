import { describe, expect, it } from "vitest";
import { isIgnored } from "./config.js";

/**
 * The ignore convention is the one piece of workspace behaviour Jono drives by
 * renaming rather than by code, so it needs to behave the way the convention
 * reads — including for files, which the original folder-anchored regex quietly
 * excluded.
 */

describe("isIgnored", () => {
  it("hides a folder whose name ends in the marker", () => {
    expect(isIgnored("State (machine memory — ignore)")).toBe(true);
  });

  it("hides a file carrying the marker before its extension", () => {
    // The case the folder-only anchor missed: retiring one note is commoner
    // than retiring a whole folder.
    expect(isIgnored("Draft (ignore).md")).toBe(true);
    expect(isIgnored("Scratch (ignore).pdf")).toBe(true);
  });

  it("is case-insensitive and tolerates trailing whitespace", () => {
    expect(isIgnored("Old notes (IGNORE)")).toBe(true);
    expect(isIgnored("Old notes (ignore) ")).toBe(true);
  });

  it("still hides the fixed tooling names", () => {
    expect(isIgnored(".DS_Store")).toBe(true);
    expect(isIgnored("node_modules")).toBe(true);
  });

  it("does not hide a name that merely mentions ignoring", () => {
    expect(isIgnored("ignore-list.md")).toBe(false);
    expect(isIgnored("Things to ignore.md")).toBe(false);
    expect(isIgnored("MEMORY.md")).toBe(false);
  });

  it("does not treat a marker mid-path-segment as a match", () => {
    expect(isIgnored("Notes (ignore) and more.md")).toBe(false);
  });
});
