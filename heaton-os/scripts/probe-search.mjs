/**
 * Browser verification of the Search surface.
 *
 * Run the app (`npm run os`) and then `npm run probe:search`. Point it
 * elsewhere with PROBE_URL if the dev server took a different port.
 *
 * The store tests cover the tab lifecycle and the server tests cover ranking,
 * but the thing this feature actually promises — that a search you can work
 * *from* survives opening a result — lives entirely in the wiring between
 * them, and neither suite can see it. Brief 03 shipped a rail that never
 * highlighted for exactly that reason.
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

await page.goto(URL, { waitUntil: "networkidle" });
// Start from a clean workspace so a saved layout can't mask the behaviour.
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1500);

const tabTitles = () =>
  page.$$eval(".doctab-title", (els) => els.map((e) => e.textContent.trim()));

try {
  // 1. The dock entry that previously did nothing must now open the window.
  const searchNav = page.locator(".nav-list .nav-label", { hasText: /^Search$/ }).first();
  await searchNav.click();
  await page.waitForTimeout(600);
  check(
    "clicking Search in the System list opens the window",
    await page.locator(".searchw-input").isVisible()
  );

  // 2. A query returns grouped results.
  await page.fill(".searchw-input", "mortgage");
  await page.waitForTimeout(900);
  const groups = await page.$$eval(".searchw-group-head", (els) =>
    els.map((e) => e.textContent.replace(/\s+/g, " ").trim())
  );
  check("results group by space", groups.length > 0, groups.join(" | "));
  const count = await page.locator(".searchw-count").textContent();
  check("the count states the shape of the result set", /match/.test(count), count.trim());

  // 3. The tab title tracks the query — the only place it is visible once a
  //    result is open on top.
  check(
    "the tab title carries the query",
    (await tabTitles()).some((t) => t.includes("mortgage")),
    (await tabTitles()).join(" | ")
  );

  // 4. THE ONE THAT MATTERS: opening a result must not destroy the search.
  const rowCount = await page.locator(".sr-open").count();
  check("rows rendered", rowCount > 0, `${rowCount} rows`);
  await page.locator(".sr-open").first().click();
  await page.waitForTimeout(900);
  const after = await tabTitles();
  check(
    "opening a result leaves the search tab standing",
    after.some((t) => t.includes("mortgage")) && after.length >= 2,
    after.join(" | ")
  );

  // 5. And you can get back to it, with the query intact.
  await page.locator(".doctab-open", { hasText: /Search:/ }).first().click();
  await page.waitForTimeout(600);
  check(
    "returning to the search finds the query still there",
    (await page.inputValue(".searchw-input")) === "mortgage"
  );

  // 6. Filename search reaches a non-markdown file the index cannot read.
  await page.fill(".searchw-input", "print");
  await page.waitForTimeout(900);
  const names = await page.$$eval(".sr-title", (els) => els.map((e) => e.textContent.trim()));
  check(
    "a non-markdown file is findable by name",
    names.some((n) => /\.(csv|pdf|png|jpg)$/i.test(n)),
    names.join(" | ") || "no rows"
  );

  // 7. Space filter narrows it.
  await page.fill(".searchw-input", "mortgage");
  await page.waitForTimeout(900);
  const beforeFilter = await page.locator(".sr-open").count();
  await page.locator(".searchw-filters .palette-chip", { hasText: "Finances" }).click();
  await page.waitForTimeout(900);
  const afterFilter = await page.locator(".sr-open").count();
  check(
    "a space chip narrows the set",
    afterFilter < beforeFilter,
    `${beforeFilter} → ${afterFilter}`
  );
  await page.locator(".searchw-filters .palette-chip", { hasText: "All" }).click();
  await page.waitForTimeout(700);

  // 8. Keyboard: arrow keys move a highlight through the flat ordering.
  await page.locator(".searchw-input").focus();
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(250);
  check("ArrowDown highlights a row", (await page.locator(".sr-row.is-active").count()) === 1);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(250);
  check(
    "ArrowDown moves the highlight rather than adding one",
    (await page.locator(".sr-row.is-active").count()) === 1
  );

  // 9. The query survives a reload — the thing that makes it a document.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  check(
    "the query survives a reload",
    (await page.inputValue(".searchw-input")) === "mortgage",
    await page.inputValue(".searchw-input")
  );

  // 10. The palette hand-off: ⌘K → "see all results" lands in the window.
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(500);
  const paletteUp = await page.locator(".palette-input").isVisible().catch(() => false);
  if (!paletteUp) {
    await page.keyboard.press("Control+k");
    await page.waitForTimeout(500);
  }
  check("⌘K opens the palette", await page.locator(".palette-input").isVisible());
  await page.fill(".palette-input", "mortgage");
  await page.waitForTimeout(900);
  await page.locator(".palette-row", { hasText: "See all results" }).click();
  await page.waitForTimeout(900);
  check(
    "the palette hands the query to the window",
    (await page.inputValue(".searchw-input").catch(() => "")) === "mortgage"
  );

  // 11. Nothing broke on the way.
  check("no console or page errors", errors.length === 0, errors.slice(0, 3).join(" || "));

  await page.screenshot({ path: "/tmp/search-window.png", fullPage: false });
} catch (err) {
  check(`threw: ${err.message}`, false);
  await page.screenshot({ path: "/tmp/search-fail.png" }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
