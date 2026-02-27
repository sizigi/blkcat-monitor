import type { SessionInfo, ServerToAgentMessage, AgentHookEventMessage, CliTool } from "@blkcat/shared";

interface AgentListenerOptions {
  port: number;
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
  onRediscover?: () => void;
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
            } else if (msg.type === "rediscover") {
              this.opts.onRediscover?.();
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

  sendOutput(sessionId: string, lines: string[], waitingForInput?: boolean, cursor?: { x: number; y: number }) {
    const msg: Record<string, any> = {
      type: "output",
      machineId: this.machineId,
      sessionId,
      lines,
      timestamp: Date.now(),
    };
    if (waitingForInput) msg.waitingForInput = true;
    if (cursor) msg.cursor = cursor;
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

  sendDeployResult(requestId: string, success: boolean, error?: string) {
    const msg: Record<string, any> = {
      type: "deploy_result",
      machineId: this.machineId,
      requestId,
      success,
    };
    if (error) msg.error = error;
    this.broadcast(msg);
  }

  sendSettingsSnapshot(requestId: string, settings: Record<string, unknown>, scope: "global" | "project", deployedSkills?: string[]) {
    const msg: Record<string, any> = {
      type: "settings_snapshot",
      machineId: this.machineId,
      requestId,
      settings,
      scope,
    };
    if (deployedSkills) msg.deployedSkills = deployedSkills;
    this.broadcast(msg);
  }

  sendSettingsResult(requestId: string, success: boolean, error?: string) {
    const msg: Record<string, any> = {
      type: "settings_result",
      machineId: this.machineId,
      requestId,
      success,
    };
    if (error) msg.error = error;
    this.broadcast(msg);
  }

  sendReloadResult(sessionId: string, success: boolean, error?: string) {
    const msg: Record<string, any> = {
      type: "reload_session_result",
      machineId: this.machineId,
      sessionId,
      success,
    };
    if (error) msg.error = error;
    this.broadcast(msg);
  }

  sendCreateDirectoryResult(requestId: string, path: string, success: boolean, error?: string) {
    const msg: Record<string, any> = {
      type: "create_directory_result",
      machineId: this.machineId,
      requestId,
      path,
      success,
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
