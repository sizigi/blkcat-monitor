import { createServer } from "./server";

const port = parseInt(process.env.BLKCAT_PORT ?? "3000");
const hostname = process.env.BLKCAT_HOST;
const staticDir = process.env.BLKCAT_STATIC_DIR ?? new URL("../../web/dist", import.meta.url).pathname;
const agents = process.env.BLKCAT_AGENTS
  ? process.env.BLKCAT_AGENTS.split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;

const server = createServer({ port, hostname, staticDir, agents });
console.log(`blkcat-monitor server listening on ${hostname ?? "0.0.0.0"}:${server.port}`);
if (agents?.length) {
  console.log(`Connecting to agents: ${agents.join(", ")}`);
}
