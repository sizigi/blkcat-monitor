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
