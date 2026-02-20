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
});
