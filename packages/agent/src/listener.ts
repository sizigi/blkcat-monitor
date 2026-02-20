import type { SessionInfo, ServerToAgentMessage } from "@blkcat/shared";

interface AgentListenerOptions {
  port: number;
  machineId: string;
  onInput: (msg: { sessionId: string; text?: string; key?: string; data?: string }) => void;
  onStartSession?: (args?: string, cwd?: string) => void;
  onCloseSession?: (sessionId: string) => void;
  onResize?: (sessionId: string, cols: number, rows: number) => void;
}

export class AgentListener {
  private server: ReturnType<typeof Bun.serve>;
  private clients = new Set<any>();
  private machineId: string;
  private currentSessions: SessionInfo[] = [];
  private opts: AgentListenerOptions;

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
        },
        message: (_ws, message) => {
          try {
            const raw = typeof message === "string" ? message : new TextDecoder().decode(message as ArrayBuffer);
            const msg: ServerToAgentMessage = JSON.parse(raw);
            if (msg.type === "input") {
              this.opts.onInput({ sessionId: msg.sessionId, text: msg.text, key: msg.key, data: msg.data });
            } else if (msg.type === "start_session") {
              this.opts.onStartSession?.(msg.args, msg.cwd);
            } else if (msg.type === "close_session") {
              this.opts.onCloseSession?.(msg.sessionId);
            } else if (msg.type === "resize") {
              this.opts.onResize?.(msg.sessionId, msg.cols, msg.rows);
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
