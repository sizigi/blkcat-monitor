import type { SessionInfo, ServerToAgentMessage, AgentHookEventMessage } from "@blkcat/shared";

interface AgentConnectionOptions {
  serverUrl: string;
  machineId: string;
  onInput: (msg: { sessionId: string; text?: string; key?: string; data?: string }) => void;
  onStartSession?: (args?: string, cwd?: string) => void;
  onCloseSession?: (sessionId: string) => void;
  onResize?: (sessionId: string, cols: number, rows: number) => void;
  onRequestScrollback?: (sessionId: string) => void;
  onReloadSession?: (sessionId: string) => void;
  onListDirectory?: (requestId: string, path: string) => void;
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
          opts.onStartSession?.(msg.args, msg.cwd);
        } else if (msg.type === "close_session") {
          opts.onCloseSession?.(msg.sessionId);
        } else if (msg.type === "resize") {
          opts.onResize?.(msg.sessionId, msg.cols, msg.rows);
        } else if (msg.type === "request_scrollback") {
          opts.onRequestScrollback?.(msg.sessionId);
        } else if (msg.type === "reload_session") {
          opts.onReloadSession?.(msg.sessionId);
        } else if (msg.type === "list_directory") {
          opts.onListDirectory?.(msg.requestId, msg.path);
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

  sendOutput(sessionId: string, lines: string[], waitingForInput?: boolean) {
    const msg: Record<string, any> = {
      type: "output",
      machineId: this.opts.machineId,
      sessionId,
      lines,
      timestamp: Date.now(),
    };
    if (waitingForInput) msg.waitingForInput = true;
    this.ws.send(JSON.stringify(msg));
  }

  updateSessions(sessions: SessionInfo[]) {
    this.ws.send(JSON.stringify({
      type: "sessions",
      machineId: this.opts.machineId,
      sessions,
    }));
  }

  sendScrollback(sessionId: string, lines: string[]) {
    this.ws.send(JSON.stringify({
      type: "scrollback",
      machineId: this.opts.machineId,
      sessionId,
      lines,
    }));
  }

  sendHookEvent(event: AgentHookEventMessage) {
    this.ws.send(JSON.stringify(event));
  }

  sendDirectoryListing(machineId: string, requestId: string, path: string, entries: { name: string; isDir: boolean }[], error?: string) {
    const msg: Record<string, any> = {
      type: "directory_listing",
      machineId,
      requestId,
      path,
      entries,
    };
    if (error) msg.error = error;
    this.ws.send(JSON.stringify(msg));
  }

  close() { this.ws.close(); }
}
