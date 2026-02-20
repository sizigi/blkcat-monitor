import os from "os";
import path from "path";

const AGENTS_DIR = path.join(os.homedir(), ".blkcat");
const AGENTS_PATH = path.join(AGENTS_DIR, "agents.json");

export async function loadSavedAgents(): Promise<string[]> {
  try {
    const file = Bun.file(AGENTS_PATH);
    if (!(await file.exists())) return [];
    const json = JSON.parse(await file.text());
    if (Array.isArray(json.agents)) {
      return json.agents.filter((a: unknown) => typeof a === "string");
    }
    return [];
  } catch {
    return [];
  }
}

export async function saveAgents(addresses: string[]): Promise<void> {
  await Bun.write(AGENTS_PATH, JSON.stringify({ agents: addresses }, null, 2) + "\n");
}
