import { readdirSync } from "fs";
import { join } from "path";

/**
 * Scans ~/.codex/sessions/YYYY/MM/DD/ directories to find the most recent
 * Codex session ID. Returns the session ID string or null if none found.
 */
export function findLatestCodexSessionId(sessionsDir: string): string | null {
  try {
    const years = readdirSync(sessionsDir).filter(d => /^\d{4}$/.test(d)).sort().reverse();
    for (const year of years) {
      const yearPath = join(sessionsDir, year);
      const months = readdirSync(yearPath).filter(d => /^\d{2}$/.test(d)).sort().reverse();
      for (const month of months) {
        const monthPath = join(yearPath, month);
        const days = readdirSync(monthPath).filter(d => /^\d{2}$/.test(d)).sort().reverse();
        for (const day of days) {
          const dayPath = join(monthPath, day);
          const files = readdirSync(dayPath).sort().reverse();
          if (files.length > 0) {
            const name = files[0].replace(/\.[^.]+$/, "");
            // Extract UUID from filename (format: rollout-YYYY-MM-DDThh-mm-ss-UUID)
            const uuidMatch = name.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
            return uuidMatch ? uuidMatch[1] : name;
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
