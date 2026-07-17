import Fastify from "fastify";
import fs from "node:fs";
import { HOST, PORT, WORKSPACE_ROOT } from "./config.js";
import { buildTree } from "./tree.js";

const app = Fastify({ logger: false });

app.get("/api/health", async () => ({
  ok: true,
  workspaceRoot: WORKSPACE_ROOT,
  workspaceFound: fs.existsSync(WORKSPACE_ROOT),
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

app
  .listen({ host: HOST, port: PORT })
  .then(() => {
    console.log(`Heaton OS server on http://${HOST}:${PORT}`);
    console.log(`Workspace: ${WORKSPACE_ROOT}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
