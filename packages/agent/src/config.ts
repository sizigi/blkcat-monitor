import os from "os";
import path from "path";

export interface TargetConfig {
  type: "auto" | "local" | "ssh";
  session?: string;
  host?: string;
  key?: string;
}

export interface AgentConfig {
  serverUrl: string;
  machineId: string;
  pollInterval: number;
  targets: TargetConfig[];
  listenPort?: number;
  hooksPort: number;
  authToken?: string;
}

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), ".blkcat", "agent.json");

export async function loadConfig(): Promise<AgentConfig> {
  // Load config file: BLKCAT_CONFIG env var, or default ~/.blkcat/agent.json
  let file: Record<string, unknown> = {};
  const configPath = process.env.BLKCAT_CONFIG ?? DEFAULT_CONFIG_PATH;
  try {
    const f = Bun.file(configPath);
    if (await f.exists()) {
      file = JSON.parse(await f.text());
    }
  } catch {}

  const targets: TargetConfig[] = Array.isArray(file.targets) ? file.targets : [{ type: "auto" }];

  const listenPortStr = process.env.BLKCAT_LISTEN_PORT;
  const listenPort = listenPortStr ? parseInt(listenPortStr) : num(file.listenPort);

  return {
    serverUrl: process.env.BLKCAT_SERVER_URL ?? str(file.serverUrl) ?? "ws://localhost:3000/ws/agent",
    machineId: process.env.BLKCAT_MACHINE_ID ?? str(file.machineId) ?? os.hostname(),
    pollInterval: parseInt(process.env.BLKCAT_POLL_INTERVAL ?? String(num(file.pollInterval) ?? 150)),
    targets,
    listenPort,
    hooksPort: parseInt(process.env.BLKCAT_HOOKS_PORT ?? String(num(file.hooksPort) ?? 3001)),
    authToken: process.env.BLKCAT_AUTH_TOKEN ?? str(file.authToken),
  };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === "number" && !isNaN(v)) return v;
  return undefined;
}
