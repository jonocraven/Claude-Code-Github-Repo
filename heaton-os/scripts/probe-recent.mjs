/**
 * End-to-end probe for the state-derived /api/recent (brief 07).
 *
 * The unit suite for this brief asserts `activityFromTree` against a fixture
 * tree it builds itself — it never goes through `getState()` or
 * `WORKSPACE_ROOT`, so a break in how `recentActivity` is wired to app state
 * (as opposed to the derivation itself) could pass every unit test and still
 * be dead in the running app. This drives the actual server over HTTP
 * instead: boot it, change the workspace on disk, and see whether what the
 * route serves catches up. Modelled on scripts/probe-tree.mjs.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PORT = 4412;
const BASE = `http://127.0.0.1:${PORT}`;
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function recent(days = 14) {
  const res = await fetch(`${BASE}/api/recent?days=${days}`);
  if (!res.ok) throw new Error(`/api/recent ${res.status}`);
  return res.json();
}

function paths(body) {
  return body.activity.flatMap((day) => day.files.map((f) => f.path));
}

/** Poll until `check` passes or the budget runs out. Returns how long it took. */
async function until(check, budgetMs = 8000) {
  const started = Date.now();
  while (Date.now() - started < budgetMs) {
    try {
      if (await check()) return Date.now() - started;
    } catch {
      /* server still booting */
    }
    await sleep(200);
  }
  return null;
}

const root = await fs.mkdtemp(path.join(os.tmpdir(), "recent-probe-"));
await fs.cp(path.join(REPO, "fixtures", "sample-workspace"), root, { recursive: true });

// Bring every fixture file inside the 14-day window so the boot assertion
// below isn't at the mercy of whatever mtimes happen to already be on disk.
const now = new Date();
async function touchAll(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) await touchAll(abs);
    else if (entry.isFile()) await fs.utimes(abs, now, now);
  }
}
await touchAll(root);

const server = spawn("npx", ["tsx", "server/index.ts"], {
  cwd: REPO,
  env: { ...process.env, WORKSPACE_ROOT: root, PORT: String(PORT) },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
let log = "";
server.stdout.on("data", (d) => (log += d));
server.stderr.on("data", (d) => (log += d));

const results = [];
const check = (name, pass, detail = "") => {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

try {
  const booted = await until(async () => (await fetch(`${BASE}/api/health`)).ok, 30000);
  if (booted === null) {
    console.log("server never came up. log:\n" + log);
    process.exit(1);
  }

  // 1. The fixture's files come back within the 14-day window.
  const before = await recent(14);
  check(
    "boot: /api/recent?days=14 returns the fixture's files",
    paths(before).length > 0,
    `${paths(before).length} files`
  );

  // 2. THE ONE THAT MATTERS: a new file must reach the served activity feed.
  const NEW_REL = "Spaces/Home/probe-new-note.md";
  await fs.writeFile(path.join(root, NEW_REL), "# Probe\nA new note.\n", "utf8");
  const appeared = await until(async () => paths(await recent(14)).includes(NEW_REL));
  check("refresh: a new file reaches the served activity feed", appeared !== null, `after ${appeared}ms`);

  // 3. Deletion must also propagate.
  if (appeared !== null) {
    await fs.rm(path.join(root, NEW_REL));
    const vanished = await until(async () => !paths(await recent(14)).includes(NEW_REL));
    check("refresh: a deleted file leaves the served activity feed", vanished !== null, `after ${vanished}ms`);
  }

  // 4. The ignore convention still holds through the cached tree.
  await fs.writeFile(path.join(root, "Spaces/Home/Draft (ignore).md"), "# hidden\n", "utf8");
  await sleep(2500);
  const withIgnored = paths(await recent(14));
  check(
    "ignore: a file marked (ignore) never appears",
    !withIgnored.some((p) => p.includes("(ignore)")),
    withIgnored.filter((p) => p.includes("(ignore)")).join(", ") || "none present"
  );
} finally {
  try {
    process.kill(-server.pid, "SIGKILL");
  } catch {
    /* already gone */
  }
  await fs.rm(root, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
