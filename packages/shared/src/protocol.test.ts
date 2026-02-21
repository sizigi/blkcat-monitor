import { describe, it, expect } from "bun:test";
import {
  type AgentRegisterMessage,
  type AgentOutputMessage,
  type ServerInputMessage,
  type DashboardInputMessage,
  type ServerSnapshotMessage,
  type MachineSnapshot,
  type SessionInfo,
  parseAgentMessage,
  parseDashboardMessage,
} from "./protocol";

describe("parseAgentMessage", () => {
  it("parses register message", () => {
    const msg = parseAgentMessage(JSON.stringify({
      type: "register",
      machineId: "m1",
      sessions: [{ id: "s1", name: "claude", target: "local" }],
    }));
    expect(msg?.type).toBe("register");
  });

  it("parses output message", () => {
    const msg = parseAgentMessage(JSON.stringify({
      type: "output",
      machineId: "m1",
      sessionId: "s1",
      lines: ["hello"],
      timestamp: Date.now(),
    }));
    expect(msg?.type).toBe("output");
  });

  it("returns null for invalid JSON", () => {
    expect(parseAgentMessage("not json")).toBeNull();
  });

  it("parses scrollback message", () => {
    const msg = parseAgentMessage(JSON.stringify({
      type: "scrollback",
      machineId: "m1",
      sessionId: "s1",
      lines: ["line1", "line2"],
    }));
    expect(msg?.type).toBe("scrollback");
  });

  it("parses hook_event message", () => {
    const msg = parseAgentMessage(JSON.stringify({
      type: "hook_event",
      machineId: "m1",
      sessionId: "s1",
      hookEventName: "PostToolUse",
      matcher: "Bash",
      data: { tool_name: "Bash", tool_input: { command: "npm test" } },
      timestamp: Date.now(),
    }));
    expect(msg?.type).toBe("hook_event");
  });

  it("parses hook_event with null sessionId", () => {
    const msg = parseAgentMessage(JSON.stringify({
      type: "hook_event",
      machineId: "m1",
      sessionId: null,
      hookEventName: "SessionStart",
      matcher: null,
      data: {},
      timestamp: Date.now(),
    }));
    expect(msg?.type).toBe("hook_event");
  });

  it("parses directory_listing message", () => {
    const msg = parseAgentMessage(JSON.stringify({
      type: "directory_listing",
      machineId: "m1",
      requestId: "req-1",
      path: "/home/user",
      entries: [{ name: "src", isDir: true }, { name: "README.md", isDir: false }],
    }));
    expect(msg?.type).toBe("directory_listing");
  });

  it("parses deploy_result message", () => {
    const msg = parseAgentMessage(JSON.stringify({
      type: "deploy_result",
      machineId: "m1",
      requestId: "req-1",
      success: true,
    }));
    expect(msg?.type).toBe("deploy_result");
  });

  it("parses deploy_result with error", () => {
    const msg = parseAgentMessage(JSON.stringify({
      type: "deploy_result",
      machineId: "m1",
      requestId: "req-1",
      success: false,
      error: "permission denied",
    }));
    expect(msg?.type).toBe("deploy_result");
    expect((msg as any).success).toBe(false);
    expect((msg as any).error).toBe("permission denied");
  });

  it("parses settings_snapshot message", () => {
    const msg = parseAgentMessage(JSON.stringify({
      type: "settings_snapshot",
      machineId: "m1",
      requestId: "req-2",
      settings: { theme: "dark" },
      scope: "global",
    }));
    expect(msg?.type).toBe("settings_snapshot");
    expect((msg as any).scope).toBe("global");
  });

  it("parses settings_snapshot with installedPlugins", () => {
    const msg = parseAgentMessage(JSON.stringify({
      type: "settings_snapshot",
      machineId: "m1",
      requestId: "req-2",
      settings: { theme: "dark" },
      scope: "project",
      installedPlugins: { myPlugin: { version: "1.0" } },
    }));
    expect(msg?.type).toBe("settings_snapshot");
    expect((msg as any).installedPlugins).toEqual({ myPlugin: { version: "1.0" } });
  });

  it("parses settings_result message", () => {
    const msg = parseAgentMessage(JSON.stringify({
      type: "settings_result",
      machineId: "m1",
      requestId: "req-3",
      success: true,
    }));
    expect(msg?.type).toBe("settings_result");
  });

  it("parses settings_result with error", () => {
    const msg = parseAgentMessage(JSON.stringify({
      type: "settings_result",
      machineId: "m1",
      requestId: "req-3",
      success: false,
      error: "invalid settings",
    }));
    expect(msg?.type).toBe("settings_result");
    expect((msg as any).success).toBe(false);
    expect((msg as any).error).toBe("invalid settings");
  });

  it("returns null for unknown type", () => {
    expect(parseAgentMessage(JSON.stringify({ type: "unknown" }))).toBeNull();
  });
});

