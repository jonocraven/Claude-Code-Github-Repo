// Brief 05 §4 — measured WCAG AA contrast check for dark mode.
//
// Loads the running dev server (npm run os) in both themes and asserts a
// 4.5:1 contrast ratio for every row in the brief's table. Elements are
// injected directly with the real class names rather than driven through
// app navigation, so the check exercises the actual CSS rules in
// tokens.css/shell.css without depending on workspace file data being
// present (the dev server here has no WORKSPACE_ROOT).
//
// Run: node scripts/contrast-check.mjs   (dev server must already be running)

import { chromium } from "playwright";

const URL = process.env.HEATON_URL ?? "http://127.0.0.1:5180/";

function srgbToLinear(c) {
  const cs = c / 255;
  return cs <= 0.04045 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function relLuminance([r, g, b]) {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/**
 * Chromium hands colours back in more than one notation: `rgb()`/`rgba()` for
 * ordinary values, but `color(srgb r g b / a)` with 0–1 channels once a
 * `color-mix()` is involved. Both have to be understood, or a check silently
 * reports "unparseable" for a colour that is perfectly measurable.
 */
function parseRgb(str) {
  const srgb = str.match(/color\(\s*srgb\s+([^)]+)\)/i);
  if (srgb) {
    const parts = srgb[1].split(/[\s/]+/).filter(Boolean).map(Number);
    return [parts[0] * 255, parts[1] * 255, parts[2] * 255];
  }
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`Could not parse color: ${str}`);
  const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
  return [parts[0], parts[1], parts[2]];
}

/** Alpha from either notation; 1 when none is present. */
function parseAlpha(str) {
  const srgb = str.match(/color\(\s*srgb\s+[^/)]+\/\s*([\d.]+)\s*\)/i);
  if (srgb) return Number(srgb[1]);
  const rgba = str.match(/rgba?\(([^)]+)\)/);
  const parts = rgba ? rgba[1].split(",") : [];
  return parts.length > 3 ? Number(parts[3]) : 1;
}

