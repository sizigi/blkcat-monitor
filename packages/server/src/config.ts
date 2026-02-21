import os from "os";
import path from "path";

const CONFIG_DIR = path.join(os.homedir(), ".blkcat");
const CONFIG_PATH = path.join(CONFIG_DIR, "server.json");

export interface ServerConfig {
  port: number;
  hostname?: string;
  staticDir?: string;
  skillsDir?: string;
  agents?: string[];
  notifyCommand?: string;
  notifyEnv?: Record<string, string>;
}

export async function loadServerConfig(): Promise<ServerConfig> {
  let file: Record<string, unknown> = {};
  try {
    const f = Bun.file(CONFIG_PATH);
    if (await f.exists()) {
      file = JSON.parse(await f.text());
    }
  } catch {}

  const defaultStaticDir = new URL("../../web/dist", import.meta.url).pathname;

  return {
    port: parseInt(env("BLKCAT_PORT") ?? str(file.port) ?? "3000"),
    hostname: env("BLKCAT_HOST") ?? str(file.hostname),
    staticDir: env("BLKCAT_STATIC_DIR") ?? str(file.staticDir) ?? defaultStaticDir,
    agents: env("BLKCAT_AGENTS")
      ? env("BLKCAT_AGENTS")!.split(",").map((s) => s.trim()).filter(Boolean)
      : strArray(file.agents),
    skillsDir: env("BLKCAT_SKILLS_DIR") ?? str(file.skillsDir),
    notifyCommand: env("BLKCAT_NOTIFY_CMD") ?? str(file.notifyCommand),
    notifyEnv: strRecord(file.notifyEnv),
  };
}

function env(key: string): string | undefined {
  return process.env[key];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function strRecord(v: unknown): Record<string, string> | undefined {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return undefined;
  const result: Record<string, string> = {};
  let found = false;
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === "string") { result[k] = val; found = true; }
  }
  return found ? result : undefined;
}

function strArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const result = v.filter((s): s is string => typeof s === "string");
  return result.length > 0 ? result : undefined;
}
