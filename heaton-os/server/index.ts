import Fastify from "fastify";
import websocket from "@fastify/websocket";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { execFile } from "node:child_process";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { HOST, PORT, WORKSPACE_ROOT } from "./config.js";
import { buildTree } from "./tree.js";
import { safeAbsolute } from "./paths.js";
import { renderMarkdown } from "./markdown.js";
import { getState, initState, onChange } from "./state.js";
import { searchKeyword } from "./search.js";
import { searchSemantic, semanticStatus } from "./semantic.js";
import { memoryHealth } from "./memory.js";
import { recentActivity } from "./recent.js";
import { scheduledMonth } from "./scheduled.js";
import { completeTask, plate, sectionTasks } from "./todoist.js";

// Model downloads etc. respect HTTPS_PROXY when one is configured; a no-op
// otherwise. Fetches happen only at first semantic-index build.
setGlobalDispatcher(new EnvHttpProxyAgent());

const app = Fastify({ logger: false });
await app.register(websocket);

// Live-update channel (brief §2.2): every connected client is told which
// workspace paths changed so open windows can refetch. Kept trivially small —
// the client decides what to reload.
const sockets = new Set<import("@fastify/websocket").WebSocket>();
onChange((paths) => {
  const message = JSON.stringify({ type: "change", paths });
  for (const ws of sockets) {
    if (ws.readyState === ws.OPEN) ws.send(message);
  }
});

app.get("/api/live", { websocket: true }, (socket) => {
  sockets.add(socket);
  socket.on("close", () => sockets.delete(socket));
  socket.on("error", () => sockets.delete(socket));
});

const IMAGE_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

const RAW_EXT: Record<string, string> = {
  ...IMAGE_EXT,
  pdf: "application/pdf",
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  sh: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
};

function extOf(p: string): string {
  return p.split(".").pop()?.toLowerCase() ?? "";
}

function badPath(reply: { status: (n: number) => { send: (b: unknown) => unknown } }) {
  return reply.status(400).send({ error: "bad_path" });
}

app.get("/api/health", async () => ({
  ok: true,
  workspaceRoot: WORKSPACE_ROOT,
  workspaceFound: fs.existsSync(WORKSPACE_ROOT),
  semantic: semanticStatus(),
}));

app.get("/api/tree", async (_req, reply) => {
  if (!fs.existsSync(WORKSPACE_ROOT)) {
    return reply.status(503).send({
      error: "workspace_not_found",
      message: `WORKSPACE_ROOT does not exist: ${WORKSPACE_ROOT}. Set it in .env.`,
    });
  }
  return buildTree(WORKSPACE_ROOT);
});

app.get<{ Querystring: { path?: string } }>("/api/file", async (req, reply) => {
  const rel = req.query.path ?? "";
  const abs = safeAbsolute(rel);
  if (!abs) return badPath(reply);

  let stat;
  try {
    stat = await fsp.stat(abs);
  } catch {
    return reply.status(404).send({ error: "not_found", path: rel });
  }
  if (!stat.isFile()) return badPath(reply);

  const name = rel.split("/").pop()!;
  const ext = extOf(name);
  const meta = {
    path: rel,
    name,
    ext,
    size: stat.size,
    modified: stat.mtime.toISOString(),
  };

  if (ext === "md") {
    const source = await fsp.readFile(abs, "utf8");
    const rendered = renderMarkdown(source, rel, getState().corpus.files);
    // `source` feeds the CodeMirror editor; `modified` is the edit baseline.
    return { kind: "markdown", ...meta, source, ...rendered };
  }
  if (ext === "csv") {
    return { kind: "csv", ...meta, text: await fsp.readFile(abs, "utf8") };
  }
  if (ext in IMAGE_EXT) return { kind: "image", ...meta };
  if (ext === "pdf") return { kind: "pdf", ...meta };
  if (ext === "html" || ext === "htm") return { kind: "html", ...meta };
  return { kind: "other", ...meta };
});

