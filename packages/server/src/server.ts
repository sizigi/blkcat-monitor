import {
  type AgentToServerMessage,
  type MachineSnapshot,
  type OutboundAgentInfo,
  type SessionInfo,
  parseAgentMessage,
  parseDashboardMessage,
} from "@blkcat/shared";

interface ServerOptions {
  port: number;
  hostname?: string;
  staticDir?: string;
  agents?: string[];
}

interface WsData {
  role: "agent" | "dashboard";
  machineId?: string;
}

interface AgentSocket {
  send(data: string): void;
  machineId?: string;
}

interface MachineState {
  agent: AgentSocket;
  sessions: SessionInfo[];
  lastSeen: number;
  lastOutputs: Map<string, AgentToServerMessage>;
}

interface OutboundAgent {
  address: string;
  status: "connecting" | "connected" | "disconnected";
  source: "env" | "api";
  ws: WebSocket | null;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  removed: boolean;
}

export function createServer(opts: ServerOptions) {
  const machines = new Map<string, MachineState>();
  const dashboards = new Set<any>();
  const outboundAgents = new Map<string, OutboundAgent>();
  const inboundAgents = new WeakMap<object, AgentSocket>();

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
    }
  }

  function handleAgentClose(agent: AgentSocket) {
    if (agent.machineId) {
      machines.delete(agent.machineId);
      broadcastToDashboards({
        type: "machine_update",
        machineId: agent.machineId,
        sessions: [],
      });
    }
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

    entry.removed = true;
    if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
    if (entry.ws) {
      try { entry.ws.close(); } catch {}
    }
    outboundAgents.delete(address);
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
          data: { role: "dashboard" } as WsData,
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
          ws.send(JSON.stringify({ type: "snapshot", machines: getSnapshot() }));
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
              machine.agent.send(JSON.stringify(fwd));
            }
          }
        }
      },
      close(ws) {
        const data = ws.data as WsData;
        if (data.role === "dashboard") {
          dashboards.delete(ws);
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
    stop: () => {
      for (const entry of outboundAgents.values()) {
        entry.removed = true;
        if (entry.reconnectTimer) clearTimeout(entry.reconnectTimer);
        if (entry.ws) {
          try { entry.ws.close(); } catch {}
        }
      }
      outboundAgents.clear();
      server.stop();
    },
  };
}