describe("parseDashboardMessage", () => {
  it("parses input message", () => {
    const msg = parseDashboardMessage(JSON.stringify({
      type: "input",
      machineId: "m1",
      sessionId: "s1",
      text: "hello\n",
    }));
    expect(msg?.type).toBe("input");
  });

  it("parses start_session message", () => {
    const msg = parseDashboardMessage(JSON.stringify({
      type: "start_session",
      machineId: "m1",
      args: "--model sonnet",
    }));
    expect(msg?.type).toBe("start_session");
  });

  it("parses start_session without args", () => {
    const msg = parseDashboardMessage(JSON.stringify({
      type: "start_session",
      machineId: "m1",
    }));
    expect(msg?.type).toBe("start_session");
  });

  it("parses request_scrollback message", () => {
    const msg = parseDashboardMessage(JSON.stringify({
      type: "request_scrollback",
      machineId: "m1",
      sessionId: "s1",
    }));
    expect(msg?.type).toBe("request_scrollback");
  });

  it("parses list_directory message", () => {
    const msg = parseDashboardMessage(JSON.stringify({
      type: "list_directory",
      machineId: "m1",
      requestId: "req-1",
      path: "/home/user",
    }));
    expect(msg?.type).toBe("list_directory");
  });

  it("parses deploy_skills message", () => {
    const msg = parseDashboardMessage(JSON.stringify({
      type: "deploy_skills",
      machineId: "m1",
      requestId: "req-1",
      skills: [
        { name: "my-skill", files: [{ path: "/tmp/skill.ts", content: "console.log('hi')" }] },
      ],
    }));
    expect(msg?.type).toBe("deploy_skills");
    expect((msg as any).skills).toHaveLength(1);
    expect((msg as any).skills[0].name).toBe("my-skill");
  });

  it("parses deploy_skills with multiple skills", () => {
    const msg = parseDashboardMessage(JSON.stringify({
      type: "deploy_skills",
      machineId: "m1",
      requestId: "req-1",
      skills: [
        { name: "skill-a", files: [{ path: "a.ts", content: "a" }] },
        { name: "skill-b", files: [{ path: "b.ts", content: "b" }, { path: "c.ts", content: "c" }] },
      ],
    }));
    expect(msg?.type).toBe("deploy_skills");
    expect((msg as any).skills).toHaveLength(2);
  });

  it("parses get_settings message with global scope", () => {
    const msg = parseDashboardMessage(JSON.stringify({
      type: "get_settings",
      machineId: "m1",
      requestId: "req-2",
      scope: "global",
    }));
    expect(msg?.type).toBe("get_settings");
    expect((msg as any).scope).toBe("global");
  });

  it("parses get_settings message with project scope", () => {
    const msg = parseDashboardMessage(JSON.stringify({
      type: "get_settings",
      machineId: "m1",
      requestId: "req-2",
      scope: "project",
      projectPath: "/home/user/my-project",
    }));
    expect(msg?.type).toBe("get_settings");
    expect((msg as any).scope).toBe("project");
    expect((msg as any).projectPath).toBe("/home/user/my-project");
  });

  it("parses update_settings message", () => {
    const msg = parseDashboardMessage(JSON.stringify({
      type: "update_settings",
      machineId: "m1",
      requestId: "req-3",
      scope: "global",
      settings: { theme: "light" },
    }));
    expect(msg?.type).toBe("update_settings");
    expect((msg as any).settings).toEqual({ theme: "light" });
  });

  it("parses update_settings with project scope and projectPath", () => {
    const msg = parseDashboardMessage(JSON.stringify({
      type: "update_settings",
      machineId: "m1",
      requestId: "req-3",
      scope: "project",
      projectPath: "/home/user/my-project",
      settings: { allowedTools: ["Bash"] },
    }));
    expect(msg?.type).toBe("update_settings");
    expect((msg as any).scope).toBe("project");
    expect((msg as any).projectPath).toBe("/home/user/my-project");
  });
});
