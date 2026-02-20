import { createServer } from "./server";
import { loadSavedAgents, saveAgents } from "./agents-store";
import { loadServerConfig } from "./config";

const config = await loadServerConfig();
const savedAgents = await loadSavedAgents();

const server = createServer({
  port: config.port,
  hostname: config.hostname,
  staticDir: config.staticDir,
  agents: config.agents,
  onAgentsSaved: (addresses) => { saveAgents(addresses); },
  notifyCommand: config.notifyCommand,
  notifyEnv: config.notifyEnv,
});

// Connect saved agents (as "api" source so they continue to be persisted)
for (const address of savedAgents) {
  server.connectToAgent(address, "api");
}

console.log(`blkcat-monitor server listening on ${config.hostname ?? "0.0.0.0"}:${server.port}`);
if (config.agents?.length) {
  console.log(`Connecting to agents: ${config.agents.join(", ")}`);
}
if (savedAgents.length) {
  console.log(`Restoring saved agents: ${savedAgents.join(", ")}`);
}
if (config.notifyCommand) {
  console.log(`Notify command: ${config.notifyCommand}`);
}
