/**
 * End-to-end probe for the cached /api/tree (brief 06).
 *
 * The suite for that work mirrors `incrementalUpdate` inside the test file
 * rather than calling the real one, so deleting the refresh line in
 * server/state.ts leaves every test green. This drives the actual server over
 * HTTP instead: boot it, change the workspace on disk, and see whether what the
 * route serves catches up.
 */
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const PORT = 4411;
const BASE = `http://127.0.0.1:${PORT}`;
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function walk(node, out = []) {
  if (node.type === "file") out.push(node.path);
  for (const c of node.children ?? []) walk(c, out);
  return out;
}

function findDir(node, rel) {
  if (node.type === "dir" && node.path === rel) return node;
  for (const c of node.children ?? []) {
    const hit = findDir(c, rel);
    if (hit) return hit;
  }
  return null;
}

async function tree() {
  const res = await fetch(`${BASE}/api/tree`);
  if (!res.ok) throw new Error(`/api/tree ${res.status}`);
  return res.json();
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

const root = await fs.mkdtemp(path.join(os.tmpdir(), "tree-probe-"));
await fs.cp(path.join(REPO, "fixtures", "sample-workspace"), root, { recursive: true });

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

  // 1. The cached tree matches the workspace on disk at boot.
  const before = walk(await tree());
  check("boot: tree served", before.length > 0, `${before.length} files`);

  // 2. Serving from cache should be fast and, more importantly, stable —
  //    two consecutive reads must be identical objects by value.
  const t0 = Date.now();
  const a = await tree();
  const spanA = Date.now() - t0;
  const b = await tree();
  check(
    "cached: two consecutive reads agree",
    JSON.stringify(a) === JSON.stringify(b),
    `${spanA}ms per read`
  );

  // 3. THE ONE THAT MATTERS: a new file must reach the served tree.
  const NEW_REL = "Spaces/Home/probe-new-note.md";
  await fs.writeFile(path.join(root, NEW_REL), "# Probe\nA new note.\n", "utf8");
  const appeared = await until(async () => walk(await tree()).includes(NEW_REL));
  check("refresh: a new file reaches the served tree", appeared !== null, `after ${appeared}ms`);

  // 4. Ancestor rollups must move with it, which is the half a surgical patch
  //    would get wrong.
  if (appeared !== null) {
    const dir = findDir(await tree(), "Spaces/Home");
    const dirBefore = findDir(a, "Spaces/Home");
    check(
      "refresh: ancestor fileCount rolled up",
      dir.fileCount === dirBefore.fileCount + 1,
      `${dirBefore.fileCount} → ${dir.fileCount}`
    );
    check(
      "refresh: ancestor latestModified moved",
      dir.latestModified > dirBefore.latestModified,
      `${dirBefore.latestModified} → ${dir.latestModified}`
    );
  }

  // 5. Deletion must also propagate — a cache that only ever grows is a
  //    different bug wearing the same clothes. Only meaningful if the add
  //    landed: otherwise "it is absent" is trivially true and the check
  //    reports a pass while the feature is dead.
  if (appeared !== null) {
    await fs.rm(path.join(root, NEW_REL));
    const vanished = await until(async () => !walk(await tree()).includes(NEW_REL));
    check("refresh: a deleted file leaves the served tree", vanished !== null, `after ${vanished}ms`);
  }

  // 6. The ignore convention still holds through the cache, for a *file*.
  await fs.writeFile(path.join(root, "Spaces/Home/Draft (ignore).md"), "# hidden\n", "utf8");
  await sleep(2500);
  const withIgnored = walk(await tree());
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
