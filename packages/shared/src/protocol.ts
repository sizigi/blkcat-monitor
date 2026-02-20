// --- Session & Machine types ---

export interface SessionInfo {
  id: string;
  name: string;
  target: "local" | "ssh";
  host?: string;
}

export interface MachineSnapshot {
  machineId: string;
  sessions: SessionInfo[];
  lastSeen: number;
}

// --- Agent -> Server messages ---

export interface AgentRegisterMessage {
  type: "register";
  machineId: string;
  sessions: SessionInfo[];
}

export interface AgentOutputMessage {
  type: "output";
  machineId: string;
  sessionId: string;
  lines: string[];
  timestamp: number;
  waitingForInput?: boolean;
}

export interface AgentSessionsMessage {
  type: "sessions";
  machineId: string;
  sessions: SessionInfo[];
}

export type AgentToServerMessage =
  | AgentRegisterMessage
  | AgentOutputMessage
  | AgentSessionsMessage;

// --- Server -> Agent messages ---

export interface ServerInputMessage {
  type: "input";
  sessionId: string;
  text?: string;
  key?: string;
  data?: string;
}

export interface ServerStartSessionMessage {
  type: "start_session";
  args?: string;
}

export interface ServerCloseSessionMessage {
  type: "close_session";
  sessionId: string;
}

export type ServerToAgentMessage = ServerInputMessage | ServerStartSessionMessage | ServerCloseSessionMessage;

// --- Server -> Dashboard messages ---

export interface ServerSnapshotMessage {
  type: "snapshot";
  machines: MachineSnapshot[];
}

export interface ServerMachineUpdateMessage {
  type: "machine_update";
  machineId: string;
  sessions: SessionInfo[];
}

export interface ServerOutputMessage {
  type: "output";
  machineId: string;
  sessionId: string;
  lines: string[];
  timestamp: number;
  waitingForInput?: boolean;
}

export type ServerToDashboardMessage =
  | ServerSnapshotMessage
  | ServerMachineUpdateMessage
  | ServerOutputMessage;

// --- Dashboard -> Server messages ---

export interface DashboardInputMessage {
  type: "input";
  machineId: string;
  sessionId: string;
  text?: string;
  key?: string;
  data?: string;
}

export interface DashboardStartSessionMessage {
  type: "start_session";
  machineId: string;
  args?: string;
}

export interface DashboardCloseSessionMessage {
  type: "close_session";
  machineId: string;
  sessionId: string;
}

export type DashboardToServerMessage = DashboardInputMessage | DashboardStartSessionMessage | DashboardCloseSessionMessage;

// --- Outbound agent info ---

export interface OutboundAgentInfo {
  address: string;
  status: "connecting" | "connected" | "disconnected";
  source: "env" | "api";
}

// --- Parsers ---

const AGENT_TYPES = new Set(["register", "output", "sessions"]);
const DASHBOARD_TYPES = new Set(["input", "start_session", "close_session"]);

export function parseAgentMessage(raw: string): AgentToServerMessage | null {
  try {
    const msg = JSON.parse(raw);
    if (msg && typeof msg.type === "string" && AGENT_TYPES.has(msg.type)) {
      return msg as AgentToServerMessage;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseDashboardMessage(raw: string): DashboardToServerMessage | null {
  try {
    const msg = JSON.parse(raw);
    if (msg && typeof msg.type === "string" && DASHBOARD_TYPES.has(msg.type)) {
      return msg as DashboardToServerMessage;
    }
    return null;
  } catch {
    return null;
  }
}
