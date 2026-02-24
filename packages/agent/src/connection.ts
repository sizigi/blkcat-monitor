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
  onDeploySkills?: (requestId: string, skills: { name: string; files: { path: string; content: string }[] }[]) => void;
  onRemoveSkills?: (requestId: string, skillNames: string[]) => void;
  onGetSettings?: (requestId: string, scope: "global" | "project", projectPath?: string) => void;
  onUpdateSettings?: (requestId: string, scope: "global" | "project", settings: Record<string, unknown>, projectPath?: string) => void;
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
          opts.onStartSession?.(msg.args, msg.cwd, msg.name, msg.cliTool);
        } else if (msg.type === "close_session") {
          opts.onCloseSession?.(msg.sessionId);
        } else if (msg.type === "resize") {
          opts.onResize?.(msg.sessionId, msg.cols, msg.rows);
        } else if (msg.type === "request_scrollback") {
          opts.onRequestScrollback?.(msg.sessionId);
        } else if (msg.type === "reload_session") {
          opts.onReloadSession?.(msg.sessionId, msg.args, msg.resume);
        } else if (msg.type === "list_directory") {
          opts.onListDirectory?.(msg.requestId, msg.path);
        } else if (msg.type === "deploy_skills") {
          opts.onDeploySkills?.(msg.requestId, msg.skills);
        } else if (msg.type === "remove_skills") {
          opts.onRemoveSkills?.(msg.requestId, msg.skillNames);
        } else if (msg.type === "get_settings") {
          opts.onGetSettings?.(msg.requestId, msg.scope, msg.projectPath);
        } else if (msg.type === "update_settings") {
          opts.onUpdateSettings?.(msg.requestId, msg.scope, msg.settings, msg.projectPath);
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

  sendDeployResult(requestId: string, success: boolean, error?: string) {
    const msg: Record<string, any> = {
      type: "deploy_result",
      machineId: this.opts.machineId,
      requestId,
      success,
    };
    if (error) msg.error = error;
    this.ws.send(JSON.stringify(msg));
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
    this.ws.send(JSON.stringify(msg));
  }

  sendSettingsResult(requestId: string, success: boolean, error?: string) {
    const msg: Record<string, any> = {
      type: "settings_result",
      machineId: this.opts.machineId,
      requestId,
      success,
    };
    if (error) msg.error = error;
    this.ws.send(JSON.stringify(msg));
  }

  sendReloadResult(sessionId: string, success: boolean, error?: string) {
    const msg: Record<string, any> = {
      type: "reload_session_result",
      machineId: this.opts.machineId,
      sessionId,
      success,
    };
    if (error) msg.error = error;
    this.ws.send(JSON.stringify(msg));
  }

  close() { this.ws.close(); }
}
