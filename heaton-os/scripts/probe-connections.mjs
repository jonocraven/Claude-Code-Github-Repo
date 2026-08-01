/**
 * Browser verification of the Connections surface.
 *
 * groupSeams and ageInDays are unit-tested; the endpoint has its own suite.
 * What neither can see is whether the window actually renders the graph, and
 * whether a seam's evidence opens when you ask for it.
 *
 * Run the app, then: npm run probe:connections   (PROBE_URL to override)
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
  await page.waitForSelector(".nav-list .nav-label", { timeout: 15000 });

  const nav = await page.$$eval(".nav-list .nav-label", (e) => e.map((x) => x.textContent.trim()));
  check("Connections is in the System list", nav.includes("Connections"), nav.join(" | "));

  await page.locator(".nav-list .nav-label", { hasText: /^Connections$/ }).first().click();
  await page.waitForSelector(".cx", { timeout: 15000 });
  await page.waitForTimeout(1000);

  // The endpoint is the oracle: whatever it returns must be what is on screen.
  const api = await page.evaluate(() => fetch("/api/connections").then((r) => r.json()));

  const seamHeads = await page.locator(".cx-seam").count();
  const expectedSeams = new Set(
    api.crossLinks.map((l) => [l.sourceSpace, l.targetSpace].sort().join("::"))
  ).size;
  check("every seam in the graph is on screen", seamHeads === expectedSeams,
    `${seamHeads} rendered vs ${expectedSeams} expected`);

  const rows = await page.locator(".cx-row").count();
  check("hubs and orphans are on screen", rows === api.hubs.length + api.orphans.length,
    `${rows} rendered vs ${api.hubs.length + api.orphans.length} expected`);

  const tableRows = await page.locator(".cx-tr").count();
  check("the per-space table has a row per space plus a header",
    tableRows === api.spaces.length + 1, `${tableRows} vs ${api.spaces.length + 1}`);

  // A seam's evidence is folded away; asking for it must produce the links.
  if (seamHeads > 0) {
    check("a seam's links are hidden until asked for",
      (await page.locator(".cx-links").count()) === 0);
    await page.locator(".cx-seam-head").first().click();
    await page.waitForTimeout(400);
    const links = await page.locator(".cx-link").count();
    check("expanding a seam shows its links", links > 0, `${links} links`);

    // And they open the document.
    const before = await page.$$eval(".doctab-title", (e) => e.length);
    await page.locator(".cx-link").first().click();
    await page.waitForTimeout(900);
    const after = await page.$$eval(".doctab-title", (e) => e.map((x) => x.textContent.trim()));
    check("a seam link opens its document", after.length > before, after.join(" | "));
    check("opening it leaves Connections standing", after.includes("Connections"),
      after.join(" | "));
  }

  // Bullets are opted out per list in this app, so a new list silently gets
  // them back. Caught exactly that here on the first run.
  const bulleted = await page.evaluate(() =>
    [...document.querySelectorAll(".cx ul")]
      .filter((ul) => getComputedStyle(ul).listStyleType !== "none")
      .map((ul) => ul.className)
  );
  check("no list is rendering bullets", bulleted.length === 0, bulleted.join(", "));

  check("no console or page errors", errors.length === 0, errors.slice(0, 2).join(" || "));
  await page.screenshot({ path: "/tmp/connections.png" });
} catch (err) {
  check(`threw: ${err.message}`, false);
  await page.screenshot({ path: "/tmp/connections-fail.png" }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
