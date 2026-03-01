import type { SessionInfo, ServerToAgentMessage, AgentHookEventMessage, CliTool } from "@blkcat/shared";

interface AgentConnectionOptions {
  serverUrl: string;
  machineId: string;
  onInput: (msg: { sessionId: string; text?: string; key?: string; data?: string }) => void;
  onStartSession?: (args?: string, cwd?: string, name?: string, cliTool?: CliTool) => void;
  onCloseSession?: (sessionId: string) => void;
  onResize?: (sessionId: string, cols: number, rows: number) => void;
  onRequestScrollback?: (sessionId: string) => void;
  onReloadSession?: (sessionId: string, args?: string, resume?: boolean) => void;
  onListDirectory?: (requestId: string, path: string) => void;
  onCreateDirectory?: (requestId: string, path: string) => void;
  onDeploySkills?: (requestId: string, skills: { name: string; files: { path: string; content: string }[] }[]) => void;
  onRemoveSkills?: (requestId: string, skillNames: string[]) => void;
  onGetSettings?: (requestId: string, scope: "global" | "project", projectPath?: string) => void;
  onUpdateSettings?: (requestId: string, scope: "global" | "project", settings: Record<string, unknown>, projectPath?: string) => void;
  onRenameSession?: (sessionId: string, name: string) => void;
  onSwapPane?: (sessionId1: string, sessionId2: string) => void;
  onSwapWindow?: (sessionId1: string, sessionId2: string) => void;
  onMovePane?: (sessionId: string, targetSessionId: string, before: boolean) => void;
  onMoveWindow?: (sessionId: string, targetSessionId: string, before: boolean) => void;
  onRediscover?: () => void;
  /** Called after a successful reconnection (not the initial connect). */
  onReconnect?: () => void;
  /** Returns the current session list so reconnect can re-register with up-to-date data. */
  getSessions?: () => SessionInfo[];
}

