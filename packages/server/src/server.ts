import {
  type AgentToServerMessage,
  type MachineSnapshot,
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

export function createServer(opts: ServerOptions) {
  const machines = new Map<string, MachineState>();
  const dashboards = new Set<any>();
  const outboundTimers: ReturnType<typeof setTimeout>[] = [];
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

  function connectToAgent(address: string) {
    let delay = 1000;
    const MAX_DELAY = 30000;

    function connect() {
      const ws = new WebSocket(`ws://${address}`);
      const agent: AgentSocket = {
        send(data: string) { if (ws.readyState === WebSocket.OPEN) ws.send(data); },
      };

      ws.addEventListener("message", (ev) => {
        const raw = typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data as ArrayBuffer);
        handleAgentMessage(agent, raw);
      });

      ws.addEventListener("open", () => {
        delay = 1000;
      });

      ws.addEventListener("close", () => {
        handleAgentClose(agent);
        const timer = setTimeout(connect, delay);
        outboundTimers.push(timer);
        delay = Math.min(delay * 2, MAX_DELAY);
      });

      ws.addEventListener("error", () => {
        // close event will fire after error, reconnect happens there
      });
    }

    connect();
  }

  const server = Bun.serve({
    port: opts.port,
    hostname: opts.hostname,
    fetch(req, server) {
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
      connectToAgent(address);
    }
  }

  return {
    port: server.port,
    stop: () => {
      for (const timer of outboundTimers) clearTimeout(timer);
      server.stop();
    },
  };
}
