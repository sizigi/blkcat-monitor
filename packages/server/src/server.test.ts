import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createServer } from "./server";
import { AgentListener } from "../../agent/src/listener";

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

describe("Outbound agent REST API", () => {
  let server: ReturnType<typeof createServer>;
  let port: number;

  beforeAll(() => {
    server = createServer({ port: 0 });
    port = server.port;
  });

  afterAll(() => { server.stop(); });

  it("GET /api/agents returns empty initially", async () => {
    const res = await fetch(`http://localhost:${port}/api/agents`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.agents).toEqual([]);
  });

  it("POST /api/agents adds agent, appears in GET", async () => {
    // Use a port nothing is listening on — agent will be "connecting"/"disconnected"
    const res = await fetch(`http://localhost:${port}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "localhost:59999" }),
    });
    expect(res.status).toBe(201);

    const list = await fetch(`http://localhost:${port}/api/agents`);
    const data = await list.json();
    expect(data.agents.length).toBe(1);
    expect(data.agents[0].address).toBe("localhost:59999");
    expect(data.agents[0].source).toBe("api");
  });

  it("POST duplicate returns 409", async () => {
    const res = await fetch(`http://localhost:${port}/api/agents`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: "localhost:59999" }),
    });
    expect(res.status).toBe(409);
  });

  it("DELETE /api/agents/:address removes agent", async () => {
    const res = await fetch(
      `http://localhost:${port}/api/agents/${encodeURIComponent("localhost:59999")}`,
      { method: "DELETE" },
    );
    expect(res.ok).toBe(true);

    const list = await fetch(`http://localhost:${port}/api/agents`);
    const data = await list.json();
    expect(data.agents).toEqual([]);
  });

  it("DELETE unknown agent returns 404", async () => {
    const res = await fetch(
      `http://localhost:${port}/api/agents/${encodeURIComponent("localhost:11111")}`,
      { method: "DELETE" },
    );
    expect(res.status).toBe(404);
  });

  it("env-configured agents appear with source env", async () => {
    const listener = new AgentListener({
      port: 0,
      machineId: "env-test",
      onInput: () => {},
    });
    listener.register([{ id: "p1", name: "dev", target: "local" }]);

    const envServer = createServer({
      port: 0,
      agents: [`localhost:${listener.port}`],
    });

    await Bun.sleep(200);

    const res = await fetch(`http://localhost:${envServer.port}/api/agents`);
    const data = await res.json();
    const agent = data.agents.find((a: any) => a.address === `localhost:${listener.port}`);
    expect(agent).toBeDefined();
    expect(agent.source).toBe("env");
    expect(agent.status).toBe("connected");

    envServer.stop();
    listener.close();
  });
});

describe("Server outbound connector", () => {
  let listener: AgentListener;
  let server: ReturnType<typeof createServer>;

  afterAll(() => {
    server?.stop();
    listener?.close();
  });

  it("connects to agent listener and sees it on dashboard", async () => {
    const inputReceived: any[] = [];
    listener = new AgentListener({
      port: 0,
      machineId: "remote-agent",
      onInput: (msg) => inputReceived.push(msg),
    });
    listener.register([{ id: "p1", name: "claude", target: "local" }]);

    server = createServer({
      port: 0,
      agents: [`localhost:${listener.port}`],
    });

    // Wait for outbound connection + register exchange
    await Bun.sleep(200);

    // Connect dashboard and check snapshot
    const dashMsgs: any[] = [];
    const dash = new WebSocket(`ws://localhost:${server.port}/ws/dashboard`);
    await new Promise<void>((r) => dash.addEventListener("open", () => r()));
    dash.addEventListener("message", (ev) => dashMsgs.push(JSON.parse(ev.data as string)));
    await Bun.sleep(100);

    const snapshot = dashMsgs.find((m) => m.type === "snapshot");
    expect(snapshot).toBeDefined();
    const machine = snapshot.machines.find((m: any) => m.machineId === "remote-agent");
    expect(machine).toBeDefined();
    expect(machine.sessions).toEqual([{ id: "p1", name: "claude", target: "local" }]);

    // Dashboard sends input -> agent listener receives it
    dash.send(JSON.stringify({
      type: "input", machineId: "remote-agent", sessionId: "p1", text: "hey\n",
    }));
    await Bun.sleep(100);

    expect(inputReceived.length).toBe(1);
    expect(inputReceived[0].text).toBe("hey\n");

    // Agent sends output -> dashboard receives it
    listener.sendOutput("p1", ["output line"]);
    await Bun.sleep(100);

    const outputMsg = dashMsgs.find((m) => m.type === "output");
    expect(outputMsg?.lines).toEqual(["output line"]);

    dash.close();
  });
});
