import { createServer } from "./server";
import { loadSavedAgents, saveAgents } from "./agents-store";

const port = parseInt(process.env.BLKCAT_PORT ?? "3000");
const hostname = process.env.BLKCAT_HOST;
const staticDir = process.env.BLKCAT_STATIC_DIR ?? new URL("../../web/dist", import.meta.url).pathname;
const agents = process.env.BLKCAT_AGENTS
  ? process.env.BLKCAT_AGENTS.split(",").map((s) => s.trim()).filter(Boolean)
  : undefined;

const savedAgents = await loadSavedAgents();

const server = createServer({
  port,
  hostname,
  staticDir,
  agents,
  onAgentsSaved: (addresses) => { saveAgents(addresses); },
});

// Connect saved agents (as "api" source so they continue to be persisted)
for (const address of savedAgents) {
  server.connectToAgent(address, "api");
}

console.log(`blkcat-monitor server listening on ${hostname ?? "0.0.0.0"}:${server.port}`);
if (agents?.length) {
  console.log(`Connecting to env agents: ${agents.join(", ")}`);
}
if (savedAgents.length) {
  console.log(`Restoring saved agents: ${savedAgents.join(", ")}`);
}
