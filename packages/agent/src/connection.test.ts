import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createServer } from "../../server/src/server";
import { AgentConnection } from "./connection";

describe("AgentConnection", () => {
  let server: ReturnType<typeof createServer>;

  beforeAll(() => { server = createServer({ port: 0 }); });
  afterAll(() => { server.stop(); });

  it("connects, registers, and receives input", async () => {
    const received: any[] = [];
    const conn = new AgentConnection({
      serverUrl: `ws://localhost:${server.port}/ws/agent`,
      machineId: "test-agent",
      onInput: (msg) => received.push(msg),
    });

    await conn.waitForOpen();
    conn.register([{ id: "s1", name: "dev", target: "local" }]);
    await Bun.sleep(50);

    // Send input from a dashboard
    const dash = new WebSocket(
      `ws://localhost:${server.port}/ws/dashboard`
    );
    await new Promise<void>((r) => dash.addEventListener("open", () => r()));
    await Bun.sleep(50);

    dash.send(JSON.stringify({
      type: "input", machineId: "test-agent", sessionId: "s1", text: "hello\n",
    }));
    await Bun.sleep(100);

    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0].text).toBe("hello\n");

    conn.close();
    dash.close();
  });

  it("receives start_session message", async () => {
    const startArgs: (string | undefined)[] = [];
    const conn = new AgentConnection({
      serverUrl: `ws://localhost:${server.port}/ws/agent`,
      machineId: "test-agent-start",
      onInput: () => {},
      onStartSession: (args) => startArgs.push(args),
    });

    await conn.waitForOpen();
    conn.register([{ id: "s1", name: "dev", target: "local" }]);
    await Bun.sleep(50);

    const dash = new WebSocket(`ws://localhost:${server.port}/ws/dashboard`);
    await new Promise<void>((r) => dash.addEventListener("open", () => r()));
    await Bun.sleep(50);

    dash.send(JSON.stringify({
      type: "start_session", machineId: "test-agent-start", args: "--model sonnet",
    }));
    await Bun.sleep(100);

    expect(startArgs.length).toBeGreaterThanOrEqual(1);
    expect(startArgs[0]).toBe("--model sonnet");

    conn.close();
    dash.close();
  });

  it("reconnects after server restart and re-registers", async () => {
    let reconnectCalled = false;
    const sessions = [{ id: "s1", name: "dev", target: "local" as const }];

    // Start a temporary server
    let tmpServer = createServer({ port: 0 });
    const port = tmpServer.port;

    const conn = new AgentConnection({
      serverUrl: `ws://localhost:${port}/ws/agent`,
      machineId: "test-reconnect",
      onInput: () => {},
      getSessions: () => sessions,
      onReconnect: () => { reconnectCalled = true; },
    });

    await conn.waitForOpen();
    conn.register(sessions);
    await Bun.sleep(50);

    // Verify agent is registered
    const resp1 = await fetch(`http://localhost:${port}/api/sessions`);
    const data1 = await resp1.json() as any;
    expect(data1.machines.find((m: any) => m.machineId === "test-reconnect")).toBeTruthy();

    // Kill the server and close active connections — agent should get disconnected
    tmpServer.stop(true);
    await Bun.sleep(200);

    // Restart server on the same port
    tmpServer = createServer({ port });
    await Bun.sleep(1500); // Wait for reconnect (1s delay + connection time)

    // Verify agent re-registered and onReconnect was called
    const resp2 = await fetch(`http://localhost:${port}/api/sessions`);
    const data2 = await resp2.json() as any;
    expect(data2.machines.find((m: any) => m.machineId === "test-reconnect")).toBeTruthy();
    expect(reconnectCalled).toBe(true);

    conn.close();
    tmpServer.stop();
  });

  it("receives start_session message with cwd", async () => {
    const received: { args?: string; cwd?: string }[] = [];
    const conn = new AgentConnection({
      serverUrl: `ws://localhost:${server.port}/ws/agent`,
      machineId: "test-agent-cwd",
      onInput: () => {},
      onStartSession: (args, cwd) => received.push({ args, cwd }),
    });

    await conn.waitForOpen();
    conn.register([{ id: "s1", name: "dev", target: "local" }]);
    await Bun.sleep(50);

    const dash = new WebSocket(`ws://localhost:${server.port}/ws/dashboard`);
    await new Promise<void>((r) => dash.addEventListener("open", () => r()));
    await Bun.sleep(50);

    dash.send(JSON.stringify({
      type: "start_session", machineId: "test-agent-cwd", args: "--model sonnet", cwd: "/home/user/project",
    }));
    await Bun.sleep(100);

    expect(received.length).toBeGreaterThanOrEqual(1);
    expect(received[0].args).toBe("--model sonnet");
    expect(received[0].cwd).toBe("/home/user/project");

    conn.close();
    dash.close();
  });
});
