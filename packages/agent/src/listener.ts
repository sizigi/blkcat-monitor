import type { SessionInfo, ServerToAgentMessage, AgentHookEventMessage } from "@blkcat/shared";

interface AgentListenerOptions {
  port: number;
  machineId: string;
  onInput: (msg: { sessionId: string; text?: string; key?: string; data?: string }) => void;
  onStartSession?: (args?: string, cwd?: string, name?: string) => void;
  onCloseSession?: (sessionId: string) => void;
  onResize?: (sessionId: string, cols: number, rows: number) => void;
  onRequestScrollback?: (sessionId: string) => void;
  onReloadSession?: (sessionId: string) => void;
  onListDirectory?: (requestId: string, path: string) => void;
}

export class AgentListener {
  private server: ReturnType<typeof Bun.serve>;
  private clients = new Set<any>();
  private machineId: string;
  private currentSessions: SessionInfo[] = [];
  private opts: AgentListenerOptions;
  onNewClient?: () => void;

  constructor(opts: AgentListenerOptions) {
    this.opts = opts;
    this.machineId = opts.machineId;

    this.server = Bun.serve({
      port: opts.port,
      fetch(req, server) {
        const ok = server.upgrade(req);
        return ok ? undefined : new Response("Upgrade failed", { status: 500 });
      },
      websocket: {
        open: (ws) => {
          this.clients.add(ws);
          // Send current registration to newly connected server
          ws.send(JSON.stringify({
            type: "register",
            machineId: this.machineId,
            sessions: this.currentSessions,
          }));
          // Notify the agent to re-send current pane content
          this.onNewClient?.();
        },
        message: (_ws, message) => {
          try {
            const raw = typeof message === "string" ? message : new TextDecoder().decode(message as ArrayBuffer);
            const msg: ServerToAgentMessage = JSON.parse(raw);
            if (msg.type === "input") {
              this.opts.onInput({ sessionId: msg.sessionId, text: msg.text, key: msg.key, data: msg.data });
            } else if (msg.type === "start_session") {
              this.opts.onStartSession?.(msg.args, msg.cwd, msg.name);
            } else if (msg.type === "close_session") {
              this.opts.onCloseSession?.(msg.sessionId);
            } else if (msg.type === "resize") {
              this.opts.onResize?.(msg.sessionId, msg.cols, msg.rows);
            } else if (msg.type === "request_scrollback") {
              this.opts.onRequestScrollback?.(msg.sessionId);
            } else if (msg.type === "reload_session") {
              this.opts.onReloadSession?.(msg.sessionId);
            } else if (msg.type === "list_directory") {
              this.opts.onListDirectory?.(msg.requestId, msg.path);
            }
          } catch {}
        },
        close: (ws) => {
          this.clients.delete(ws);
        },
      },
    });
  }

  get port() { return this.server.port; }

  register(sessions: SessionInfo[]) {
    this.currentSessions = sessions;
    this.broadcast({
      type: "register",
      machineId: this.machineId,
      sessions,
    });
  }

  sendOutput(sessionId: string, lines: string[], waitingForInput?: boolean) {
    const msg: Record<string, any> = {
      type: "output",
      machineId: this.machineId,
      sessionId,
      lines,
      timestamp: Date.now(),
    };
    if (waitingForInput) msg.waitingForInput = true;
    this.broadcast(msg);
  }

  updateSessions(sessions: SessionInfo[]) {
    this.currentSessions = sessions;
    this.broadcast({
      type: "sessions",
      machineId: this.machineId,
      sessions,
    });
  }

  sendScrollback(sessionId: string, lines: string[]) {
    this.broadcast({
      type: "scrollback",
      machineId: this.machineId,
      sessionId,
      lines,
    });
  }

  sendHookEvent(event: AgentHookEventMessage) {
    this.broadcast(event);
  }

  sendDirectoryListing(machineId: string, requestId: string, path: string, entries: { name: string; isDir: boolean }[], error?: string) {
    const msg: Record<string, any> = {
      type: "directory_listing",
      machineId: this.machineId,
      requestId,
      path,
      entries,
    };
    if (error) msg.error = error;
    this.broadcast(msg);
  }

  close() {
    this.server.stop();
  }

  private broadcast(msg: object) {
    const data = JSON.stringify(msg);
    for (const ws of this.clients) {
      ws.send(data);
    }
  }
}
