import { describe, it, expect, afterEach } from "bun:test";
import { AgentListener } from "./listener";

describe("AgentListener", () => {
  let listener: AgentListener | null = null;

  afterEach(() => { listener?.close(); listener = null; });

  it("sends register message on new connection", async () => {
    listener = new AgentListener({
      port: 0,
      machineId: "listen-test",
      onInput: () => {},
    });
    listener.register([{ id: "s1", name: "dev", target: "local" }]);

    const msgs: any[] = [];
    const ws = new WebSocket(`ws://localhost:${listener.port}`);
    await new Promise<void>((r) => ws.addEventListener("open", () => r()));
    ws.addEventListener("message", (ev) => msgs.push(JSON.parse(ev.data as string)));
    await Bun.sleep(100);

    expect(msgs.length).toBeGreaterThanOrEqual(1);
    expect(msgs[0].type).toBe("register");
    expect(msgs[0].machineId).toBe("listen-test");
    expect(msgs[0].sessions).toEqual([{ id: "s1", name: "dev", target: "local" }]);

    ws.close();
  });

  it("routes input messages to onInput callback", async () => {
    const received: any[] = [];
    listener = new AgentListener({
      port: 0,
      machineId: "input-test",
      onInput: (msg) => received.push(msg),
    });

    const ws = new WebSocket(`ws://localhost:${listener.port}`);
    await new Promise<void>((r) => ws.addEventListener("open", () => r()));
    await Bun.sleep(50);

    ws.send(JSON.stringify({ type: "input", sessionId: "s1", text: "hello\n" }));
    await Bun.sleep(100);

    expect(received.length).toBe(1);
    expect(received[0].sessionId).toBe("s1");
    expect(received[0].text).toBe("hello\n");

    ws.close();
  });

  it("routes start_session messages to onStartSession callback", async () => {
    const startArgs: (string | undefined)[] = [];
    listener = new AgentListener({
      port: 0,
      machineId: "start-test",
      onInput: () => {},
      onStartSession: (args) => startArgs.push(args),
    });

    const ws = new WebSocket(`ws://localhost:${listener.port}`);
    await new Promise<void>((r) => ws.addEventListener("open", () => r()));
    await Bun.sleep(50);

    ws.send(JSON.stringify({ type: "start_session", args: "--model sonnet" }));
    await Bun.sleep(100);

    expect(startArgs.length).toBe(1);
    expect(startArgs[0]).toBe("--model sonnet");

    ws.close();
  });

  it("broadcasts sendOutput to all connected clients", async () => {
    listener = new AgentListener({
      port: 0,
      machineId: "output-test",
      onInput: () => {},
    });

    const msgs1: any[] = [];
    const msgs2: any[] = [];

    const ws1 = new WebSocket(`ws://localhost:${listener.port}`);
    await new Promise<void>((r) => ws1.addEventListener("open", () => r()));
    ws1.addEventListener("message", (ev) => msgs1.push(JSON.parse(ev.data as string)));

    const ws2 = new WebSocket(`ws://localhost:${listener.port}`);
    await new Promise<void>((r) => ws2.addEventListener("open", () => r()));
    ws2.addEventListener("message", (ev) => msgs2.push(JSON.parse(ev.data as string)));
    await Bun.sleep(50);

    listener.sendOutput("s1", ["line1", "line2"]);
    await Bun.sleep(100);

    // Both clients got register (on connect) + output
    const out1 = msgs1.find((m) => m.type === "output");
    const out2 = msgs2.find((m) => m.type === "output");
    expect(out1?.lines).toEqual(["line1", "line2"]);
    expect(out2?.lines).toEqual(["line1", "line2"]);

    ws1.close();
    ws2.close();
  });
});
