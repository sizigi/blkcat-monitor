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

/** Flags that affect how sessions are displayed (e.g. red indicator for skip-permissions). */
const NOTABLE_FLAGS = ["--dangerously-skip-permissions", "--full-auto", "--dangerously-bypass-approvals-and-sandbox", "--yolo"];

/**
 * Inspect the pane process (and its children) to extract notable CLI flags.
 * Returns a space-joined string of matched flags, or undefined if none found.
 */
function resolveCliArgs(panePid: string, cliTool: CliTool, exec: ExecFn): string | undefined {
  const lines: string[] = [];

  // Check the pane process itself (pane_pid may be the CLI process directly)
  const self = exec(["ps", "-p", panePid, "-o", "args", "--no-headers"]);
  if (self.success) lines.push(self.stdout.trim());

  // Check child processes (pane_pid is a shell, CLI is a child)
  const children = exec(["ps", "--ppid", panePid, "-o", "args", "--no-headers"]);
  if (children.success) lines.push(...children.stdout.trim().split("\n"));

  for (const line of lines) {
    if (!line) continue;
    // Only inspect lines that contain the CLI tool name
    if (!line.includes(`/${cliTool}`) && !line.startsWith(`${cliTool} `) && line !== cliTool) continue;
    const flags = NOTABLE_FLAGS.filter(f => line.includes(f));
    if (flags.length > 0) return flags.join(" ");
  }
  return undefined;
}

/** Discover only CLI sessions (claude, codex, gemini). */
export function discoverCliSessions(exec: ExecFn = bunExec, excludeIds?: Set<string>): SessionInfo[] {
  return discoverAllSessions(exec, excludeIds).filter((s) => !!s.cliTool);
}

/**
 * Discover all tmux sessions (CLI and plain).
 * @param excludeIds — session IDs already tracked (e.g. manual sessions).
 *   Any physical pane that maps to an excluded ID is pre-seeded in the
 *   dedup set so auto-discovery won't return a duplicate under a different
 *   grouped-session name.
 */
export function discoverAllSessions(exec: ExecFn = bunExec, excludeIds?: Set<string>): SessionInfo[] {
  const result = exec([
    "tmux", "list-panes", "-a",
    "-F", "#{session_name}:#{window_index}.#{pane_index}\t#{session_name}\t#{pane_current_command}\t#{pane_pid}\t#{pane_id}\t#{window_name}\t#{pane_current_path}",
  ]);
  if (!result.success) return [];

  const lines = result.stdout.trim().split("\n");
  const found: SessionInfo[] = [];
  const seenPaneIds = new Set<string>();

  // Pre-seed: if a manually-tracked session maps to a physical pane,
  // mark that pane as seen so auto-discovery skips its grouped aliases.
  if (excludeIds) {
    for (const line of lines) {
      if (!line) continue;
      const parts = line.split("\t");
      if (excludeIds.has(parts[0]) && parts[4]) seenPaneIds.add(parts[4]);
    }
  }

  for (const line of lines) {
    if (!line) continue;
    const [paneId, sessionName, cmd, panePid, tmuxPaneId, windowName, paneCwd] = line.split("\t");
    // Deduplicate: tmux grouped sessions list the same physical pane
    // under multiple session names (e.g., "1:2.0" and "1-2:2.0").
    // #{pane_id} (e.g., %0) is unique per physical pane.
    if (tmuxPaneId && seenPaneIds.has(tmuxPaneId)) continue;
    if (tmuxPaneId) seenPaneIds.add(tmuxPaneId);

    const cwd = paneCwd || undefined;

    let cliTool: CliTool | undefined;
    let args: string | undefined;
    if (CLI_COMMANDS.has(cmd)) {
      cliTool = cmd as CliTool;
      if (panePid) args = resolveCliArgs(panePid, cliTool, exec);
    } else if (HOST_RUNTIMES.has(cmd) && panePid) {
      // Node-based CLIs (codex, gemini) show as "node" in pane_current_command
      cliTool = resolveNodeCliTool(panePid, exec) ?? undefined;
      if (cliTool && panePid) args = resolveCliArgs(panePid, cliTool, exec);
    }

    // Derive windowId from pane ID: "session:window.pane" → "session:window"
    const dotIdx = paneId.lastIndexOf(".");
    const windowId = dotIdx >= 0 ? paneId.substring(0, dotIdx) : undefined;

    found.push({
      id: paneId,
      name: sessionName,
      target: "local",
      ...(cliTool ? { cliTool } : {}),
      ...(args ? { args } : {}),
      ...(cwd ? { cwd } : {}),
      ...(windowId ? { windowId } : {}),
      ...(windowName ? { windowName } : {}),
      ...(cmd ? { paneCommand: cmd } : {}),
    });
  }

  return found;
}
