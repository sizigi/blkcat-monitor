import os from "os";
import path from "path";
import type { View } from "@blkcat/shared";

const DIR = path.join(os.homedir(), ".blkcat");
const FILE_PATH = path.join(DIR, "views.json");

export async function loadViews(): Promise<View[]> {
  try {
    const file = Bun.file(FILE_PATH);
    if (!(await file.exists())) return [];
    const json = JSON.parse(await file.text());
    if (Array.isArray(json.views)) {
      return json.views.filter(
        (v: any) => v && typeof v.id === "string" && typeof v.name === "string" && Array.isArray(v.panes),
      );
    }
    return [];
  } catch {
    return [];
  }
}

export async function saveViews(views: View[]): Promise<void> {
  await Bun.write(FILE_PATH, JSON.stringify({ views }, null, 2) + "\n");
}
