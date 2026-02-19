import os from "os";

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
}

export async function loadConfig(): Promise<AgentConfig> {
  const configPath = process.env.BLKCAT_CONFIG;
  let targets: TargetConfig[] = [{ type: "auto" }];

  if (configPath) {
    try {
      const file = Bun.file(configPath);
      const json = JSON.parse(await file.text());
      if (Array.isArray(json.targets)) targets = json.targets;
    } catch {}
  }

  const listenPortStr = process.env.BLKCAT_LISTEN_PORT;
  const listenPort = listenPortStr ? parseInt(listenPortStr) : undefined;

  return {
    serverUrl: process.env.BLKCAT_SERVER_URL ?? "ws://localhost:3000/ws/agent",
    machineId: process.env.BLKCAT_MACHINE_ID ?? os.hostname(),
    pollInterval: parseInt(process.env.BLKCAT_POLL_INTERVAL ?? "300"),
    targets,
    listenPort,
  };
}
