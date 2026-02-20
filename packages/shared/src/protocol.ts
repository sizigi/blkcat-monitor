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
  recentEvents?: AgentHookEventMessage[];
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

export interface AgentScrollbackMessage {
  type: "scrollback";
  machineId: string;
  sessionId: string;
  lines: string[];
}

export interface AgentHookEventMessage {
  type: "hook_event";
  machineId: string;
  sessionId: string | null;
  hookEventName: string;
  matcher: string | null;
  data: Record<string, unknown>;
  timestamp: number;
}

export type AgentToServerMessage =
  | AgentRegisterMessage
  | AgentOutputMessage
  | AgentSessionsMessage
  | AgentScrollbackMessage
  | AgentHookEventMessage;

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
  cwd?: string;
}

export interface ServerCloseSessionMessage {
  type: "close_session";
  sessionId: string;
}

export interface ServerResizeMessage {
  type: "resize";
  sessionId: string;
  cols: number;
  rows: number;
}

export interface ServerRequestScrollbackMessage {
  type: "request_scrollback";
  sessionId: string;
}

export interface ServerReloadSessionMessage {
  type: "reload_session";
  sessionId: string;
}

export type ServerToAgentMessage = ServerInputMessage | ServerStartSessionMessage | ServerCloseSessionMessage | ServerResizeMessage | ServerRequestScrollbackMessage | ServerReloadSessionMessage;

// --- Server -> Dashboard messages ---

export interface ServerSnapshotMessage {
  type: "snapshot";
  machines: MachineSnapshot[];
}

export interface ServerMachineUpdateMessage {
  type: "machine_update";
  machineId: string;
  sessions: SessionInfo[];
  online?: boolean;
}

export interface ServerOutputMessage {
  type: "output";
  machineId: string;
  sessionId: string;
  lines: string[];
  timestamp: number;
  waitingForInput?: boolean;
}

export interface ServerScrollbackMessage {
  type: "scrollback";
  machineId: string;
  sessionId: string;
  lines: string[];
}

export interface ServerHookEventMessage {
  type: "hook_event";
  machineId: string;
  sessionId: string | null;
  hookEventName: string;
  matcher: string | null;
  data: Record<string, unknown>;
  timestamp: number;
}

export type ServerToDashboardMessage =
  | ServerSnapshotMessage
  | ServerMachineUpdateMessage
  | ServerOutputMessage
  | ServerScrollbackMessage
  | ServerHookEventMessage;

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
  cwd?: string;
}

export interface DashboardCloseSessionMessage {
  type: "close_session";
  machineId: string;
  sessionId: string;
}

export interface DashboardResizeMessage {
  type: "resize";
  machineId: string;
  sessionId: string;
  cols: number;
  rows: number;
}

export interface DashboardRequestScrollbackMessage {
  type: "request_scrollback";
  machineId: string;
  sessionId: string;
}

export interface DashboardReloadSessionMessage {
  type: "reload_session";
  machineId: string;
  sessionId: string;
}

export type DashboardToServerMessage = DashboardInputMessage | DashboardStartSessionMessage | DashboardCloseSessionMessage | DashboardResizeMessage | DashboardRequestScrollbackMessage | DashboardReloadSessionMessage;

// --- Outbound agent info ---

export interface OutboundAgentInfo {
  address: string;
  status: "connecting" | "connected" | "disconnected";
  source: "env" | "api";
}

/** Hook events that indicate Claude is waiting for user action. */
export const NOTIFY_HOOK_EVENTS = new Set(["Stop", "Notification", "PermissionRequest"]);

// --- Parsers ---

const AGENT_TYPES = new Set(["register", "output", "sessions", "scrollback", "hook_event"]);
const DASHBOARD_TYPES = new Set(["input", "start_session", "close_session", "resize", "request_scrollback", "reload_session"]);

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