// The entire write surface of the app (brief §6/§11): save an edited .md.
// Only existing markdown, atomic temp+rename so Drive sync sees one event,
// and a 409 if the file changed on disk since the editor loaded it.
app.put<{ Querystring: { path?: string }; Body: { content?: string; baseModified?: string } }>(
  "/api/file",
  async (req, reply) => {
    const rel = req.query.path ?? "";
    const abs = safeAbsolute(rel);
    if (!abs || extOf(rel) !== "md") return badPath(reply);
    if (typeof req.body?.content !== "string") {
      return reply.status(400).send({ error: "missing_content" });
    }

    let stat;
    try {
      stat = await fsp.stat(abs);
    } catch {
      return reply.status(404).send({ error: "not_found", path: rel });
    }
    if (!stat.isFile()) return badPath(reply);

    // Drive-clobber guard: refuse if the file moved under us (§10).
    const current = stat.mtime.toISOString();
    if (req.body.baseModified && req.body.baseModified !== current) {
      return reply.status(409).send({
        error: "conflict",
        message: "This file changed on disk since you opened it.",
        currentModified: current,
      });
    }

    const dir = abs.slice(0, abs.lastIndexOf("/"));
    const tmp = `${dir}/.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
    try {
      await fsp.writeFile(tmp, req.body.content, "utf8");
      await fsp.rename(tmp, abs);
    } catch (err) {
      await fsp.rm(tmp, { force: true }).catch(() => undefined);
      return reply.status(500).send({ error: "write_failed", message: (err as Error).message });
    }
    const after = await fsp.stat(abs);
    return { ok: true, path: rel, modified: after.mtime.toISOString() };
  }
);

// Streams binaries for the viewers — never buffered whole (brief §10).
app.get<{ Querystring: { path?: string } }>("/api/raw", async (req, reply) => {
  const rel = req.query.path ?? "";
  const abs = safeAbsolute(rel);
  if (!abs) return badPath(reply);
  if (!fs.existsSync(abs)) return reply.status(404).send({ error: "not_found" });

  const type = RAW_EXT[extOf(rel)];
  if (!type) return reply.status(415).send({ error: "unsupported_type" });
  reply.header("content-type", type);
  return reply.send(fs.createReadStream(abs));
});

app.get<{ Querystring: { path?: string } }>("/api/backlinks", async (req, reply) => {
  const rel = req.query.path ?? "";
  if (!safeAbsolute(rel)) return badPath(reply);
  return { path: rel, backlinks: getState().backlinks.get(rel) ?? [] };
});

app.get<{ Querystring: { q?: string; space?: string } }>(
  "/api/search",
  async (req) => {
    const q = (req.query.q ?? "").trim();
    const space = req.query.space || null;
    if (!q) return { keyword: [], semantic: [], semanticStatus: semanticStatus() };

    const { search, corpus } = getState();
    const keyword = searchKeyword(search, corpus, q, space);
    const seen = new Set(keyword.map((k) => k.path));
    const semantic = (await searchSemantic(q, space)).filter(
      (s) => !seen.has(s.path)
    );
    return { keyword, semantic, semanticStatus: semanticStatus() };
  }
);

function openWith(args: string[], reply: { send: (b: unknown) => unknown }) {
  const cmd = process.platform === "darwin" ? "open" : "xdg-open";
  execFile(cmd, args, (err) => {
    // Response already sent; failures land in the server log only.
    if (err) console.error(`${cmd} failed:`, err.message);
  });
  return reply.send({ ok: true });
}

app.post<{ Querystring: { path?: string } }>("/api/reveal", async (req, reply) => {
  const abs = safeAbsolute(req.query.path ?? "");
  if (!abs) return badPath(reply);
  return process.platform === "darwin"
    ? openWith(["-R", abs], reply)
    : openWith([abs.substring(0, abs.lastIndexOf("/"))], reply);
});

app.post<{ Querystring: { path?: string } }>("/api/open", async (req, reply) => {
  const abs = safeAbsolute(req.query.path ?? "");
  if (!abs) return badPath(reply);
  return openWith([abs], reply);
});

// --- Phase 4: system-app data -------------------------------------------

app.get("/api/memory-health", async () => memoryHealth());

app.get<{ Querystring: { days?: string } }>("/api/recent", async (req) => {
  const days = Math.min(Math.max(Number(req.query.days) || 14, 1), 90);
  return { days, activity: await recentActivity(days) };
});

app.get<{ Querystring: { year?: string; month?: string } }>(
  "/api/scheduled",
  async (req) => {
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const month = Number(req.query.month) || now.getMonth() + 1;
    return { year, month, events: await scheduledMonth(year, month) };
  }
);

app.get("/api/todoist/plate", async () => plate());

app.get<{ Querystring: { space?: string } }>(
  "/api/todoist/space",
  async (req, reply) => {
    const space = req.query.space ?? "";
    if (!space) return badPath(reply);
    return sectionTasks(space);
  }
);

app.post<{ Querystring: { id?: string } }>(
  "/api/todoist/complete",
  async (req, reply) => {
    const id = req.query.id ?? "";
    if (!id) return badPath(reply);
    try {
      return await completeTask(id);
    } catch (err) {
      return reply
        .status(502)
        .send({ ok: false, error: (err as Error).message });
    }
  }
);

async function start() {
  if (fs.existsSync(WORKSPACE_ROOT)) {
    const { files, docs } = await initState();
    console.log(`Indexed ${files} files (${docs} markdown docs)`);
  } else {
    console.warn(`WORKSPACE_ROOT missing: ${WORKSPACE_ROOT}`);
  }
  await app.listen({ host: HOST, port: PORT });
  console.log(`Heaton OS server on http://${HOST}:${PORT}`);
  console.log(`Workspace: ${WORKSPACE_ROOT}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
