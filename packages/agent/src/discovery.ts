import { type ExecFn, bunExec } from "./capture";
import type { SessionInfo, CliTool } from "@blkcat/shared";

const CLI_COMMANDS = new Set(["claude", "codex", "gemini"]);

// Process names that may host CLI tools (e.g., codex/gemini run as node scripts)
const HOST_RUNTIMES = new Set(["node", "MainThread"]);

/**
 * Check if a node/MainThread pane is actually running a known CLI tool
 * by inspecting the child process command line via `ps --ppid <pid>`.
 */
function resolveNodeCliTool(panePid: string, exec: ExecFn): CliTool | null {
  const result = exec(["ps", "--ppid", panePid, "-o", "args", "--no-headers"]);
  if (!result.success) return null;
  for (const line of result.stdout.trim().split("\n")) {
    if (!line) continue;
    // Check each path segment of the args for a known CLI command name
    // e.g., "node /path/to/bin/codex --full-auto" → match "codex"
    for (const tool of CLI_COMMANDS) {
      if (line.includes(`/${tool}`) || line.startsWith(`${tool} `) || line === tool) {
        return tool as CliTool;
      }
    }
  }
  return null;
}

export function discoverCliSessions(exec: ExecFn = bunExec): SessionInfo[] {
  return discoverAllSessions(exec).filter((s) => !!s.cliTool);
}

export function discoverAllSessions(exec: ExecFn = bunExec): SessionInfo[] {
  const result = exec([
    "tmux", "list-panes", "-a",
    "-F", "#{session_name}:#{window_index}.#{pane_index}\t#{session_name}\t#{pane_current_command}\t#{pane_pid}\t#{pane_id}\t#{window_name}",
  ]);
  if (!result.success) return [];

  const found: SessionInfo[] = [];
  const seenPaneIds = new Set<string>();
  for (const line of result.stdout.trim().split("\n")) {
    if (!line) continue;
    const [paneId, sessionName, cmd, panePid, tmuxPaneId, windowName] = line.split("\t");
    // Deduplicate: tmux grouped sessions list the same physical pane
    // under multiple session names (e.g., "1:2.0" and "1-2:2.0").
    // #{pane_id} (e.g., %0) is unique per physical pane.
    if (tmuxPaneId && seenPaneIds.has(tmuxPaneId)) continue;
    if (tmuxPaneId) seenPaneIds.add(tmuxPaneId);

    let cliTool: CliTool | undefined;
    if (CLI_COMMANDS.has(cmd)) {
      cliTool = cmd as CliTool;
    } else if (HOST_RUNTIMES.has(cmd) && panePid) {
      // Node-based CLIs (codex, gemini) show as "node" in pane_current_command
      cliTool = resolveNodeCliTool(panePid, exec) ?? undefined;
    }

    // Derive windowId from pane ID: "session:window.pane" → "session:window"
    const dotIdx = paneId.lastIndexOf(".");
    const windowId = dotIdx >= 0 ? paneId.substring(0, dotIdx) : undefined;

    found.push({
      id: paneId,
      name: sessionName,
      target: "local",
      ...(cliTool ? { cliTool } : {}),
      ...(windowId ? { windowId } : {}),
      ...(windowName ? { windowName } : {}),
      ...(cmd ? { paneCommand: cmd } : {}),
    });
  }

  return found;
}
