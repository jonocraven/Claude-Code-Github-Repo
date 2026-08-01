import { beforeAll, describe, expect, it, vi } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Point WORKSPACE_ROOT at the committed fixture before config.ts is imported,
 * so the suite is reproducible on a clean checkout. It previously relied on a
 * developer's .env happening to point at the fixture — and .env is gitignored,
 * so `npm test` failed on a fresh clone. dotenv does not override variables
 * already present in the environment, so setting it here wins.
 */
const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "sample-workspace"
);

let memoryHealth: typeof import("./memory.js").memoryHealth;

beforeAll(async () => {
  process.env.WORKSPACE_ROOT = FIXTURE;
  vi.resetModules();
  ({ memoryHealth } = await import("./memory.js"));
});

describe("memoryHealth over the fixture workspace", () => {
  it("reports a gauge for root CLAUDE.md and every MEMORY.md", async () => {
    const { gauges } = await memoryHealth();
    const paths = gauges.map((g) => g.path);
    expect(paths).toContain("CLAUDE.md");
    expect(paths).toContain("MEMORY.md");
    expect(paths).toContain("Spaces/Job-Search/MEMORY.md");
    expect(paths.filter((p) => p.startsWith("Spaces/")).length).toBe(8);
  });

  it("applies the Appendix C ceilings (300/1200 root, 150/700 memory)", async () => {
    const { gauges } = await memoryHealth();
    const root = gauges.find((g) => g.path === "CLAUDE.md")!;
    expect(root.lineCeiling).toBe(300);
    expect(root.wordCeiling).toBe(1200);
    const space = gauges.find((g) => g.path === "MEMORY.md")!;
    expect(space.lineCeiling).toBe(150);
    expect(space.wordCeiling).toBe(700);
  });

  it("flags amber at 85% and red at breach", async () => {
    const { gauges, worst } = await memoryHealth();
    const amber = gauges.find((g) => g.path === "Spaces/Job-Search/MEMORY.md")!;
    const red = gauges.find((g) => g.path === "Spaces/Side-Hustle/MEMORY.md")!;
    expect(amber.status).toBe("amber");
    expect(red.status).toBe("red");
    expect(worst).toBe("red");
  });

  it("keeps small files green", async () => {
    const { gauges } = await memoryHealth();
    const green = gauges.find((g) => g.path === "MEMORY.md")!;
    expect(green.status).toBe("green");
  });
});
