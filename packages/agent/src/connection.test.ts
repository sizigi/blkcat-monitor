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
});
