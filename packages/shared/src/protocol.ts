// --- View types ---

export interface ViewPane {
  machineId: string;
  sessionId: string;
}

export interface View {
  id: string;
  name: string;
  panes: ViewPane[];
}

// --- Session & Machine types ---

export interface SessionInfo {
  id: string;
  name: string;
  target: "local" | "ssh";
  host?: string;
  args?: string;
  cwd?: string;
  cliTool?: CliTool;
  windowId?: string;
  windowName?: string;
  paneCommand?: string;
}

export type CliTool = "claude" | "codex" | "gemini";

export const CLI_TOOLS: Record<CliTool, {
  command: string;
  resumeFlag: (id?: string) => string;
  flags: readonly { flag: string; color: string }[];
  configDir: string;
}> = {
  claude: {
    command: "claude",
    resumeFlag: (id?: string) => id ? `--resume ${id}` : "--resume",
    flags: [
      { flag: "--dangerously-skip-permissions", color: "var(--red)" },
    ],
    configDir: "~/.claude",
  },
  codex: {
    command: "codex",
    resumeFlag: (id?: string) => id ? `resume ${id}` : "resume --last",
    flags: [
      { flag: "--full-auto", color: "var(--red)" },
      { flag: "--dangerously-bypass-approvals-and-sandbox", color: "var(--red)" },
    ],
    configDir: "~/.codex",
  },
  gemini: {
    command: "gemini",
    resumeFlag: (id?: string) => id ? `--resume ${id}` : "--resume",
    flags: [
      { flag: "--yolo", color: "var(--red)" },
    ],
    configDir: "~/.gemini",
  },
};

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

export interface AgentDirectoryListingMessage {
  type: "directory_listing";
  machineId: string;
  requestId: string;
  path: string;
  entries: { name: string; isDir: boolean }[];
  error?: string;
}

export interface AgentDeployResultMessage {
  type: "deploy_result";
  machineId: string;
  requestId: string;
  success: boolean;
  error?: string;
}

export interface AgentSettingsSnapshotMessage {
  type: "settings_snapshot";
  machineId: string;
  requestId: string;
  settings: Record<string, unknown>;
  scope: "global" | "project";
  deployedSkills?: string[];
}

export interface AgentSettingsResultMessage {
  type: "settings_result";
  machineId: string;
  requestId: string;
  success: boolean;
  error?: string;
}

export interface AgentReloadSessionResultMessage {
  type: "reload_session_result";
  machineId: string;
  sessionId: string;
  success: boolean;
  error?: string;
}

export interface AgentCreateDirectoryResultMessage {
  type: "create_directory_result";
  machineId: string;
  requestId: string;
  path: string;
  success: boolean;
  error?: string;
}

export type AgentToServerMessage =
  | AgentRegisterMessage
  | AgentOutputMessage
  | AgentSessionsMessage
  | AgentScrollbackMessage
  | AgentHookEventMessage
  | AgentDirectoryListingMessage
  | AgentDeployResultMessage
  | AgentSettingsSnapshotMessage
  | AgentSettingsResultMessage
  | AgentReloadSessionResultMessage
  | AgentCreateDirectoryResultMessage;

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
  name?: string;
  cliTool?: CliTool;
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
  args?: string;
  resume?: boolean;
}

export interface ServerListDirectoryMessage {
  type: "list_directory";
  requestId: string;
  path: string;
}

export interface ServerDeploySkillsMessage {
  type: "deploy_skills";
  requestId: string;
  skills: { name: string; files: { path: string; content: string }[] }[];
}

export interface ServerGetSettingsMessage {
  type: "get_settings";
  requestId: string;
  scope: "global" | "project";
  projectPath?: string;
}

export interface ServerUpdateSettingsMessage {
  type: "update_settings";
  requestId: string;
  scope: "global" | "project";
  projectPath?: string;
  settings: Record<string, unknown>;
}

export interface ServerRemoveSkillsMessage {
  type: "remove_skills";
  requestId: string;
  skillNames: string[];
}

export interface ServerCreateDirectoryMessage {
  type: "create_directory";
  requestId: string;
  path: string;
}

export interface ServerRenameSessionMessage {
  type: "rename_session";
  sessionId: string;
  name: string;
}

export interface ServerSwapPaneMessage {
  type: "swap_pane";
  sessionId1: string;
  sessionId2: string;
}

export interface ServerSwapWindowMessage {
  type: "swap_window";
  sessionId1: string;
  sessionId2: string;
}

export interface ServerRediscoverMessage {
  type: "rediscover";
}

export type ServerToAgentMessage = ServerInputMessage | ServerStartSessionMessage | ServerCloseSessionMessage | ServerResizeMessage | ServerRequestScrollbackMessage | ServerReloadSessionMessage | ServerListDirectoryMessage | ServerDeploySkillsMessage | ServerGetSettingsMessage | ServerUpdateSettingsMessage | ServerRemoveSkillsMessage | ServerCreateDirectoryMessage | ServerRenameSessionMessage | ServerSwapPaneMessage | ServerSwapWindowMessage | ServerRediscoverMessage;

// --- Server -> Dashboard messages ---

export interface ServerSnapshotMessage {
  type: "snapshot";
  machines: MachineSnapshot[];
  displayNames?: { machines: Record<string, string>; sessions: Record<string, string> };
  views?: View[];
}

export interface ServerViewsUpdateMessage {
  type: "views_update";
  views: View[];
}

