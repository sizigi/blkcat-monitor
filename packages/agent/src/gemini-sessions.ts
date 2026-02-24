import { readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Scans ~/.gemini/tmp/<project_hash>/chats/ directories to find the most
 * recent Gemini session ID. Returns the session ID string or null if none found.
 */
export function findLatestGeminiSessionId(geminiDir: string): string | null {
  try {
    // geminiDir is ~/.gemini/tmp — scan all project hash dirs
    const projectDirs = readdirSync(geminiDir);
    let latestFile: string | null = null;
    let latestMtime = 0;

    for (const projectHash of projectDirs) {
      const chatsDir = join(geminiDir, projectHash, "chats");
      let files: string[];
      try {
        files = readdirSync(chatsDir);
      } catch {
        continue;
      }
      for (const file of files) {
        try {
          const filePath = join(chatsDir, file);
          const mtime = statSync(filePath).mtimeMs;
          if (mtime > latestMtime) {
            latestMtime = mtime;
            latestFile = file.replace(/\.[^.]+$/, "");
          }
        } catch {
          continue;
        }
      }
    }

    return latestFile;
  } catch {
    return null;
  }
}