function contrastRatio(fg, bg) {
  const l1 = relLuminance(parseRgb(fg));
  const l2 = relLuminance(parseRgb(bg));
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

const ACCENTS = [
  "--accent-cookery-books",
  "--accent-wfdinner",
  "--accent-home",
  "--accent-house-move",
  "--accent-job-search",
  "--accent-finances",
  "--accent-side-hustle",
  "--accent-life-plan",
  "--accent-system",
];

async function measure(page) {
  return page.evaluate((accents) => {
    const rig = document.createElement("div");
    rig.id = "contrast-rig";
    rig.style.position = "fixed";
    rig.style.left = "-9999px";
    document.body.appendChild(rig);

    function el(tag, className, parent) {
      const e = document.createElement(tag);
      if (className) e.className = className;
      (parent ?? rig).appendChild(e);
      return e;
    }

    function color(node) {
      return getComputedStyle(node).color;
    }
    function bg(node) {
      return getComputedStyle(node).backgroundColor;
    }
    function tokenColor(name) {
      return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    const results = {};

    // --paper / --paper-deep grounds, read as rendered rgb() via a probe el.
    const paperProbe = el("div");
    paperProbe.style.color = "var(--paper)";
    const paperRgb = color(paperProbe);
    const paperDeepProbe = el("div");
    paperDeepProbe.style.color = "var(--paper-deep)";
    const paperDeepRgb = color(paperDeepProbe);

    results["--paper"] = paperRgb;
    results["--paper-deep"] = paperDeepRgb;

    // .reader-body body text — inherits from body { color: var(--ink) }.
    const reader = el("div", "reader-body");
    results["reader-body-vs-paper"] = { fg: color(reader), bg: paperRgb };

    // .sidebar-heading — real markup nests it in .sidebar (paper-deep ground).
    const sidebar = el("div", "sidebar");
    const heading = el("p", "sidebar-heading", sidebar);
    results["sidebar-heading-vs-paper-deep"] = { fg: color(heading), bg: paperDeepRgb };

    // .tree-meta
    const treeMeta = el("span", "tree-meta");
    results["tree-meta-vs-paper"] = { fg: color(treeMeta), bg: paperRgb };

    // .nav-label — colour comes from the ancestor .nav-item, sits on the
    // sidebar's --paper-deep ground.
    const navItem = el("div", "nav-item", sidebar);
    const navLabel = el("span", "nav-label", navItem);
    results["nav-label-vs-paper-deep"] = { fg: color(navLabel), bg: paperDeepRgb };

    // .palette-snippet
    const snippet = el("span", "palette-snippet");
    results["palette-snippet-vs-paper"] = { fg: color(snippet), bg: paperRgb };

    // Each accent as text, against --paper (the general reading ground —
    // this is how SearchPalette/ActivityWindow use accents as label colour).
    for (const name of accents) {
      const t = el("span");
      t.style.color = `var(${name})`;
      results[`accent-text:${name}`] = { fg: color(t), bg: paperRgb, token: tokenColor(name) };
    }

    // Each accent as a fill behind --paper text (the .task-pri-p1/p2
    // pattern: background: var(--accent-X); color: var(--paper)).
    for (const name of accents) {
      const f = el("div");
      f.style.background = `var(${name})`;
      f.style.color = "var(--paper)";
      results[`accent-fill:${name}`] = { fg: color(f), bg: bg(f) };
    }

    rig.remove();
    return results;
  }, ACCENTS);
}

async function setTheme(page, preference) {
  await page.addInitScript((pref) => {
    localStorage.setItem("heaton-os.theme.v1", pref);
  }, preference);
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  // Let React mount so the store's own apply() has run too.
  await page.waitForTimeout(300);
}

async function run() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const failures = [];
  const rows = [];

  for (const theme of ["light", "dark"]) {
    const page = await browser.newPage();
    await setTheme(page, theme);
    const measured = await measure(page);

    const checks = [
      ["`.reader-body` body text vs `--paper`", measured["reader-body-vs-paper"]],
      ["`.sidebar-heading` vs `--paper-deep`", measured["sidebar-heading-vs-paper-deep"]],
      ["`.tree-meta` vs `--paper`", measured["tree-meta-vs-paper"]],
      ["`.nav-label` vs `--paper-deep`", measured["nav-label-vs-paper-deep"]],
      ["`.palette-snippet` vs `--paper`", measured["palette-snippet-vs-paper"]],
    ];
    for (const [label, { fg, bg }] of checks) {
      const ratio = contrastRatio(fg, bg);
      const pass = ratio >= 4.5;
      rows.push({ theme, label, ratio, pass });
      if (!pass) failures.push(`${theme}: ${label} = ${ratio.toFixed(2)}:1`);
    }

    for (const name of ACCENTS) {
      const asText = measured[`accent-text:${name}`];
      const ratioText = contrastRatio(asText.fg, asText.bg);
      const passText = ratioText >= 4.5;
      rows.push({ theme, label: `${name} as text vs --paper`, ratio: ratioText, pass: passText });
      if (!passText) failures.push(`${theme}: ${name} as text vs --paper = ${ratioText.toFixed(2)}:1`);

      const asFill = measured[`accent-fill:${name}`];
      const ratioFill = contrastRatio(asFill.fg, asFill.bg);
      const passFill = ratioFill >= 4.5;
      rows.push({ theme, label: `${name} as fill behind --paper text`, ratio: ratioFill, pass: passFill });
      if (!passFill) failures.push(`${theme}: ${name} as fill behind --paper text = ${ratioFill.toFixed(2)}:1`);
    }

    // A scrim must always *darken* what is behind it. Deriving it from --ink
    // made it a lightening glare in dark mode, which is why this is measured
    // rather than eyeballed.
    //
    // Read back the *computed* colour of a real element, not the custom
    // property's text: a token may legitimately hold `color-mix(...)` or any
    // other syntax, and only the browser can resolve it to channels.
    const scrim = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.background = "var(--scrim)";
      const ground = document.createElement("div");
      ground.style.background = "var(--paper)";
      document.body.append(probe, ground);
      const out = {
        scrim: getComputedStyle(probe).backgroundColor,
        paper: getComputedStyle(ground).backgroundColor,
      };
      probe.remove();
      ground.remove();
      return out;
    });
    // Chromium leaves `color-mix()` unresolved at computed-value time, so a
    // scrim written that way cannot be measured here at all. That is not a
    // reason to skip the check — an unverifiable scrim fails, which is exactly
    // what the ink-derived version was.
    let darkens = false;
    let scrimRatio = 0;
    let scrimNote = "";
    try {
      const alpha = parseAlpha(scrim.scrim);
      const scrimRgb = parseRgb(scrim.scrim);
      const paperRgb = parseRgb(scrim.paper);
      const over = scrimRgb.map((c, i) => c * alpha + paperRgb[i] * (1 - alpha));
      darkens = relLuminance(over) < relLuminance(paperRgb);
      scrimRatio = (relLuminance(paperRgb) + 0.05) / (relLuminance(over) + 0.05);
    } catch {
      scrimNote = ` (unresolvable: ${scrim.scrim})`;
    }
    rows.push({
      theme,
      label: "--scrim darkens the ground behind a modal",
      ratio: scrimRatio,
      pass: darkens,
    });
    if (!darkens) {
      failures.push(`${theme}: --scrim does not darken the ground${scrimNote}`);
    }

    // And the boot screen must not flash a bright ground before a dark app.
    const boot = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.background = "var(--boot-ground)";
      probe.style.color = "var(--boot-ink)";
      document.body.appendChild(probe);
      const cs = getComputedStyle(probe);
      const out = { ground: cs.backgroundColor, ink: cs.color };
      probe.remove();
      return out;
    });
    const bootRatio = contrastRatio(boot.ink, boot.ground);
    rows.push({ theme, label: "boot screen ink vs its ground", ratio: bootRatio, pass: bootRatio >= 4.5 });
    if (bootRatio < 4.5) failures.push(`${theme}: boot screen = ${bootRatio.toFixed(2)}:1`);

    if (theme === "dark") {
      const bootIsDark = relLuminance(parseRgb(boot.ground)) < 0.5;
      rows.push({ theme, label: "boot screen stays dark in dark mode", ratio: 0, pass: bootIsDark });
      if (!bootIsDark) failures.push("dark: boot screen ground is light — it would flash on launch");
    }

    await page.close();
  }

  await browser.close();

  const pad = (s, n) => (s + " ".repeat(n)).slice(0, n);
  console.log(pad("Theme", 7), pad("Element", 46), pad("Ratio", 9), "Pass");
  console.log("-".repeat(7 + 46 + 9 + 6));
  for (const r of rows) {
    console.log(pad(r.theme, 7), pad(r.label, 46), pad(r.ratio.toFixed(2) + ":1", 9), r.pass ? "PASS" : "FAIL");
  }

  if (failures.length > 0) {
    console.error("\nFAILURES:");
    for (const f of failures) console.error(" - " + f);
    process.exitCode = 1;
  } else {
    console.log("\nAll rows pass 4.5:1.");
  }
}

run();
