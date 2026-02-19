import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { createServer } from "./server";

describe("E2E: agent -> server -> dashboard round-trip", () => {
  let server: ReturnType<typeof createServer>;
  let port: number;

  beforeAll(() => {
    server = createServer({ port: 0 });
    port = server.port;
  });

  afterAll(() => { server.stop(); });

  it("full round-trip: register, output, snapshot, input", async () => {
    // 1. Agent connects and registers
    const agent = new WebSocket(`ws://localhost:${port}/ws/agent`);
    await new Promise<void>((r) => agent.addEventListener("open", () => r()));

    agent.send(JSON.stringify({
      type: "register",
      machineId: "e2e-machine",
      sessions: [
        { id: "sess:0.0", name: "claude-dev", target: "local" },
        { id: "sess:1.0", name: "build", target: "local" },
      ],
    }));
    await Bun.sleep(50);

    // 2. Dashboard connects and receives snapshot
    const dashMsgs: any[] = [];
    const dash = new WebSocket(`ws://localhost:${port}/ws/dashboard`);
    await new Promise<void>((r) => dash.addEventListener("open", () => r()));
    dash.addEventListener("message", (ev) =>
      dashMsgs.push(JSON.parse(ev.data as string))
    );
    await Bun.sleep(50);

    // Verify snapshot received
    const snapshot = dashMsgs.find((m) => m.type === "snapshot");
    expect(snapshot).toBeDefined();
    expect(snapshot.machines).toHaveLength(1);
    expect(snapshot.machines[0].machineId).toBe("e2e-machine");
    expect(snapshot.machines[0].sessions).toHaveLength(2);

    // 3. Agent sends output -> dashboard receives it
    agent.send(JSON.stringify({
      type: "output",
      machineId: "e2e-machine",
      sessionId: "sess:0.0",
      lines: ["$ claude", "claude> Hello, how can I help?"],
      timestamp: Date.now(),
    }));
    await Bun.sleep(50);

    const outputMsg = dashMsgs.find((m) => m.type === "output");
    expect(outputMsg).toBeDefined();
    expect(outputMsg.machineId).toBe("e2e-machine");
    expect(outputMsg.sessionId).toBe("sess:0.0");
    expect(outputMsg.lines).toEqual(["$ claude", "claude> Hello, how can I help?"]);

    // 4. Dashboard sends input -> agent receives it
    const agentMsgs: any[] = [];
    agent.addEventListener("message", (ev) =>
      agentMsgs.push(JSON.parse(ev.data as string))
    );

    dash.send(JSON.stringify({
      type: "input",
      machineId: "e2e-machine",
      sessionId: "sess:0.0",
      text: "fix the bug in auth.ts\n",
    }));
    await Bun.sleep(50);

    const inputMsg = agentMsgs.find((m) => m.type === "input");
    expect(inputMsg).toBeDefined();
    expect(inputMsg.sessionId).toBe("sess:0.0");
    expect(inputMsg.text).toBe("fix the bug in auth.ts\n");

    // 5. Agent updates sessions -> dashboard receives machine_update
    agent.send(JSON.stringify({
      type: "sessions",
      machineId: "e2e-machine",
      sessions: [
        { id: "sess:0.0", name: "claude-dev", target: "local" },
      ],
    }));
    await Bun.sleep(50);

    const updateMsg = dashMsgs.find((m) => m.type === "machine_update");
    expect(updateMsg).toBeDefined();
    expect(updateMsg.sessions).toHaveLength(1);

    // 6. REST API returns current state
    const res = await fetch(`http://localhost:${port}/api/sessions`);
    expect(res.ok).toBe(true);
    const data = await res.json();
    expect(data.machines).toHaveLength(1);
    expect(data.machines[0].sessions).toHaveLength(1);

    // 7. Agent disconnects -> dashboard notified
    agent.close();
    await Bun.sleep(50);

    const disconnectMsg = dashMsgs.find(
      (m) => m.type === "machine_update" && m.sessions.length === 0
    );
    expect(disconnectMsg).toBeDefined();
    expect(disconnectMsg.machineId).toBe("e2e-machine");

    dash.close();
  });
});
