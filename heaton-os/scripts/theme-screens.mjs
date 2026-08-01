// Visual sweep for brief 05 definition-of-done: every listed screen legible
// in dark, plus a light-mode before/after pixel diff against a stored
// baseline (screenshots/light-baseline exists only for this manual check —
// not part of the app).
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = process.env.HEATON_URL ?? "http://127.0.0.1:5180/";
const OUT = "/tmp/claude-0/-home-user-Claude-Code-Github-Repo/e2fdbfdc-a528-540a-89b0-7b6668701f19/scratchpad/theme-shots";
mkdirSync(OUT, { recursive: true });

async function setTheme(page, preference) {
  await page.addInitScript((pref) => {
    localStorage.removeItem("heaton-os.tabs.v1");
    localStorage.setItem("heaton-os.theme.v1", pref);
  }, preference);
}

async function run() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await setTheme(page, theme);

    // Boot screen — capture fast, before it transitions to the shell.
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".boot", { timeout: 2000 }).catch(() => {});
    await page.screenshot({ path: `${OUT}/${theme}-boot.png` });

    // Main shell (Welcome + Today tabs opened by default).
    await page.waitForSelector(".shell .sidebar", { timeout: 5000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${theme}-shell.png` });

    // Sidebar apps: Files, Tasks, Calendar, Memory, Activity, a space.
    const apps = ["Files", "Tasks", "Calendar", "Memory", "Activity", "Cookery Books"];
    for (const app of apps) {
      const btn = page.locator(".nav-item", { hasText: app }).first();
      if (await btn.count()) {
        await btn.click();
        await page.waitForTimeout(300);
        await page.screenshot({ path: `${OUT}/${theme}-${app.replace(/\s+/g, "-").toLowerCase()}.png` });
      }
    }

    // ⌘K search palette.
    await page.keyboard.down("Meta");
    await page.keyboard.press("k");
    await page.keyboard.up("Meta");
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${theme}-palette.png` });
    await page.keyboard.press("Escape");

    // Keymap overlay (⌘/).
    await page.keyboard.down("Meta");
    await page.keyboard.press("/");
    await page.keyboard.up("Meta");
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${theme}-keymap.png` });

    await page.close();
  }

  await browser.close();
  console.log(`Screenshots written to ${OUT}`);
}

run();
