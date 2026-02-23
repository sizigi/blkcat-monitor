import os from "os";
import path from "path";

const DIR = path.join(os.homedir(), ".blkcat");
const FILE_PATH = path.join(DIR, "display-names.json");

export interface DisplayNames {
  machines: Record<string, string>;
  sessions: Record<string, string>;
}

export async function loadDisplayNames(): Promise<DisplayNames> {
  try {
    const file = Bun.file(FILE_PATH);
    if (!(await file.exists())) return { machines: {}, sessions: {} };
    const json = JSON.parse(await file.text());
    return {
      machines: json.machines && typeof json.machines === "object" ? json.machines : {},
      sessions: json.sessions && typeof json.sessions === "object" ? json.sessions : {},
    };
  } catch {
    return { machines: {}, sessions: {} };
  }
}

export async function saveDisplayNames(names: DisplayNames): Promise<void> {
  await Bun.write(FILE_PATH, JSON.stringify(names, null, 2) + "\n");
}
