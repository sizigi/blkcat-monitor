import type { SessionInfo, ServerToAgentMessage } from "@blkcat/shared";

interface AgentConnectionOptions {
  serverUrl: string;
  machineId: string;
  onInput: (msg: { sessionId: string; text?: string; key?: string; data?: string }) => void;
  onStartSession?: (args?: string) => void;
}

export class AgentConnection {
  private ws: WebSocket;
  private openPromise: Promise<void>;

  constructor(private opts: AgentConnectionOptions) {
    this.ws = new WebSocket(opts.serverUrl);

    this.openPromise = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve());
      this.ws.addEventListener("error", (ev) => {
        const msg = (ev as ErrorEvent).message ?? "unknown error";
        reject(new Error(`WebSocket error: ${msg}`));
      });
      this.ws.addEventListener("close", (ev) => {
        const { code, reason } = ev as CloseEvent;
        reject(new Error(`WebSocket closed before open: code=${code} reason=${reason}`));
      });
    });

    this.ws.addEventListener("message", (ev) => {
      try {
        const msg: ServerToAgentMessage = JSON.parse(ev.data as string);
        if (msg.type === "input") {
          opts.onInput({ sessionId: msg.sessionId, text: msg.text, key: msg.key, data: msg.data });
        } else if (msg.type === "start_session") {
          opts.onStartSession?.(msg.args);
        }
      } catch {}
    });
  }

  waitForOpen(): Promise<void> { return this.openPromise; }

  register(sessions: SessionInfo[]) {
    this.ws.send(JSON.stringify({
      type: "register",
      machineId: this.opts.machineId,
      sessions,
    }));
  }

  sendOutput(sessionId: string, lines: string[]) {
    this.ws.send(JSON.stringify({
      type: "output",
      machineId: this.opts.machineId,
      sessionId,
      lines,
      timestamp: Date.now(),
    }));
  }

  updateSessions(sessions: SessionInfo[]) {
    this.ws.send(JSON.stringify({
      type: "sessions",
      machineId: this.opts.machineId,
      sessions,
    }));
  }

  close() { this.ws.close(); }
}
