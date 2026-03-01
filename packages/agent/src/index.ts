import { loadConfig } from "./config";
import { AgentConnection } from "./connection";
import { AgentListener } from "./listener";
import { TmuxCapture, bunExec } from "./capture";
import { discoverAllSessions } from "./discovery";
import { hasChanged } from "./diff";
import { HooksServer } from "./hooks-server";
import { installHooks } from "./hooks-install";
import { findLatestCodexSessionId } from "./codex-sessions";
import { findLatestGeminiSessionId } from "./gemini-sessions";
import type { SessionInfo, AgentHookEventMessage, CliTool } from "@blkcat/shared";
import { CLI_TOOLS } from "@blkcat/shared";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readSettings, writeSettings, deploySkills, listDeployedSkills, removeSkills } from "./settings-handler";

async function main() {
  const config = await loadConfig();

  const captures = new Map<string, TmuxCapture>();
  const sessionIds = new Map<string, string>();
  const manualSessions: SessionInfo[] = [];
  // Grace period: recently reloaded panes are protected from auto-discovery removal
  const reloadGracePanes = new Map<string, number>();
  const RELOAD_GRACE_MS = 10_000;
  // Sticky CLI detection: once a session is detected as a CLI tool, lock it in.
  // CLI sessions don't fall back to terminal, so re-checking is unnecessary.
  const stickyCliMap = new Map<string, { cliTool: CliTool; args?: string }>();

  for (const target of config.targets) {
    if (target.type === "local" && target.session) {
      const cap = new TmuxCapture(bunExec);
      const panes = cap.listPanes(target.session);
      for (const pane of panes) {
        captures.set(pane, cap);
        manualSessions.push({ id: pane, name: target.session, target: "local" });
      }
    } else if (target.type === "ssh" && target.host && target.session) {
      const cap = TmuxCapture.forSSH(target.host, target.key);
      const panes = cap.listPanes(target.session);
      for (const pane of panes) {
        captures.set(pane, cap);
        manualSessions.push({
          id: pane,
          name: `${target.host}:${target.session}`,
          target: "ssh",
          host: target.host,
        });
      }
    }
  }

  const hasAutoTarget = config.targets.some((t) => t.type === "auto");
  let autoSessions: SessionInfo[] = [];
  if (hasAutoTarget) {
    autoSessions = discoverAllSessions();
    for (const s of autoSessions) {
      captures.set(s.id, new TmuxCapture(bunExec));
    }
  }

  const allSessions = [...autoSessions, ...manualSessions];
  console.log(`Found ${allSessions.length} sessions to monitor`);

  const prevLines = new Map<string, string[]>();

  function handleInput({ sessionId, text, key, data }: { sessionId: string; text?: string; key?: string; data?: string }) {
    const cap = captures.get(sessionId);
    if (!cap) return;
    if (data) cap.sendRaw(sessionId, data);
    else if (text) cap.sendText(sessionId, text);
    if (key) cap.sendKey(sessionId, key);
  }

  function handleCloseSession(sessionId: string) {
    const cap = captures.get(sessionId);
    if (!cap) return;
    cap.killPane(sessionId);
    captures.delete(sessionId);
    prevLines.delete(sessionId);
    sessionIds.delete(sessionId);
    // Remove ALL entries with this ID from manual sessions (prevent stale duplicates)
    for (let i = manualSessions.length - 1; i >= 0; i--) {
      if (manualSessions[i].id === sessionId) manualSessions.splice(i, 1);
    }
    // Remove from auto sessions
    autoSessions = autoSessions.filter((s) => s.id !== sessionId);
    const all = [...autoSessions, ...manualSessions];
    conn.updateSessions(all);
    console.log(`Closed session: ${sessionId}`);
  }

  function handleResize(sessionId: string, cols: number, rows: number) {
    const cap = captures.get(sessionId);
    if (!cap) return;
    cap.resizePane(sessionId, cols, rows);
    // Clear cache so the next poll cycle re-sends content at new dimensions
    prevLines.delete(sessionId);
  }

  function handleRequestScrollback(sessionId: string) {
    const cap = captures.get(sessionId);
    if (!cap) return;
    const lines = cap.captureScrollback(sessionId);
    conn.sendScrollback(sessionId, lines);
  }

  function handleReloadSession(sessionId: string, args?: string, resume?: boolean) {
    const cap = captures.get(sessionId);
    if (!cap) {
      console.error(`Reload failed: session ${sessionId} not found in captures`);
      conn.sendReloadResult(sessionId, false, "Session not found");
      return;
    }
    const allSessions = [...autoSessions, ...manualSessions];
    const session = allSessions.find((s) => s.id === sessionId);
    const tool = CLI_TOOLS[session?.cliTool ?? "claude"];
    const toolSessionId = sessionIds.get(sessionId);
    const shouldResume = resume !== false; // default true
    // Build command: tool [args] [resumeFlag]
    // Args (e.g. --full-auto) must come before positional resume args
    // so CLIs don't misinterpret them as prompts.
    let cmd = tool.command;
    if (args) cmd += ` ${args}`;
    if (shouldResume) {
      cmd += " " + tool.resumeFlag(toolSessionId);
    }
    const ok = cap.respawnPane(sessionId, cmd);
    if (!ok) {
      console.error(`Reload failed: tmux respawn-pane failed for ${sessionId}`);
      conn.sendReloadResult(sessionId, false, "tmux respawn-pane failed");
      return;
    }
    prevLines.delete(sessionId);
    // Clear stale session UUID so hooks server repopulates from new session
    sessionIds.delete(sessionId);
    // Protect this pane from auto-discovery removal during bash->cli transition
    reloadGracePanes.set(sessionId, Date.now());
    // Update stored args on the session so sidebar reflects the new flags
    if (session) {
      session.args = args || undefined;
      const all = [...autoSessions, ...manualSessions];
      conn.updateSessions(all);
    }
    conn.sendReloadResult(sessionId, true);
    console.log(`Reloaded ${tool.command} session: ${sessionId}${shouldResume && toolSessionId ? ` (session: ${toolSessionId})` : ""}${args ? ` (args: ${args})` : ""}${!shouldResume ? " (fresh)" : ""}`);
  }

  function handleStartSession(args?: string, cwd?: string, name?: string, cliTool?: CliTool) {
    const localCap = new TmuxCapture(bunExec);
    let paneId: string | null;
    if (cliTool) {
      paneId = localCap.startSession(args, cwd, cliTool);
    } else {
      paneId = localCap.startPlainSession(cwd);
    }
    if (!paneId) {
      console.error("Failed to start new session");
      return;
    }
    captures.set(paneId, localCap);
    const sessionName = name || (cliTool ? `${cliTool}${args ? ` ${args}` : ""}` : "shell");
    if (name) localCap.renameWindow(paneId, name);
    const session: SessionInfo = { id: paneId, name: sessionName, target: "local", args: args || undefined, ...(cliTool ? { cliTool } : {}) };
    // Remove any existing entry with the same pane ID to prevent duplicates
    const existingIdx = manualSessions.findIndex((s) => s.id === paneId);
    if (existingIdx >= 0) manualSessions.splice(existingIdx, 1);
    // Also remove from auto-discovered sessions to prevent duplicates in the merged list
    autoSessions = autoSessions.filter((s) => s.id !== paneId);
    manualSessions.push(session);
    const all = [...autoSessions, ...manualSessions];
    conn.updateSessions(all);
    console.log(`Started new ${cliTool ?? "terminal"} session: ${paneId}`);
  }

  function handleRenameSession(sessionId: string, name: string) {
    const cap = captures.get(sessionId);
    if (!cap) return;
    cap.renameWindow(sessionId, name);
    triggerRediscovery();
  }

  function triggerRediscovery() {
    if (!hasAutoTarget) return;
    const fresh = discoverAllSessions();

    // Apply sticky CLI detection: once detected as CLI, lock it in.
    // But invalidate if paneCommand clearly isn't a CLI tool (e.g. after swap-pane).
    const CLI_CMDS = new Set(["claude", "codex", "gemini"]);
    const HOST_RUNTIMES = new Set(["node", "MainThread"]);
    for (const s of fresh) {
      if (s.cliTool) {
        stickyCliMap.set(s.id, { cliTool: s.cliTool, args: s.args });
      } else {
        const sticky = stickyCliMap.get(s.id);
        if (sticky) {
          // If the pane is now running something clearly not a CLI, discard sticky
          if (s.paneCommand && !CLI_CMDS.has(s.paneCommand) && !HOST_RUNTIMES.has(s.paneCommand)) {
            stickyCliMap.delete(s.id);
          } else {
            s.cliTool = sticky.cliTool;
            s.args = sticky.args;
          }
        }
      }
    }

    const newSessions = fresh.filter((s) => !captures.has(s.id));
    const now = Date.now();
    for (const [id, ts] of reloadGracePanes) {
      if (now - ts > RELOAD_GRACE_MS) reloadGracePanes.delete(id);
    }
    const goneSessions = autoSessions.filter(
      (s) => !fresh.find((f) => f.id === s.id) && !reloadGracePanes.has(s.id)
    );
    if (newSessions.length > 0 || goneSessions.length > 0) {
      for (const s of newSessions) captures.set(s.id, new TmuxCapture(bunExec));
      for (const s of goneSessions) { captures.delete(s.id); prevLines.delete(s.id); }
    }
    // Clean up sticky entries for sessions no longer in tmux
    const freshIds = new Set(fresh.map((s) => s.id));
    for (const id of stickyCliMap.keys()) {
      if (!freshIds.has(id)) stickyCliMap.delete(id);
    }
    // Update manual sessions with fresh metadata from discovery (cliTool, cwd, etc.)
    // while preserving user-set fields like name.
    // Also remove manual sessions whose tmux panes no longer exist.
    const freshById = new Map(fresh.map((s) => [s.id, s]));
    for (let i = manualSessions.length - 1; i >= 0; i--) {
      const manual = manualSessions[i];
      const freshData = freshById.get(manual.id);
      if (freshData) {
        // Only promote cliTool, never demote (sticky handles this via fresh data)
        manual.cliTool = freshData.cliTool;
        manual.cwd = freshData.cwd;
        manual.args = freshData.args;
        manual.paneCommand = freshData.paneCommand;
        manual.windowId = freshData.windowId;
        manual.windowName = freshData.windowName;
      } else if (!reloadGracePanes.has(manual.id)) {
        // Pane no longer exists in tmux — clean up the ghost session
        manualSessions.splice(i, 1);
        captures.delete(manual.id);
        prevLines.delete(manual.id);
      }
    }
    const manualIds = new Set(manualSessions.map((s) => s.id));
    autoSessions = fresh.filter((s) => !manualIds.has(s.id));
    const all = [...autoSessions, ...manualSessions];
    conn.updateSessions(all);
    console.log(`Sessions updated: ${all.length} total`);
  }

  function handleSwapPane(sessionId1: string, sessionId2: string) {
    const cap = captures.get(sessionId1) ?? new TmuxCapture(bunExec);
    cap.swapPane(sessionId1, sessionId2);
    // Clear sticky CLI entries — processes moved to different panes
    stickyCliMap.delete(sessionId1);
    stickyCliMap.delete(sessionId2);
    triggerRediscovery();
  }

  function handleSwapWindow(sessionId1: string, sessionId2: string) {
    // Extract window targets (session:window) from session IDs (session:window.pane)
    const winTarget = (id: string) => id.replace(/\.\d+$/, "");
    const cap = captures.get(sessionId1) ?? new TmuxCapture(bunExec);
    cap.swapWindow(winTarget(sessionId1), winTarget(sessionId2));
    // Clear sticky CLI entries for all panes in both windows
    const win1 = winTarget(sessionId1);
    const win2 = winTarget(sessionId2);
    for (const id of stickyCliMap.keys()) {
      if (id.startsWith(win1 + ".") || id === win1 || id.startsWith(win2 + ".") || id === win2) {
        stickyCliMap.delete(id);
      }
    }
    triggerRediscovery();
  }

  function handleMovePane(sessionId: string, targetSessionId: string, before: boolean) {
    const cap = captures.get(sessionId) ?? new TmuxCapture(bunExec);
    cap.movePane(sessionId, targetSessionId, before);
    stickyCliMap.delete(sessionId);
    stickyCliMap.delete(targetSessionId);
    triggerRediscovery();
  }

  function handleMoveWindow(sessionId: string, targetSessionId: string, before: boolean) {
    const cap = captures.get(sessionId) ?? new TmuxCapture(bunExec);
    cap.moveWindow(sessionId, targetSessionId, before);
    // Clear sticky CLI entries for all panes in both windows
    const winTarget = (id: string) => id.replace(/\.\d+$/, "");
    const win1 = winTarget(sessionId);
    const win2 = winTarget(targetSessionId);
    for (const id of stickyCliMap.keys()) {
      if (id.startsWith(win1 + ".") || id === win1 || id.startsWith(win2 + ".") || id === win2) {
        stickyCliMap.delete(id);
      }
    }
    triggerRediscovery();
  }

  function handleRediscover() {
    stickyCliMap.clear();
    triggerRediscovery();
    console.log("Rediscovery triggered (sticky CLI cache cleared)");
  }

  function handleListDirectory(requestId: string, path: string) {
    // Resolve ~ so the web UI receives absolute paths
    const resolved = path.startsWith("~")
      ? path.replace("~", process.env.HOME ?? "/root")
      : path;
    const localCap = new TmuxCapture(bunExec);
    const result = localCap.listDirectory(resolved);
    if ("error" in result) {
      conn.sendDirectoryListing(config.machineId, requestId, resolved, [], result.error);
    } else {
      conn.sendDirectoryListing(config.machineId, requestId, resolved, result.entries);
    }
  }

  function handleCreateDirectory(requestId: string, path: string) {
    const resolved = path.startsWith("~")
      ? path.replace("~", process.env.HOME ?? "/root")
      : path;
    const localCap = new TmuxCapture(bunExec);
    const result = localCap.createDirectory(resolved);
    conn.sendCreateDirectoryResult(requestId, resolved, result.success, result.error);
  }

  async function handleDeploySkills(requestId: string, skills: { name: string; files: { path: string; content: string }[] }[]) {
    try {
      const home = process.env.HOME ?? "/root";
      await deploySkills({
        skillsDir: resolve(home, ".claude/skills"),
        skills,
      });
      conn.sendDeployResult(requestId, true);
      console.log(`Deployed ${skills.length} skill(s): ${skills.map(s => s.name).join(", ")}`);
    } catch (err: any) {
      conn.sendDeployResult(requestId, false, err?.message ?? "Unknown error");
    }
  }

  async function handleRemoveSkills(requestId: string, skillNames: string[]) {
    try {
      const home = process.env.HOME ?? "/root";
      await removeSkills(resolve(home, ".claude/skills"), skillNames);
      conn.sendDeployResult(requestId, true);
      console.log(`Removed ${skillNames.length} skill(s): ${skillNames.join(", ")}`);
    } catch (err: any) {
      conn.sendDeployResult(requestId, false, err?.message ?? "Unknown error");
    }
  }

  async function handleGetSettings(requestId: string, scope: "global" | "project", projectPath?: string) {
    try {
      const home = process.env.HOME ?? "/root";
      const settingsPath = scope === "global"
        ? resolve(home, ".claude/settings.json")
        : resolve(projectPath ?? ".", ".claude/settings.json");
      const { settings } = await readSettings(settingsPath);
      const deployedSkills = await listDeployedSkills(resolve(home, ".claude/skills"));
      conn.sendSettingsSnapshot(requestId, settings, scope, deployedSkills);
    } catch (err: any) {
      conn.sendSettingsSnapshot(requestId, {}, scope);
    }
  }

  async function handleUpdateSettings(requestId: string, scope: "global" | "project", settings: Record<string, unknown>, projectPath?: string) {
    try {
      const home = process.env.HOME ?? "/root";
      const settingsPath = scope === "global"
        ? resolve(home, ".claude/settings.json")
        : resolve(projectPath ?? ".", ".claude/settings.json");
      await writeSettings(settingsPath, settings);
      conn.sendSettingsResult(requestId, true);
      console.log(`Updated ${scope} settings`);
    } catch (err: any) {
      conn.sendSettingsResult(requestId, false, err?.message ?? "Unknown error");
    }
  }

  let conn: {
    register(sessions: SessionInfo[]): void;
    sendOutput(sessionId: string, lines: string[], waitingForInput?: boolean, cursor?: { x: number; y: number }): void;
    updateSessions(sessions: SessionInfo[]): void;
    sendScrollback(sessionId: string, lines: string[]): void;
    sendHookEvent(event: AgentHookEventMessage): void;
    sendDirectoryListing(machineId: string, requestId: string, path: string, entries: { name: string; isDir: boolean }[], error?: string): void;
    sendDeployResult(requestId: string, success: boolean, error?: string): void;
    sendSettingsSnapshot(requestId: string, settings: Record<string, unknown>, scope: "global" | "project", deployedSkills?: string[]): void;
    sendSettingsResult(requestId: string, success: boolean, error?: string): void;
    sendReloadResult(sessionId: string, success: boolean, error?: string): void;
    sendCreateDirectoryResult(requestId: string, path: string, success: boolean, error?: string): void;
    close(): void;
  };

  if (config.listenPort) {
    const listener = new AgentListener({
      port: config.listenPort,
      machineId: config.machineId,
      onInput: handleInput,
      onStartSession: handleStartSession,
      onCloseSession: handleCloseSession,
      onResize: handleResize,
      onRequestScrollback: handleRequestScrollback,
      onReloadSession: handleReloadSession,
      onListDirectory: handleListDirectory,
      onCreateDirectory: handleCreateDirectory,
      onDeploySkills: handleDeploySkills,
      onRemoveSkills: handleRemoveSkills,
      onGetSettings: handleGetSettings,
      onUpdateSettings: handleUpdateSettings,
      onRenameSession: handleRenameSession,

      onSwapPane: handleSwapPane,
      onSwapWindow: handleSwapWindow,
      onMovePane: handleMovePane,
      onMoveWindow: handleMoveWindow,
      onRediscover: handleRediscover,
    });
    // When a new server connects, clear prevLines so the next poll cycle
    // re-sends the current pane content for all sessions.
    listener.onNewClient = () => { prevLines.clear(); };
    conn = listener;
    conn.register(allSessions);
    console.log(`Listening on port ${listener.port} as ${config.machineId}`);
  } else {
    const connection = new AgentConnection({
      serverUrl: config.serverUrl,
      machineId: config.machineId,
      onInput: handleInput,
      onStartSession: handleStartSession,
      onCloseSession: handleCloseSession,
      onResize: handleResize,
      onRequestScrollback: handleRequestScrollback,
      onReloadSession: handleReloadSession,
      onListDirectory: handleListDirectory,
      onCreateDirectory: handleCreateDirectory,
      onDeploySkills: handleDeploySkills,
      onRemoveSkills: handleRemoveSkills,
      onGetSettings: handleGetSettings,
      onUpdateSettings: handleUpdateSettings,
      onRenameSession: handleRenameSession,

      onSwapPane: handleSwapPane,
      onSwapWindow: handleSwapWindow,
      onMovePane: handleMovePane,
      onMoveWindow: handleMoveWindow,
      getSessions: () => [...autoSessions, ...manualSessions],
      onReconnect: () => { prevLines.clear(); },
    });
    conn = connection;
    await connection.waitForOpen();
    conn.register(allSessions);
    console.log(`Connected to ${config.serverUrl} as ${config.machineId}`);
  }

  // Start hooks HTTP server
  const hooksServer = new HooksServer({
    port: config.hooksPort,
    machineId: config.machineId,
    onHookEvent: (event) => {
      conn.sendHookEvent(event);
    },
    onClaudeSessionId: (paneId, claudeId) => {
      sessionIds.set(paneId, claudeId);
    },
    resolvePaneId: (tmuxPane) => {
      // Direct match (session:window.pane format)
      if (captures.has(tmuxPane)) return tmuxPane;
      // tmux pane IDs from $TMUX_PANE are like %0, %1 — resolve to session:window.pane
      if (tmuxPane.startsWith("%")) {
        const result = bunExec(["tmux", "display-message", "-p", "-t", tmuxPane, "#{session_name}:#{window_index}.#{pane_index}"]);
        if (result.success) {
          const resolved = result.stdout.trim();
          if (captures.has(resolved)) return resolved;
        }
      }
      return null;
    },
  });
  console.log(`Hooks server listening on port ${hooksServer.port}`);

  // Auto-install Claude Code hooks
  const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "../blkcat-hook.sh");
  installHooks({
    settingsPath: resolve(process.env.HOME ?? "~", ".claude/settings.json"),
    hooksPort: config.hooksPort,
    scriptPath,
  }).then(() => {
    console.log("Claude Code hooks installed");
  }).catch((err) => {
    console.warn("Failed to install Claude Code hooks:", err);
  });

  // Poll for Codex session IDs (no hooks system available)
  const codexSessionsDir = resolve(process.env.HOME ?? "/root", ".codex/sessions");
  setInterval(() => {
    for (const [paneId] of captures) {
      const allSessions = [...autoSessions, ...manualSessions];
      const session = allSessions.find((s) => s.id === paneId);
      if (session?.cliTool === "codex" && !sessionIds.has(paneId)) {
        const latest = findLatestCodexSessionId(codexSessionsDir);
        if (latest) {
          sessionIds.set(paneId, latest);
        }
      }
    }
  }, 5000);

  // Poll for Gemini session IDs (no hooks system available)
  const geminiSessionsDir = resolve(process.env.HOME ?? "/root", ".gemini/tmp");
  setInterval(() => {
    for (const [paneId] of captures) {
      const allSessions = [...autoSessions, ...manualSessions];
      const session = allSessions.find((s) => s.id === paneId);
      if (session?.cliTool === "gemini" && !sessionIds.has(paneId)) {
        const latest = findLatestGeminiSessionId(geminiSessionsDir);
        if (latest) {
          sessionIds.set(paneId, latest);
        }
      }
    }
  }, 5000);

  // Detect if terminal output indicates Claude is waiting for user input.
  // Looks for common prompt patterns on the last non-empty line.
  function detectWaitingForInput(lines: string[]): boolean {
    // Find the last non-empty line (strip ANSI escape sequences for matching)
    for (let i = lines.length - 1; i >= 0; i--) {
      const stripped = lines[i].replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trim();
      if (!stripped) continue;
      // Claude Code prompts: "> ", "? ", or lines ending with common prompt indicators
      if (/^[>?]\s*$/.test(stripped)) return true;
      if (/[>?]\s*$/.test(stripped) && stripped.length < 80) return true;
      // Also check for yes/no style prompts
      if (/\(y\/n\)\s*$/i.test(stripped)) return true;
      if (/\(Y\/n\)\s*$/i.test(stripped)) return true;
      return false;
    }
    return false;
  }

  setInterval(() => {
    for (const [paneId, cap] of captures) {
      const lines = cap.capturePane(paneId);
      const prev = prevLines.get(paneId) ?? [];
      if (hasChanged(prev, lines)) {
        // Only detect waiting-for-input for CLI tool sessions
        const allSess = [...autoSessions, ...manualSessions];
        const sess = allSess.find((s) => s.id === paneId);
        const waitingForInput = sess?.cliTool ? detectWaitingForInput(lines) : false;
        const cursor = cap.getCursorPos(paneId);
        conn.sendOutput(paneId, lines, waitingForInput, cursor ?? undefined);
        prevLines.set(paneId, lines);
      }
    }
  }, config.pollInterval);

  if (hasAutoTarget) {
    setInterval(() => triggerRediscovery(), 10_000);
  }
}

main().catch(console.error);
