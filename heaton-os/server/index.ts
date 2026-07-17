import Fastify from "fastify";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { execFile } from "node:child_process";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import { HOST, PORT, WORKSPACE_ROOT } from "./config.js";
import { buildTree } from "./tree.js";
import { safeAbsolute } from "./paths.js";
import { renderMarkdown } from "./markdown.js";
import { getState, initState } from "./state.js";
import { searchKeyword } from "./search.js";
import { searchSemantic, semanticStatus } from "./semantic.js";

// Model downloads etc. respect HTTPS_PROXY when one is configured; a no-op
// otherwise. Fetches happen only at first semantic-index build.
setGlobalDispatcher(new EnvHttpProxyAgent());

const app = Fastify({ logger: false });

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
    return { kind: "markdown", ...meta, ...rendered };
  }
  if (ext === "csv") {
    return { kind: "csv", ...meta, text: await fsp.readFile(abs, "utf8") };
  }
  if (ext in IMAGE_EXT) return { kind: "image", ...meta };
  if (ext === "pdf") return { kind: "pdf", ...meta };
  if (ext === "html" || ext === "htm") return { kind: "html", ...meta };
  return { kind: "other", ...meta };
});

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
