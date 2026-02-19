import { type ExecFn, bunExec } from "./capture";
import type { SessionInfo } from "@blkcat/shared";

export function discoverClaudeSessions(exec: ExecFn = bunExec): SessionInfo[] {
  const result = exec([
    "tmux", "list-panes", "-a",
    "-F", "#{session_name}:#{window_index}.#{pane_index}\t#{session_name}\t#{pane_current_command}",
  ]);
  if (!result.success) return [];

  const found: SessionInfo[] = [];
  for (const line of result.stdout.trim().split("\n")) {
    if (!line) continue;
    const [paneId, sessionName, cmd] = line.split("\t");
    if (cmd === "claude") {
      found.push({ id: paneId, name: sessionName, target: "local" });
    }
  }

  return found;
}
