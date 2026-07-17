import { describe, expect, it } from "vitest";
import { memoryHealth } from "./memory.js";

// .env in this workspace points WORKSPACE_ROOT at the fixture, whose memory
// files are sized to exercise each gauge state.
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
