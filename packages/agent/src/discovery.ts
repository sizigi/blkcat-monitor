import { type ExecFn, bunExec } from "./capture";
import type { SessionInfo } from "@blkcat/shared";

const CLI_COMMANDS = new Set(["claude", "codex"]);

export function discoverCliSessions(exec: ExecFn = bunExec): SessionInfo[] {
  const result = exec([
    "tmux", "list-panes", "-a",
    "-F", "#{session_name}:#{window_index}.#{pane_index}\t#{session_name}\t#{pane_current_command}",
  ]);
  if (!result.success) return [];

  const found: SessionInfo[] = [];
  for (const line of result.stdout.trim().split("\n")) {
    if (!line) continue;
    const [paneId, sessionName, cmd] = line.split("\t");
    if (CLI_COMMANDS.has(cmd)) {
      found.push({ id: paneId, name: sessionName, target: "local", cliTool: cmd as "claude" | "codex" });
    }
  }

  return found;
}