export class AgentConnection {
  private ws!: WebSocket;
  private openPromise: Promise<void>;
  private connected = false;
  private closed = false;
  private delay = 1000;
  private readonly MAX_DELAY = 30000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private opts: AgentConnectionOptions) {
    this.openPromise = new Promise((resolve, reject) => {
      this.connect(resolve, reject);
    });
  }

  private connect(
    onFirstOpen?: () => void,
    onFirstFail?: (err: Error) => void,
  ) {
    const ws = new WebSocket(this.opts.serverUrl);
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.connected = true;
      this.delay = 1000;

      if (onFirstOpen) {
        // Initial connection — resolve waitForOpen()
        onFirstOpen();
        onFirstOpen = undefined;
        onFirstFail = undefined;
      } else {
        // Reconnection — re-register and notify caller
        const sessions = this.opts.getSessions?.() ?? [];
        this.register(sessions);
        console.log(`Reconnected to ${this.opts.serverUrl}`);
        this.opts.onReconnect?.();
      }
    });

    ws.addEventListener("close", () => {
      this.connected = false;

      if (onFirstFail) {
        // Never opened — reject waitForOpen()
        onFirstFail(new Error(`WebSocket closed before open`));
        onFirstOpen = undefined;
        onFirstFail = undefined;
        return;
      }

      if (this.closed) return;

      // Schedule reconnection with exponential backoff
      console.log(`Disconnected from server, reconnecting in ${this.delay}ms...`);
      this.reconnectTimer = setTimeout(() => this.connect(), this.delay);
      this.delay = Math.min(this.delay * 2, this.MAX_DELAY);
    });

    ws.addEventListener("error", () => {
      // close event will fire after error, reconnect happens there
    });

    ws.addEventListener("message", (ev) => {
      try {
        const msg: ServerToAgentMessage = JSON.parse(ev.data as string);
        if (msg.type === "input") {
          this.opts.onInput({ sessionId: msg.sessionId, text: msg.text, key: msg.key, data: msg.data });
        } else if (msg.type === "start_session") {
          this.opts.onStartSession?.(msg.args, msg.cwd, msg.name, msg.cliTool);
        } else if (msg.type === "close_session") {
          this.opts.onCloseSession?.(msg.sessionId);
        } else if (msg.type === "resize") {
          this.opts.onResize?.(msg.sessionId, msg.cols, msg.rows);
        } else if (msg.type === "request_scrollback") {
          this.opts.onRequestScrollback?.(msg.sessionId);
        } else if (msg.type === "reload_session") {
          this.opts.onReloadSession?.(msg.sessionId, msg.args, msg.resume);
        } else if (msg.type === "list_directory") {
          this.opts.onListDirectory?.(msg.requestId, msg.path);
        } else if (msg.type === "create_directory") {
          this.opts.onCreateDirectory?.(msg.requestId, msg.path);
        } else if (msg.type === "deploy_skills") {
          this.opts.onDeploySkills?.(msg.requestId, msg.skills);
        } else if (msg.type === "remove_skills") {
          this.opts.onRemoveSkills?.(msg.requestId, msg.skillNames);
        } else if (msg.type === "get_settings") {
          this.opts.onGetSettings?.(msg.requestId, msg.scope, msg.projectPath);
        } else if (msg.type === "update_settings") {
          this.opts.onUpdateSettings?.(msg.requestId, msg.scope, msg.settings, msg.projectPath);
        } else if (msg.type === "rename_session") {
          this.opts.onRenameSession?.(msg.sessionId, msg.name);
        } else if (msg.type === "swap_pane") {
          this.opts.onSwapPane?.(msg.sessionId1, msg.sessionId2);
        } else if (msg.type === "swap_window") {
          this.opts.onSwapWindow?.(msg.sessionId1, msg.sessionId2);
        } else if (msg.type === "move_pane") {
          this.opts.onMovePane?.(msg.sessionId, msg.targetSessionId, msg.before);
        } else if (msg.type === "move_window") {
          this.opts.onMoveWindow?.(msg.sessionId, msg.targetSessionId, msg.before);
        } else if (msg.type === "rediscover") {
          this.opts.onRediscover?.();
        }
      } catch {}
    });
  }

  private safeSend(data: string) {
    if (this.connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  waitForOpen(): Promise<void> { return this.openPromise; }

  register(sessions: SessionInfo[]) {
    this.safeSend(JSON.stringify({
      type: "register",
      machineId: this.opts.machineId,
      sessions,
    }));
  }

  sendOutput(sessionId: string, lines: string[], waitingForInput?: boolean, cursor?: { x: number; y: number }) {
    const msg: Record<string, any> = {
      type: "output",
      machineId: this.opts.machineId,
      sessionId,
      lines,
      timestamp: Date.now(),
    };
    if (waitingForInput) msg.waitingForInput = true;
    if (cursor) msg.cursor = cursor;
    this.safeSend(JSON.stringify(msg));
  }

  updateSessions(sessions: SessionInfo[]) {
    this.safeSend(JSON.stringify({
      type: "sessions",
      machineId: this.opts.machineId,
      sessions,
    }));
  }

  sendScrollback(sessionId: string, lines: string[]) {
    this.safeSend(JSON.stringify({
      type: "scrollback",
      machineId: this.opts.machineId,
      sessionId,
      lines,
    }));
  }

  sendHookEvent(event: AgentHookEventMessage) {
    this.safeSend(JSON.stringify(event));
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
    this.safeSend(JSON.stringify(msg));
  }

  sendDeployResult(requestId: string, success: boolean, error?: string) {
    const msg: Record<string, any> = {
      type: "deploy_result",
      machineId: this.opts.machineId,
      requestId,
      success,
    };
    if (error) msg.error = error;
    this.safeSend(JSON.stringify(msg));
  }

  sendSettingsSnapshot(requestId: string, settings: Record<string, unknown>, scope: "global" | "project", deployedSkills?: string[]) {
    const msg: Record<string, any> = {
      type: "settings_snapshot",
      machineId: this.opts.machineId,
      requestId,
      settings,
      scope,
    };
    if (deployedSkills) msg.deployedSkills = deployedSkills;
    this.safeSend(JSON.stringify(msg));
  }

  sendSettingsResult(requestId: string, success: boolean, error?: string) {
    const msg: Record<string, any> = {
      type: "settings_result",
      machineId: this.opts.machineId,
      requestId,
      success,
    };
    if (error) msg.error = error;
    this.safeSend(JSON.stringify(msg));
  }

  sendReloadResult(sessionId: string, success: boolean, error?: string) {
    const msg: Record<string, any> = {
      type: "reload_session_result",
      machineId: this.opts.machineId,
      sessionId,
      success,
    };
    if (error) msg.error = error;
    this.safeSend(JSON.stringify(msg));
  }

  sendCreateDirectoryResult(requestId: string, path: string, success: boolean, error?: string) {
    const msg: Record<string, any> = {
      type: "create_directory_result",
      machineId: this.opts.machineId,
      requestId,
      path,
      success,
    };
    if (error) msg.error = error;
    this.safeSend(JSON.stringify(msg));
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.ws.close();
  }
}
