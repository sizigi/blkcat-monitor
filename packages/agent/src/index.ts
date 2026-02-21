import { loadConfig } from "./config";
import { AgentConnection } from "./connection";
import { AgentListener } from "./listener";
import { TmuxCapture, bunExec } from "./capture";
import { discoverClaudeSessions } from "./discovery";
import { hasChanged } from "./diff";
import { HooksServer } from "./hooks-server";
import { installHooks } from "./hooks-install";
import type { SessionInfo } from "@blkcat/shared";
import type { AgentHookEventMessage } from "@blkcat/shared";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readSettings, writeSettings, deploySkills, readInstalledPlugins } from "./settings-handler";

async function main() {
  const config = await loadConfig();

  const captures = new Map<string, TmuxCapture>();
  const manualSessions: SessionInfo[] = [];

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
    autoSessions = discoverClaudeSessions();
    for (const s of autoSessions) {
      captures.set(s.id, new TmuxCapture(bunExec));
    }
  }

  const allSessions = [...autoSessions, ...manualSessions];
  console.log(`Found ${allSessions.length} sessions to monitor`);

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
    // Remove from manual sessions
    const manualIdx = manualSessions.findIndex((s) => s.id === sessionId);
    if (manualIdx >= 0) manualSessions.splice(manualIdx, 1);
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
  }

  function handleRequestScrollback(sessionId: string) {
    const cap = captures.get(sessionId);
    if (!cap) return;
    const lines = cap.captureScrollback(sessionId);
    conn.sendScrollback(sessionId, lines);
  }

  function handleReloadSession(sessionId: string) {
    const cap = captures.get(sessionId);
    if (!cap) return;
    cap.respawnPane(sessionId, "claude --resume");
    prevLines.delete(sessionId);
    console.log(`Reloaded session: ${sessionId}`);
  }

  function handleStartSession(args?: string, cwd?: string, name?: string) {
    const localCap = new TmuxCapture(bunExec);
    const paneId = localCap.startSession(args, cwd);
    if (!paneId) {
      console.error("Failed to start new session");
      return;
    }
    captures.set(paneId, localCap);
    const sessionName = name || `claude${args ? ` ${args}` : ""}`;
    const session: SessionInfo = { id: paneId, name: sessionName, target: "local", args: args || undefined };
    manualSessions.push(session);
    const all = [...autoSessions, ...manualSessions];
    conn.updateSessions(all);
    console.log(`Started new session: ${paneId}`);
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

  async function handleDeploySkills(requestId: string, skills: { name: string; files: { path: string; content: string }[] }[]) {
    try {
      const home = process.env.HOME ?? "/root";
      await deploySkills({
        cacheDir: resolve(home, ".claude/plugins/cache"),
        pluginsPath: resolve(home, ".claude/plugins/installed_plugins.json"),
        skills,
      });
      conn.sendDeployResult(requestId, true);
      console.log(`Deployed ${skills.length} skill(s): ${skills.map(s => s.name).join(", ")}`);
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
      const installedPlugins = await readInstalledPlugins(resolve(home, ".claude/plugins/installed_plugins.json"));
      conn.sendSettingsSnapshot(requestId, settings, scope, installedPlugins);
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
    sendOutput(sessionId: string, lines: string[], waitingForInput?: boolean): void;
    updateSessions(sessions: SessionInfo[]): void;
    sendScrollback(sessionId: string, lines: string[]): void;
    sendHookEvent(event: AgentHookEventMessage): void;
    sendDirectoryListing(machineId: string, requestId: string, path: string, entries: { name: string; isDir: boolean }[], error?: string): void;
    sendDeployResult(requestId: string, success: boolean, error?: string): void;
    sendSettingsSnapshot(requestId: string, settings: Record<string, unknown>, scope: "global" | "project", installedPlugins?: Record<string, unknown>): void;
    sendSettingsResult(requestId: string, success: boolean, error?: string): void;
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
      onDeploySkills: handleDeploySkills,
      onGetSettings: handleGetSettings,
      onUpdateSettings: handleUpdateSettings,
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
      onDeploySkills: handleDeploySkills,
      onGetSettings: handleGetSettings,
      onUpdateSettings: handleUpdateSettings,
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

  const prevLines = new Map<string, string[]>();

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
        const waitingForInput = detectWaitingForInput(lines);
        conn.sendOutput(paneId, lines, waitingForInput);
        prevLines.set(paneId, lines);
      }
    }
  }, config.pollInterval);

  if (hasAutoTarget) {
    setInterval(() => {
      const fresh = discoverClaudeSessions();
      const newSessions = fresh.filter((s) => !captures.has(s.id));
      const goneSessions = autoSessions.filter(
        (s) => !fresh.find((f) => f.id === s.id)
      );

      if (newSessions.length > 0 || goneSessions.length > 0) {
        for (const s of newSessions) captures.set(s.id, new TmuxCapture(bunExec));
        for (const s of goneSessions) { captures.delete(s.id); prevLines.delete(s.id); }
        // Exclude manually started sessions so auto-discovery doesn't overwrite their names
        const manualIds = new Set(manualSessions.map((s) => s.id));
        autoSessions = fresh.filter((s) => !manualIds.has(s.id));
        const all = [...autoSessions, ...manualSessions];
        conn.updateSessions(all);
        console.log(`Sessions updated: ${all.length} total`);
      }
    }, 30000);
  }
}

main().catch(console.error);
