import type { SessionInfo, ServerToAgentMessage } from "@blkcat/shared";

interface AgentConnectionOptions {
  serverUrl: string;
  secret: string;
  machineId: string;
  onInput: (msg: { sessionId: string; text: string }) => void;
}

export class AgentConnection {
  private ws: WebSocket;
  private openPromise: Promise<void>;

  constructor(private opts: AgentConnectionOptions) {
    const url = `${opts.serverUrl}?secret=${encodeURIComponent(opts.secret)}`;
    this.ws = new WebSocket(url);

    this.openPromise = new Promise((resolve) => {
      this.ws.addEventListener("open", () => resolve());
    });

    this.ws.addEventListener("message", (ev) => {
      try {
        const msg: ServerToAgentMessage = JSON.parse(ev.data as string);
        if (msg.type === "input") {
          opts.onInput({ sessionId: msg.sessionId, text: msg.text });
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
