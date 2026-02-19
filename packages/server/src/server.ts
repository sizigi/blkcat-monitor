import {
  type AgentToServerMessage,
  type MachineSnapshot,
  type SessionInfo,
  parseAgentMessage,
  parseDashboardMessage,
} from "@blkcat/shared";

interface ServerOptions {
  port: number;
  secret: string;
  staticDir?: string;
}

interface WsData {
  role: "agent" | "dashboard";
  machineId?: string;
  authenticated: boolean;
}

interface MachineState {
  ws: any;
  sessions: SessionInfo[];
  lastSeen: number;
}

export function createServer(opts: ServerOptions) {
  const machines = new Map<string, MachineState>();
  const dashboards = new Set<any>();

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

  const server = Bun.serve({
    port: opts.port,
    fetch(req, server) {
      const url = new URL(req.url);
      const secret = url.searchParams.get("secret") ??
        req.headers.get("x-secret");

      if (url.pathname === "/ws/agent") {
        const ok = server.upgrade(req, {
          data: { role: "agent", authenticated: secret === opts.secret } as WsData,
        });
        return ok ? undefined : new Response("Upgrade failed", { status: 500 });
      }

      if (url.pathname === "/ws/dashboard") {
        const ok = server.upgrade(req, {
          data: { role: "dashboard", authenticated: secret === opts.secret } as WsData,
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
        if (!data.authenticated) {
          ws.close(4001, "Unauthorized");
          return;
        }
        if (data.role === "dashboard") {
          dashboards.add(ws);
          ws.send(JSON.stringify({ type: "snapshot", machines: getSnapshot() }));
        }
      },
      message(ws, message) {
        const data = ws.data as WsData;
        const raw = typeof message === "string" ? message : new TextDecoder().decode(message as ArrayBuffer);

        if (data.role === "agent") {
          const msg = parseAgentMessage(raw);
          if (!msg) return;

          if (msg.type === "register") {
            data.machineId = msg.machineId;
            machines.set(msg.machineId, {
              ws, sessions: msg.sessions, lastSeen: Date.now(),
            });
            broadcastToDashboards({
              type: "machine_update",
              machineId: msg.machineId,
              sessions: msg.sessions,
            });
          } else if (msg.type === "output") {
            const machine = machines.get(msg.machineId);
            if (machine) machine.lastSeen = Date.now();
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
        } else if (data.role === "dashboard") {
          const msg = parseDashboardMessage(raw);
          if (!msg) return;

          if (msg.type === "input") {
            const machine = machines.get(msg.machineId);
            if (machine) {
              machine.ws.send(JSON.stringify({
                type: "input",
                sessionId: msg.sessionId,
                text: msg.text,
              }));
            }
          }
        }
      },
      close(ws) {
        const data = ws.data as WsData;
        if (data.role === "dashboard") {
          dashboards.delete(ws);
        } else if (data.role === "agent" && data.machineId) {
          machines.delete(data.machineId);
          broadcastToDashboards({
            type: "machine_update",
            machineId: data.machineId,
            sessions: [],
          });
        }
      },
    },
  });

  return {
    port: server.port,
    stop: () => server.stop(),
  };
}
