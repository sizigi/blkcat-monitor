import { loadConfig } from "./config";
import { AgentConnection } from "./connection";
import { AgentListener } from "./listener";
import { TmuxCapture, bunExec } from "./capture";
import { discoverClaudeSessions } from "./discovery";
import { hasChanged } from "./diff";
import type { SessionInfo } from "@blkcat/shared";

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

  function handleStartSession(args?: string, cwd?: string) {
    const localCap = new TmuxCapture(bunExec);
    const paneId = localCap.startSession(args, cwd);
    if (!paneId) {
      console.error("Failed to start new session");
      return;
    }
    captures.set(paneId, localCap);
    const session: SessionInfo = { id: paneId, name: `claude${args ? ` ${args}` : ""}`, target: "local" };
    manualSessions.push(session);
    const all = [...autoSessions, ...manualSessions];
    conn.updateSessions(all);
    console.log(`Started new session: ${paneId}`);
  }

  let conn: { register(sessions: SessionInfo[]): void; sendOutput(sessionId: string, lines: string[], waitingForInput?: boolean): void; updateSessions(sessions: SessionInfo[]): void; close(): void };

  if (config.listenPort) {
    const listener = new AgentListener({
      port: config.listenPort,
      machineId: config.machineId,
      onInput: handleInput,
      onStartSession: handleStartSession,
      onCloseSession: handleCloseSession,
      onResize: handleResize,
    });
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
    });
    conn = connection;
    await connection.waitForOpen();
    conn.register(allSessions);
    console.log(`Connected to ${config.serverUrl} as ${config.machineId}`);
  }

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
        autoSessions = fresh;
        const all = [...autoSessions, ...manualSessions];
        conn.updateSessions(all);
        console.log(`Sessions updated: ${all.length} total`);
      }
    }, 30000);
  }
}

main().catch(console.error);
