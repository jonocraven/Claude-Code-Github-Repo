/**
 * Browser verification of the merged Timeline.
 *
 * buildDays and gapBetween are unit-tested, but the merge's actual promise —
 * that today is where you land, that a retired tab still resolves, that three
 * event types read apart without colour — is all rendering, and rendering is
 * where the previous three features in this repo were broken while green.
 *
 * Run the app, then: npm run probe:timeline   (PROBE_URL to override the port)
 */
import { chromium } from "playwright";

const URL = process.env.PROBE_URL ?? "http://127.0.0.1:5180/";
const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

try {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  // The app shows a boot screen first, so the rail does not exist yet on
  // networkidle. Reading it too early returned an empty list, which made the
  // "Activity is gone" assertion below pass against nothing at all.
  await page.waitForSelector(".nav-list .nav-label", { timeout: 15000 });
  await page.waitForTimeout(500);

  // 1. Activity and Calendar are gone from the rail; Timeline replaces them.
  const nav = await page.$$eval(".nav-list .nav-label", (e) => e.map((x) => x.textContent.trim()));
  check("the rail rendered at all", nav.length > 0, `${nav.length} entries`);
  check("Timeline is in the System list", nav.includes("Timeline"), nav.join(" | "));
  check("Activity and Calendar are gone from the rail",
    nav.length > 0 && !nav.includes("Activity") && !nav.includes("Calendar"));

  await page.locator(".nav-list .nav-label", { hasText: /^Timeline$/ }).first().click();
  await page.waitForTimeout(1800);

  // 2. The spine renders days, and today is on it.
  const days = await page.$$eval(".tl-daylabel", (e) => e.map((x) => x.textContent.trim()));
  check("the spine renders days", days.length > 0, `${days.length} days`);
  check("today is anchored on the spine", (await page.locator(".tl-day-today").count()) === 1,
    days.join(" | ").slice(0, 120));

  // 3. Chronological, oldest first — today must not be the first row.
  check("past days sit above today",
    (await page.locator(".tl-day.is-past").count()) > 0,
    `${await page.locator(".tl-day.is-past").count()} past days`);

  // 4. Landing scroll: today should be in view without the user scrolling.
  const inView = await page.locator(".tl-day-today").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.bottom <= window.innerHeight + 200;
  });
  check("the view lands on today rather than the top", inView);

  // 5. Quiet days collapse to a gap rather than blank rows.
  const gaps = await page.$$eval(".tl-gap", (e) => e.map((x) => x.textContent.trim()));
  check("quiet days collapse into a gap marker", gaps.length > 0, gaps.slice(0, 3).join(" | "));

  // 6. The three marks are distinguishable by shape, not just colour.
  const marks = await page.evaluate(() => {
    const one = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { radius: cs.borderRadius, border: cs.borderTopWidth, bg: cs.backgroundColor };
    };
    return { change: one(".tl-mark-change"), run: one(".tl-mark-run"), task: one(".tl-mark-task") };
  });
  check("a change mark is a filled square",
    marks.change && marks.change.border === "0px" && !marks.change.bg.includes("rgba(0, 0, 0, 0)"),
    JSON.stringify(marks.change));
  check("a run mark is a hollow ring",
    marks.run && marks.run.radius.startsWith("50%") && marks.run.border !== "0px",
    JSON.stringify(marks.run));

  // 7. Opening a change opens the document AND leaves the Timeline standing.
  //    It first failed here: Timeline launched as a preview, so the document
  //    replaced the surface it was opened from.
  const before = await page.$$eval(".doctab-title", (e) => e.map((x) => x.textContent.trim()));
  await page.locator(".tl-entry").filter({ has: page.locator(".tl-mark-change") }).first().click();
  await page.waitForTimeout(900);
  const after = await page.$$eval(".doctab-title", (e) => e.map((x) => x.textContent.trim()));
  check("clicking a change opens the document", after.length > before.length,
    after.join(" | "));
  check("opening a change leaves the Timeline standing", after.includes("Timeline"),
    after.join(" | "));

  // 8. The Month view still exists inside the merged window.
  await page.locator(".doctab-open", { hasText: "Timeline" }).first().click();
  await page.waitForTimeout(500);
  await page.locator(".tree-sort-btn", { hasText: "Month" }).click();
  await page.waitForTimeout(900);
  check("the month grid survives the merge", (await page.locator(".calendar-grid").count()) > 0);

  // 9. Tabs saved under the retired ids are migrated on load: rewritten to
  //    Timeline, retitled, and collapsed into one rather than restoring two
  //    identical windows.
  await page.evaluate(() => {
    localStorage.setItem("heaton-os.tabs.v1", JSON.stringify({
      tabs: [
        { id: "tab-0", appId: "activity", instanceKey: "", title: "Activity", pane: "left", payload: {}, transient: false },
        { id: "tab-1", appId: "calendar", instanceKey: "", title: "Calendar", pane: "left", payload: {}, transient: false },
      ],
      activeLeft: "tab-0", activeRight: null, split: false, sidebarCollapsed: false,
    }));
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".pane-body", { timeout: 15000 });
  await page.waitForTimeout(1400);

  const restored = await page.$$eval(".doctab-title", (e) => e.map((x) => x.textContent.trim()));
  check("retired tabs collapse to a single Timeline", restored.length === 1,
    restored.join(" | "));
  check("and are retitled, not left saying Activity", restored[0] === "Timeline",
    restored.join(" | "));
  const body = await page.textContent(".pane-body");
  check("the restored tab renders the Timeline, not 'Unknown view'",
    !body.includes("Unknown view"), body.slice(0, 60).replace(/\s+/g, " "));

  check("no console or page errors", errors.length === 0, errors.slice(0, 2).join(" || "));
  await page.screenshot({ path: "/tmp/timeline.png" });
} catch (err) {
  check(`threw: ${err.message}`, false);
  await page.screenshot({ path: "/tmp/timeline-fail.png" }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
