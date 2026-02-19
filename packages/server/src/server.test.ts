import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createServer } from "./server";

describe("Server", () => {
  let server: ReturnType<typeof createServer>;
  let port: number;

  beforeAll(() => {
    server = createServer({ port: 0 });
    port = server.port;
  });

  afterAll(() => { server.stop(); });

  it("accepts agent and receives snapshot on dashboard", async () => {
    // Connect agent
    const agent = new WebSocket(`ws://localhost:${port}/ws/agent`);
    await new Promise<void>((r) => agent.addEventListener("open", () => r()));

    agent.send(JSON.stringify({
      type: "register",
      machineId: "test-m",
      sessions: [{ id: "s1", name: "dev", target: "local" }],
    }));
    await Bun.sleep(50);

    // Connect dashboard
    const dashMsgs: any[] = [];
    const dash = new WebSocket(`ws://localhost:${port}/ws/dashboard`);
    await new Promise<void>((r) => dash.addEventListener("open", () => r()));
    dash.addEventListener("message", (ev) => dashMsgs.push(JSON.parse(ev.data as string)));
    await Bun.sleep(50);

    expect(dashMsgs[0]?.type).toBe("snapshot");
    expect(dashMsgs[0]?.machines[0]?.machineId).toBe("test-m");

    // Agent sends output -> dashboard receives it
    agent.send(JSON.stringify({
      type: "output", machineId: "test-m", sessionId: "s1",
      lines: ["hello"], timestamp: Date.now(),
    }));
    await Bun.sleep(50);

    const outputMsg = dashMsgs.find((m) => m.type === "output");
    expect(outputMsg?.lines).toEqual(["hello"]);

    // Dashboard sends input -> agent receives it
    const agentMsgs: any[] = [];
    agent.addEventListener("message", (ev) => agentMsgs.push(JSON.parse(ev.data as string)));

    dash.send(JSON.stringify({
      type: "input", machineId: "test-m", sessionId: "s1", text: "hi\n",
    }));
    await Bun.sleep(50);

    expect(agentMsgs.find((m) => m.type === "input")?.text).toBe("hi\n");

    agent.close();
    dash.close();
  });

  it("forwards start_session from dashboard to agent", async () => {
    const agent = new WebSocket(`ws://localhost:${port}/ws/agent`);
    await new Promise<void>((r) => agent.addEventListener("open", () => r()));

    agent.send(JSON.stringify({
      type: "register",
      machineId: "start-test",
      sessions: [{ id: "s1", name: "dev", target: "local" }],
    }));
    await Bun.sleep(50);

    const agentMsgs: any[] = [];
    agent.addEventListener("message", (ev) => agentMsgs.push(JSON.parse(ev.data as string)));

    const dash = new WebSocket(`ws://localhost:${port}/ws/dashboard`);
    await new Promise<void>((r) => dash.addEventListener("open", () => r()));
    await Bun.sleep(50);

    dash.send(JSON.stringify({
      type: "start_session",
      machineId: "start-test",
      args: "--model sonnet",
    }));
    await Bun.sleep(50);

    const startMsg = agentMsgs.find((m) => m.type === "start_session");
    expect(startMsg).toBeDefined();
    expect(startMsg.args).toBe("--model sonnet");

    agent.close();
    dash.close();
  });

  it("GET /api/sessions returns machine list", async () => {
    const res = await fetch(`http://localhost:${port}/api/sessions`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(Array.isArray(data.machines)).toBe(true);
  });
});
