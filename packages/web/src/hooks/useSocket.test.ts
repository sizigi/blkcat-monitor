import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSocket } from "./useSocket";

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  listeners: Record<string, Function[]> = {};
  sent: string[] = [];
  readyState = 1; // OPEN

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
    setTimeout(() => this.emit("open", {}), 0);
  }

  addEventListener(type: string, fn: Function) {
    (this.listeners[type] ??= []).push(fn);
  }

  removeEventListener() {}

  emit(type: string, data: any) {
    for (const fn of this.listeners[type] ?? []) fn(data);
  }

  send(data: string) { this.sent.push(data); }
  close() { this.emit("close", {}); }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal("WebSocket", MockWebSocket as any);
  (globalThis as any).WebSocket.OPEN = 1;
});

describe("useSocket", () => {
  it("connects and sets connected to true", async () => {
    const { result } = renderHook(() => useSocket("ws://test"));

    await vi.waitFor(() => {
      expect(result.current.connected).toBe(true);
    });
  });

  it("handles snapshot message", async () => {
    const { result } = renderHook(() => useSocket("ws://test"));
    const ws = MockWebSocket.instances[0];

    await vi.waitFor(() => expect(result.current.connected).toBe(true));

    act(() => {
      ws.emit("message", {
        data: JSON.stringify({
          type: "snapshot",
          machines: [{ machineId: "m1", sessions: [], lastSeen: 1 }],
        }),
      });
    });

    expect(result.current.machines).toHaveLength(1);
    expect(result.current.machines[0].machineId).toBe("m1");
  });

  it("keeps machine with empty sessions on machine_update", async () => {
    const { result } = renderHook(() => useSocket("ws://test"));
    const ws = MockWebSocket.instances[0];

    await vi.waitFor(() => expect(result.current.connected).toBe(true));

    act(() => {
      ws.emit("message", {
        data: JSON.stringify({
          type: "machine_update",
          machineId: "m1",
          sessions: [{ id: "s1", name: "dev", target: "local" }],
        }),
      });
    });

    expect(result.current.machines).toHaveLength(1);

    act(() => {
      ws.emit("message", {
        data: JSON.stringify({
          type: "machine_update",
          machineId: "m1",
          sessions: [],
        }),
      });
    });

    expect(result.current.machines).toHaveLength(1);
    expect(result.current.machines[0].sessions).toEqual([]);
  });

  it("removes machine on machine_update with online false", async () => {
    const { result } = renderHook(() => useSocket("ws://test"));
    const ws = MockWebSocket.instances[0];

    await vi.waitFor(() => expect(result.current.connected).toBe(true));

    act(() => {
      ws.emit("message", {
        data: JSON.stringify({
          type: "machine_update",
          machineId: "m1",
          sessions: [{ id: "s1", name: "dev", target: "local" }],
        }),
      });
    });

    expect(result.current.machines).toHaveLength(1);

    act(() => {
      ws.emit("message", {
        data: JSON.stringify({
          type: "machine_update",
          machineId: "m1",
          sessions: [],
          online: false,
        }),
      });
    });

    expect(result.current.machines).toHaveLength(0);
  });

  it("sends input message with text", async () => {
    const { result } = renderHook(() => useSocket("ws://test"));

    await vi.waitFor(() => expect(result.current.connected).toBe(true));

    act(() => {
      result.current.sendInput("m1", "s1", { text: "hello" });
    });

    const ws = MockWebSocket.instances[0];
    const sent = JSON.parse(ws.sent[0]);
    expect(sent.type).toBe("input");
    expect(sent.text).toBe("hello");
  });

  it("sends input message with data", async () => {
    const { result } = renderHook(() => useSocket("ws://test"));

    await vi.waitFor(() => expect(result.current.connected).toBe(true));

    act(() => {
      result.current.sendInput("m1", "s1", { data: "\r" });
    });

    const ws = MockWebSocket.instances[0];
    const sent = JSON.parse(ws.sent[0]);
    expect(sent.type).toBe("input");
    expect(sent.data).toBe("\r");
  });

  it("sends start_session message with args", async () => {
    const { result } = renderHook(() => useSocket("ws://test"));

    await vi.waitFor(() => expect(result.current.connected).toBe(true));

    act(() => {
      result.current.startSession("m1", "--model sonnet");
    });

    const ws = MockWebSocket.instances[0];
    const sent = JSON.parse(ws.sent[0]);
    expect(sent.type).toBe("start_session");
    expect(sent.machineId).toBe("m1");
    expect(sent.args).toBe("--model sonnet");
  });

  it("sends start_session message with cwd", async () => {
    const { result } = renderHook(() => useSocket("ws://test"));

    await vi.waitFor(() => expect(result.current.connected).toBe(true));

    act(() => {
      result.current.startSession("m1", "--model sonnet", "/home/user/project");
    });

    const ws = MockWebSocket.instances[0];
    const sent = JSON.parse(ws.sent[0]);
    expect(sent.type).toBe("start_session");
    expect(sent.machineId).toBe("m1");
    expect(sent.args).toBe("--model sonnet");
    expect(sent.cwd).toBe("/home/user/project");
  });

  it("sends start_session message without args", async () => {
    const { result } = renderHook(() => useSocket("ws://test"));

    await vi.waitFor(() => expect(result.current.connected).toBe(true));

    act(() => {
      result.current.startSession("m1");
    });

    const ws = MockWebSocket.instances[0];
    const sent = JSON.parse(ws.sent[0]);
    expect(sent.type).toBe("start_session");
    expect(sent.machineId).toBe("m1");
    expect(sent.args).toBeUndefined();
  });

  it("stores output in ref map and notifies subscribers", async () => {
    const { result } = renderHook(() => useSocket("ws://test"));
    const ws = MockWebSocket.instances[0];

    await vi.waitFor(() => expect(result.current.connected).toBe(true));

    const notified: string[] = [];
    const unsub = result.current.subscribeOutput((key) => notified.push(key));

    act(() => {
      ws.emit("message", {
        data: JSON.stringify({
          type: "output",
          machineId: "m1",
          sessionId: "s1",
          lines: ["hello"],
          timestamp: 1,
        }),
      });
    });

    expect(notified).toEqual(["m1:s1"]);
    expect(result.current.outputMapRef.current?.get("m1:s1")?.lines).toEqual(["hello"]);

    unsub();
  });

  it("updates waitingSessions only on membership change", async () => {
    const { result } = renderHook(() => useSocket("ws://test"));
    const ws = MockWebSocket.instances[0];

    await vi.waitFor(() => expect(result.current.connected).toBe(true));

    expect(result.current.waitingSessions.size).toBe(0);

    act(() => {
      ws.emit("message", {
        data: JSON.stringify({
          type: "output",
          machineId: "m1",
          sessionId: "s1",
          lines: ["$ "],
          timestamp: 1,
          waitingForInput: true,
        }),
      });
    });

    expect(result.current.waitingSessions.has("m1:s1")).toBe(true);

    act(() => {
      ws.emit("message", {
        data: JSON.stringify({
          type: "output",
          machineId: "m1",
          sessionId: "s1",
          lines: ["running..."],
          timestamp: 2,
          waitingForInput: false,
        }),
      });
    });

    expect(result.current.waitingSessions.has("m1:s1")).toBe(false);
  });

  it("accumulates scrolled-off lines into per-session log", async () => {
    const { result } = renderHook(() => useSocket("ws://test"));
    const ws = MockWebSocket.instances[0];

    await vi.waitFor(() => expect(result.current.connected).toBe(true));

    // First viewport: 3 lines
    act(() => {
      ws.emit("message", {
        data: JSON.stringify({
          type: "output", machineId: "m1", sessionId: "s1",
          lines: ["line1", "line2", "line3"], timestamp: 1,
        }),
      });
    });

    // Log should be empty (no previous to diff against)
    expect(result.current.logMapRef.current?.get("m1:s1")).toBeUndefined();

    // Second viewport: scrolled by 2 (line1/line2 gone, line3 stays at top)
    act(() => {
      ws.emit("message", {
        data: JSON.stringify({
          type: "output", machineId: "m1", sessionId: "s1",
          lines: ["line3", "line4", "line5"], timestamp: 2,
        }),
      });
    });

    // line1 and line2 should be in the log
    expect(result.current.logMapRef.current?.get("m1:s1")).toEqual(["line1", "line2"]);
  });

  it("sends request_scrollback message", async () => {
    const { result } = renderHook(() => useSocket("ws://test"));

    await vi.waitFor(() => expect(result.current.connected).toBe(true));

    act(() => {
      result.current.requestScrollback("m1", "s1");
    });

    const ws = MockWebSocket.instances[0];
    const sent = JSON.parse(ws.sent[0]);
    expect(sent.type).toBe("request_scrollback");
    expect(sent.machineId).toBe("m1");
    expect(sent.sessionId).toBe("s1");
  });

  it("handles scrollback message and notifies subscribers", async () => {
    const { result } = renderHook(() => useSocket("ws://test"));
    const ws = MockWebSocket.instances[0];

    await vi.waitFor(() => expect(result.current.connected).toBe(true));

    const notified: string[] = [];
    const unsub = result.current.subscribeScrollback((key) => notified.push(key));

    act(() => {
      ws.emit("message", {
        data: JSON.stringify({
          type: "scrollback",
          machineId: "m1",
          sessionId: "s1",
          lines: ["old1", "old2", "current"],
        }),
      });
    });

    expect(notified).toEqual(["m1:s1"]);
    expect(result.current.scrollbackMapRef.current?.get("m1:s1")).toEqual(["old1", "old2", "current"]);

    unsub();
  });

  it("preserves logs across sessions independently", async () => {
    const { result } = renderHook(() => useSocket("ws://test"));
    const ws = MockWebSocket.instances[0];

    await vi.waitFor(() => expect(result.current.connected).toBe(true));

    // Session 1: two updates with scroll
    act(() => {
      ws.emit("message", {
        data: JSON.stringify({
          type: "output", machineId: "m1", sessionId: "s1",
          lines: ["A", "B"], timestamp: 1,
        }),
      });
      ws.emit("message", {
        data: JSON.stringify({
          type: "output", machineId: "m1", sessionId: "s1",
          lines: ["B", "C"], timestamp: 2,
        }),
      });
    });

    // Session 2: two updates with scroll
    act(() => {
      ws.emit("message", {
        data: JSON.stringify({
          type: "output", machineId: "m1", sessionId: "s2",
          lines: ["X", "Y"], timestamp: 3,
        }),
      });
      ws.emit("message", {
        data: JSON.stringify({
          type: "output", machineId: "m1", sessionId: "s2",
          lines: ["Y", "Z"], timestamp: 4,
        }),
      });
    });

    // Both session logs should have their scrolled-off lines
    expect(result.current.logMapRef.current?.get("m1:s1")).toEqual(["A"]);
    expect(result.current.logMapRef.current?.get("m1:s2")).toEqual(["X"]);
  });
});