export interface ServerDisplayNameUpdateMessage {
  type: "display_name_update";
  target: "machine" | "session";
  machineId: string;
  sessionId?: string;
  name: string;
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

export interface ServerDirectoryListingMessage {
  type: "directory_listing";
  machineId: string;
  requestId: string;
  path: string;
  entries: { name: string; isDir: boolean }[];
  error?: string;
}

export interface ServerDeployResultMessage {
  type: "deploy_result";
  machineId: string;
  requestId: string;
  success: boolean;
  error?: string;
}

export interface ServerSettingsSnapshotMessage {
  type: "settings_snapshot";
  machineId: string;
  requestId: string;
  settings: Record<string, unknown>;
  scope: "global" | "project";
  deployedSkills?: string[];
}

export interface ServerSettingsResultMessage {
  type: "settings_result";
  machineId: string;
  requestId: string;
  success: boolean;
  error?: string;
}

export interface ServerReloadSessionResultMessage {
  type: "reload_session_result";
  machineId: string;
  sessionId: string;
  success: boolean;
  error?: string;
}

export interface ServerCreateDirectoryResultMessage {
  type: "create_directory_result";
  machineId: string;
  requestId: string;
  path: string;
  success: boolean;
  error?: string;
}

export type ServerToDashboardMessage =
  | ServerSnapshotMessage
  | ServerMachineUpdateMessage
  | ServerOutputMessage
  | ServerScrollbackMessage
  | ServerHookEventMessage
  | ServerDirectoryListingMessage
  | ServerDeployResultMessage
  | ServerSettingsSnapshotMessage
  | ServerSettingsResultMessage
  | ServerDisplayNameUpdateMessage
  | ServerReloadSessionResultMessage
  | ServerCreateDirectoryResultMessage
  | ServerViewsUpdateMessage;

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
  name?: string;
  cliTool?: CliTool;
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
  force?: boolean;
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
  args?: string;
  resume?: boolean;
}

export interface DashboardListDirectoryMessage {
  type: "list_directory";
  machineId: string;
  requestId: string;
  path: string;
}

export interface DashboardDeploySkillsMessage {
  type: "deploy_skills";
  machineId: string;
  requestId: string;
  skills: { name: string; files: { path: string; content: string }[] }[];
}

export interface DashboardGetSettingsMessage {
  type: "get_settings";
  machineId: string;
  requestId: string;
  scope: "global" | "project";
  projectPath?: string;
}

export interface DashboardUpdateSettingsMessage {
  type: "update_settings";
  machineId: string;
  requestId: string;
  scope: "global" | "project";
  projectPath?: string;
  settings: Record<string, unknown>;
}

export interface DashboardRemoveSkillsMessage {
  type: "remove_skills";
  machineId: string;
  requestId: string;
  skillNames: string[];
}

export interface DashboardSetDisplayNameMessage {
  type: "set_display_name";
  target: "machine" | "session";
  machineId: string;
  sessionId?: string;
  name: string;
}

export interface DashboardCreateDirectoryMessage {
  type: "create_directory";
  machineId: string;
  requestId: string;
  path: string;
}

export interface DashboardSwapPaneMessage {
  type: "swap_pane";
  machineId: string;
  sessionId1: string;
  sessionId2: string;
}

export interface DashboardSwapWindowMessage {
  type: "swap_window";
  machineId: string;
  sessionId1: string;
  sessionId2: string;
}

export interface DashboardRediscoverMessage {
  type: "rediscover";
  machineId: string;
}

export interface DashboardCreateViewMessage {
  type: "create_view";
  id: string;
  name: string;
  panes: ViewPane[];
}

export interface DashboardUpdateViewMessage {
  type: "update_view";
  id: string;
  name?: string;
  panes?: ViewPane[];
}

export interface DashboardDeleteViewMessage {
  type: "delete_view";
  id: string;
}

export type DashboardToServerMessage = DashboardInputMessage | DashboardStartSessionMessage | DashboardCloseSessionMessage | DashboardResizeMessage | DashboardRequestScrollbackMessage | DashboardReloadSessionMessage | DashboardListDirectoryMessage | DashboardDeploySkillsMessage | DashboardGetSettingsMessage | DashboardUpdateSettingsMessage | DashboardRemoveSkillsMessage | DashboardSetDisplayNameMessage | DashboardCreateDirectoryMessage | DashboardSwapPaneMessage | DashboardSwapWindowMessage | DashboardRediscoverMessage | DashboardCreateViewMessage | DashboardUpdateViewMessage | DashboardDeleteViewMessage;

// --- Outbound agent info ---

export interface OutboundAgentInfo {
  address: string;
  status: "connecting" | "connected" | "disconnected";
  source: "env" | "api";
}

/** Hook events that indicate Claude is waiting for user action. */
export const NOTIFY_HOOK_EVENTS = new Set(["Stop", "Notification", "PermissionRequest"]);

// --- Parsers ---

const AGENT_TYPES = new Set(["register", "output", "sessions", "scrollback", "hook_event", "directory_listing", "deploy_result", "settings_snapshot", "settings_result", "reload_session_result", "create_directory_result"]);
const DASHBOARD_TYPES = new Set(["input", "start_session", "close_session", "resize", "request_scrollback", "reload_session", "list_directory", "deploy_skills", "get_settings", "update_settings", "remove_skills", "set_display_name", "create_directory", "rename_session", "swap_pane", "swap_window", "rediscover", "create_view", "update_view", "delete_view"]);

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
