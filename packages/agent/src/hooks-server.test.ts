import { describe, it, expect, afterEach } from "bun:test";
import { HooksServer } from "./hooks-server";

describe("HooksServer", () => {
  let server: HooksServer;

  afterEach(() => {
    server?.stop();
  });

  it("receives hook event via POST /hooks and calls onHookEvent", async () => {
    const received: any[] = [];
    server = new HooksServer({
      port: 0,
      machineId: "test-machine",
      onHookEvent: (event) => received.push(event),
      resolvePaneId: () => "session-1",
    });

    const res = await fetch(`http://localhost:${server.port}/hooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        session_id: "abc123",
        tmux_pane: "%5",
      }),
    });

    expect(res.status).toBe(200);
    expect(received.length).toBe(1);
    expect(received[0].type).toBe("hook_event");
    expect(received[0].machineId).toBe("test-machine");
    expect(received[0].sessionId).toBe("session-1");
    expect(received[0].hookEventName).toBe("PostToolUse");
    expect(received[0].data.tool_name).toBe("Bash");
  });

  it("sets sessionId to null when pane is unknown", async () => {
    const received: any[] = [];
    server = new HooksServer({
      port: 0,
      machineId: "test-machine",
      onHookEvent: (event) => received.push(event),
      resolvePaneId: () => null,
    });

    const res = await fetch(`http://localhost:${server.port}/hooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hook_event_name: "SessionStart",
        session_id: "abc123",
      }),
    });

    expect(res.status).toBe(200);
    expect(received[0].sessionId).toBeNull();
  });

  it("rejects requests without hook_event_name", async () => {
    server = new HooksServer({
      port: 0,
      machineId: "test-machine",
      onHookEvent: () => {},
      resolvePaneId: () => null,
    });

    const res = await fetch(`http://localhost:${server.port}/hooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ some: "data" }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects non-POST requests", async () => {
    server = new HooksServer({
      port: 0,
      machineId: "test-machine",
      onHookEvent: () => {},
      resolvePaneId: () => null,
    });

    const res = await fetch(`http://localhost:${server.port}/hooks`);
    expect(res.status).toBe(405);
  });

  it("extracts matcher from tool_name in data", async () => {
    const received: any[] = [];
    server = new HooksServer({
      port: 0,
      machineId: "test-machine",
      onHookEvent: (event) => received.push(event),
      resolvePaneId: () => null,
    });

    await fetch(`http://localhost:${server.port}/hooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        session_id: "abc",
      }),
    });

    expect(received[0].matcher).toBe("Edit");
  });
});
