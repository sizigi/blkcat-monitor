import {
  type AgentToServerMessage,
  type AgentHookEventMessage,
  type MachineSnapshot,
  type OutboundAgentInfo,
  type SessionInfo,
  parseAgentMessage,
  parseDashboardMessage,
  NOTIFY_HOOK_EVENTS,
} from "@blkcat/shared";
import type { DisplayNames } from "./display-names-store";

interface ServerOptions {
  port: number;
  hostname?: string;
  staticDir?: string;
  skillsDir?: string;
  agents?: string[];
  onAgentsSaved?: (addresses: string[]) => void;
  /** Shell command to run when Claude is waiting for user input.
   *  Triggered by Stop, Notification, and PermissionRequest hook events. */
  notifyCommand?: string;
  notifyEnv?: Record<string, string>;
  displayNames?: DisplayNames;
  onDisplayNamesSaved?: (names: DisplayNames) => void;
}

interface WsData {
  role: "agent" | "dashboard";
  machineId?: string;
  dashboardId?: string;
}

interface AgentSocket {
  send(data: string): void;
  machineId?: string;
}

const MAX_HOOK_EVENTS = 100;

interface MachineState {
  agent: AgentSocket;
  sessions: SessionInfo[];
  lastSeen: number;
  lastOutputs: Map<string, AgentToServerMessage>;
  hookEvents: AgentHookEventMessage[];
}

interface OutboundAgent {
  address: string;
  status: "connecting" | "connected" | "disconnected";
  source: "env" | "api";
  ws: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  removed: boolean;
}

async function readSkillsDir(dir: string): Promise<{ name: string; files: { path: string; content: string }[] }[]> {
  const { readdir, stat } = await import("fs/promises");
  const { join, relative } = await import("path");

  const entries = await readdir(dir);
  const skills: { name: string; files: { path: string; content: string }[] }[] = [];

  for (const entry of entries) {
    const entryPath = join(dir, entry);
    const s = await stat(entryPath);
    if (!s.isDirectory()) continue;

    const files: { path: string; content: string }[] = [];
    async function walk(p: string) {
      const items = await readdir(p);
      for (const item of items) {
        const full = join(p, item);
        const st = await stat(full);
        if (st.isDirectory()) {
          await walk(full);
        } else {
          const content = await Bun.file(full).text();
          files.push({ path: relative(entryPath, full), content });
        }
      }
    }
    await walk(entryPath);
    skills.push({ name: entry, files });
  }

  return skills;
}

export function createServer(opts: ServerOptions) {
  const machines = new Map<string, MachineState>();
  const dashboards = new Set<any>();
  const outboundAgents = new Map<string, OutboundAgent>();
  const inboundAgents = new WeakMap<object, AgentSocket>();
  let dashboardCounter = 0;
  // Track which dashboard most recently sent input per session (machineId:sessionId)
  const activeResizeOwner = new Map<string, { dashboardId: string; lastInputAt: number }>();
  const RESIZE_OWNER_STALE_MS = 10_000;
  // Track last resize dimensions per session so we can reject shrinking when no owner
  const lastResizeDims = new Map<string, { cols: number; rows: number }>();
  const displayNames: DisplayNames = opts.displayNames
    ? { machines: { ...opts.displayNames.machines }, sessions: { ...opts.displayNames.sessions } }
    : { machines: {}, sessions: {} };

  function broadcastToDashboards(msg: object) {
    const data = JSON.stringify(msg);
    for (const ws of dashboards) {
      ws.send(data);
    }
  }

  function getSnapshot(): MachineSnapshot[] {
    return Array.from(machines.entries()).map(([id, state]) => ({
      machineId: id,
      sessions: state.sessions,
      lastSeen: state.lastSeen,
      recentEvents: state.hookEvents.length > 0 ? state.hookEvents : undefined,
    }));
  }

  function handleAgentMessage(agent: AgentSocket, raw: string) {
    const msg = parseAgentMessage(raw);
    if (!msg) return;

    if (msg.type === "register") {
      agent.machineId = msg.machineId;
      machines.set(msg.machineId, {
        agent, sessions: msg.sessions, lastSeen: Date.now(),
        lastOutputs: new Map(),
        hookEvents: [],
      });
      broadcastToDashboards({
        type: "machine_update",
        machineId: msg.machineId,
        sessions: msg.sessions,
      });
    } else if (msg.type === "output") {
      const machine = machines.get(msg.machineId);
      if (machine) {
        machine.lastSeen = Date.now();
        machine.lastOutputs.set(msg.sessionId, msg);
      }
      broadcastToDashboards(msg);
    } else if (msg.type === "sessions") {
      const machine = machines.get(msg.machineId);
      if (machine) {
        machine.sessions = msg.sessions;
        machine.lastSeen = Date.now();
      }
      broadcastToDashboards({
        type: "machine_update",
        machineId: msg.machineId,
        sessions: msg.sessions,
      });
    } else if (msg.type === "scrollback") {
      broadcastToDashboards(msg);
    } else if (msg.type === "hook_event") {
      const machine = machines.get(msg.machineId);
      if (machine) {
        machine.lastSeen = Date.now();
        machine.hookEvents.push(msg);
        if (machine.hookEvents.length > MAX_HOOK_EVENTS) {
          machine.hookEvents.shift();
        }
      }
      broadcastToDashboards(msg);
      if (opts.notifyCommand && NOTIFY_HOOK_EVENTS.has(msg.hookEventName)) {
        console.log(`[notify] ${msg.hookEventName} from ${msg.machineId}/${msg.sessionId ?? "?"}`);
        Bun.spawn(["sh", "-c", opts.notifyCommand], {
          stdout: "ignore",
          stderr: "ignore",
          env: {
            ...process.env,
            ...opts.notifyEnv,
            BLKCAT_MACHINE_ID: msg.machineId,
            BLKCAT_SESSION_ID: msg.sessionId ?? "",
            BLKCAT_HOOK_EVENT: msg.hookEventName,
          },
        });
      }
    } else if (msg.type === "directory_listing") {
      broadcastToDashboards(msg);
    } else if (msg.type === "create_directory_result") {
      broadcastToDashboards(msg);
    } else if (msg.type === "deploy_result" || msg.type === "settings_snapshot" || msg.type === "settings_result" || msg.type === "reload_session_result") {
      broadcastToDashboards(msg);
    }
  }

  function handleAgentClose(agent: AgentSocket) {
    if (agent.machineId) {
      machines.delete(agent.machineId);
      broadcastToDashboards({
        type: "machine_update",
        machineId: agent.machineId,
        sessions: [],
        online: false,
      });
    }
  }

  function getApiAgentAddresses(): string[] {
    return Array.from(outboundAgents.values())
      .filter((a) => a.source === "api")
      .map((a) => a.address);
  }

  function connectToAgent(address: string, source: "env" | "api"): boolean {
    if (outboundAgents.has(address)) return false;

    const entry: OutboundAgent = {
      address,
      status: "connecting",
      source,
      ws: null,
      reconnectTimer: null,
      removed: false,
    };
    outboundAgents.set(address, entry);

    if (source === "api" && opts.onAgentsSaved) {
      opts.onAgentsSaved(getApiAgentAddresses());
    }

    let delay = 1000;
    const MAX_DELAY = 30000;

    function connect() {
      if (entry.removed) return;
      entry.status = "connecting";

      const ws = new WebSocket(`ws://${address}`);
      entry.ws = ws;
      const agent: AgentSocket = {
        send(data: string) { if (ws.readyState === WebSocket.OPEN) ws.send(data); },
      };

      ws.addEventListener("message", (ev) => {
        const raw = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);
        handleAgentMessage(agent, raw);
      });

      ws.addEventListener("open", () => {
        delay = 1000;
        entry.status = "connected";
      });

      ws.addEventListener("close", () => {
        handleAgentClose(agent);
        if (entry.removed) return;
        entry.status = "disconnected";
        entry.ws = null;
        entry.reconnectTimer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, MAX_DELAY);
      });

      ws.addEventListener("error", () => {
        // close event will fire after error, reconnect happens there
      });
    }

    connect();
    return true;
  }

  function disconnectAgent(address: string): boolean {
    const entry = outboundAgents.get(address);
    if (!entry) return false;

    const wasApi = entry.source === "api";
    entry.removed = true;
    if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
    if (entry.ws) {
      try { entry.ws.close(); } catch {}
    }
    outboundAgents.delete(address);

    if (wasApi && opts.onAgentsSaved) {
      opts.onAgentsSaved(getApiAgentAddresses());
    }
    return true;
  }

  const server = Bun.serve({
    port: opts.port,
    hostname: opts.hostname,
    async fetch(req, server) {
      const url = new URL(req.url);
      if (url.pathname === "/ws/agent") {
        const ok = server.upgrade(req, {
          data: { role: "agent" } as WsData,
        });
        return ok ? undefined : new Response("Upgrade failed", { status: 500 });
      }

      if (url.pathname === "/ws/dashboard") {
        const ok = server.upgrade(req, {
          data: { role: "dashboard", dashboardId: `dash-${dashboardCounter++}` } as WsData,
        });
        return ok ? undefined : new Response("Upgrade failed", { status: 500 });
      }

      if (url.pathname === "/api/sessions") {
        return Response.json({ machines: getSnapshot() });
      }

      if (url.pathname === "/api/agents") {
        if (req.method === "GET") {
          const agents: OutboundAgentInfo[] = Array.from(outboundAgents.values()).map((a) => ({
            address: a.address,
            status: a.status,
            source: a.source,
          }));
          return Response.json({ agents });
        }

        if (req.method === "POST") {
          const body = await req.json() as { address?: string };
          if (!body.address || typeof body.address !== "string") {
            return Response.json({ error: "address is required" }, { status: 400 });
          }
          const added = connectToAgent(body.address, "api");
          if (!added) {
            return Response.json({ error: "agent already exists" }, { status: 409 });
          }
          return Response.json({ ok: true }, { status: 201 });
        }
      }

      if (url.pathname === "/api/skills" && req.method === "GET") {
        if (!opts.skillsDir) {
          return Response.json({ skills: [] });
        }
        try {
          const skills = await readSkillsDir(opts.skillsDir);
          return Response.json({ skills });
        } catch (err: any) {
          return Response.json({ skills: [], error: err?.message }, { status: 500 });
        }
      }

      if (url.pathname.startsWith("/api/agents/") && req.method === "DELETE") {
        const address = decodeURIComponent(url.pathname.slice("/api/agents/".length));
        const removed = disconnectAgent(address);
        if (!removed) {
          return Response.json({ error: "agent not found" }, { status: 404 });
        }
        return Response.json({ ok: true });
      }

      if (opts.staticDir) {
        const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
        const file = Bun.file(`${opts.staticDir}${filePath}`);
        return new Response(file);
      }

      return new Response("Not found", { status: 404 });
    },
    websocket: {
      open(ws) {
        const data = ws.data as WsData;
        if (data.role === "dashboard") {
          dashboards.add(ws);
          const snapshotMsg: Record<string, any> = { type: "snapshot", machines: getSnapshot() };
          if (Object.keys(displayNames.machines).length > 0 || Object.keys(displayNames.sessions).length > 0) {
            snapshotMsg.displayNames = displayNames;
          }
          ws.send(JSON.stringify(snapshotMsg));
          for (const machine of machines.values()) {
            for (const output of machine.lastOutputs.values()) {
              ws.send(JSON.stringify(output));
            }
          }
        } else if (data.role === "agent") {
          inboundAgents.set(ws, { send(d: string) { ws.send(d); } });
        }
      },
      message(ws, message) {
        const data = ws.data as WsData;
        const raw = typeof message === "string" ? message : new TextDecoder().decode(message as ArrayBuffer);

        if (data.role === "agent") {
          const agent = inboundAgents.get(ws);
          if (!agent) return;
          handleAgentMessage(agent, raw);
        } else if (data.role === "dashboard") {
          const msg = parseDashboardMessage(raw);
          if (!msg) return;

          if (msg.type === "input") {
            const machine = machines.get(msg.machineId);
            if (machine) {
              // Track this dashboard as the active resize owner for this session
              const dashId = (ws.data as WsData).dashboardId;
              if (dashId) {
                const ownerKey = `${msg.machineId}:${msg.sessionId}`;
                activeResizeOwner.set(ownerKey, { dashboardId: dashId, lastInputAt: Date.now() });
              }
              const fwd: Record<string, any> = {
                type: "input",
                sessionId: msg.sessionId,
              };
              if (msg.text) fwd.text = msg.text;
              if (msg.key) fwd.key = msg.key;
              if (msg.data) fwd.data = msg.data;
              machine.agent.send(JSON.stringify(fwd));
            }
          } else if (msg.type === "start_session") {
            const machine = machines.get(msg.machineId);
            if (machine) {
              const fwd: Record<string, any> = { type: "start_session" };
              if (msg.args) fwd.args = msg.args;
              if (msg.cwd) fwd.cwd = msg.cwd;
              if (msg.name) fwd.name = msg.name;
              if (msg.cliTool) fwd.cliTool = msg.cliTool;
              machine.agent.send(JSON.stringify(fwd));
            }
          } else if (msg.type === "close_session") {
            const machine = machines.get(msg.machineId);
            if (machine) {
              machine.agent.send(JSON.stringify({
                type: "close_session",
                sessionId: msg.sessionId,
              }));
            }
          } else if (msg.type === "resize") {
            const machine = machines.get(msg.machineId);
            if (machine) {
              const dashId = (ws.data as WsData).dashboardId;
              const ownerKey = `${msg.machineId}:${msg.sessionId}`;
              const owner = activeResizeOwner.get(ownerKey);
              let allowed: boolean;
              if (msg.force === true) {
                // Force fit always goes through
                allowed = true;
              } else if (owner && owner.dashboardId === dashId) {
                // Active owner can always resize
                allowed = true;
              } else if (owner && (Date.now() - owner.lastInputAt <= RESIZE_OWNER_STALE_MS)) {
                // Non-owner blocked while owner is fresh
                allowed = false;
              } else {
                // No owner or stale owner: only allow if not shrinking
                const prev = lastResizeDims.get(ownerKey);
                allowed = !prev || (msg.cols >= prev.cols && msg.rows >= prev.rows);
              }
              if (allowed) {
                lastResizeDims.set(ownerKey, { cols: msg.cols, rows: msg.rows });
                machine.agent.send(JSON.stringify({
                  type: "resize",
                  sessionId: msg.sessionId,
                  cols: msg.cols,
                  rows: msg.rows,
                }));
              }
            }
          } else if (msg.type === "request_scrollback") {
            const machine = machines.get(msg.machineId);
            if (machine) {
              machine.agent.send(JSON.stringify({
                type: "request_scrollback",
                sessionId: msg.sessionId,
              }));
            }
          } else if (msg.type === "reload_session") {
            const machine = machines.get(msg.machineId);
            if (machine) {
              machine.agent.send(JSON.stringify({
                type: "reload_session",
                sessionId: msg.sessionId,
                args: msg.args,
                resume: msg.resume,
              }));
            }
          } else if (msg.type === "list_directory") {
            const machine = machines.get(msg.machineId);
            if (machine) {
              machine.agent.send(JSON.stringify({
                type: "list_directory",
                requestId: msg.requestId,
                path: msg.path,
              }));
            }
          } else if (msg.type === "create_directory") {
            const machine = machines.get(msg.machineId);
            if (machine) {
              machine.agent.send(JSON.stringify({
                type: "create_directory",
                requestId: msg.requestId,
                path: msg.path,
              }));
            }
          } else if (msg.type === "deploy_skills") {
            const machine = machines.get(msg.machineId);
            if (machine) {
              machine.agent.send(JSON.stringify({
                type: "deploy_skills",
                requestId: msg.requestId,
                skills: msg.skills,
              }));
            }
          } else if (msg.type === "remove_skills") {
            const machine = machines.get(msg.machineId);
            if (machine) {
              machine.agent.send(JSON.stringify({
                type: "remove_skills",
                requestId: msg.requestId,
                skillNames: msg.skillNames,
              }));
            }
          } else if (msg.type === "get_settings") {
            const machine = machines.get(msg.machineId);
            if (machine) {
              const fwd: Record<string, any> = {
                type: "get_settings",
                requestId: msg.requestId,
                scope: msg.scope,
              };
              if (msg.projectPath) fwd.projectPath = msg.projectPath;
              machine.agent.send(JSON.stringify(fwd));
            }
          } else if (msg.type === "update_settings") {
            const machine = machines.get(msg.machineId);
            if (machine) {
              const fwd: Record<string, any> = {
                type: "update_settings",
                requestId: msg.requestId,
                scope: msg.scope,
                settings: msg.settings,
              };
              if (msg.projectPath) fwd.projectPath = msg.projectPath;
              machine.agent.send(JSON.stringify(fwd));
            }
          } else if (msg.type === "set_display_name") {
            if (msg.target === "machine") {
              if (msg.name) {
                displayNames.machines[msg.machineId] = msg.name;
              } else {
                delete displayNames.machines[msg.machineId];
              }
            } else if (msg.target === "session" && msg.sessionId) {
              const key = `${msg.machineId}:${msg.sessionId}`;
              if (msg.name) {
                displayNames.sessions[key] = msg.name;
              } else {
                delete displayNames.sessions[key];
              }
            }
            broadcastToDashboards({
              type: "display_name_update",
              target: msg.target,
              machineId: msg.machineId,
              sessionId: msg.sessionId,
              name: msg.name,
            });
            if (opts.onDisplayNamesSaved) {
              opts.onDisplayNamesSaved(displayNames);
            }
          }
        }
      },
      close(ws) {
        const data = ws.data as WsData;
        if (data.role === "dashboard") {
          dashboards.delete(ws);
          // Clean up resize ownership for this dashboard
          if (data.dashboardId) {
            for (const [key, owner] of activeResizeOwner) {
              if (owner.dashboardId === data.dashboardId) {
                activeResizeOwner.delete(key);
              }
            }
          }
        } else if (data.role === "agent") {
          const agent = inboundAgents.get(ws);
          if (agent) handleAgentClose(agent);
        }
      },
    },
  });

  // Connect to agents that are in listener mode
  if (opts.agents) {
    for (const address of opts.agents) {
      connectToAgent(address, "env");
    }
  }

  return {
    port: server.port,
    connectToAgent,
    stop: (closeActiveConnections?: boolean) => {
      for (const entry of outboundAgents.values()) {
        entry.removed = true;
        if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
        if (entry.ws) {
          try { entry.ws.close(); } catch {}
        }
      }
      outboundAgents.clear();
      server.stop(closeActiveConnections);
    },
  };
}
