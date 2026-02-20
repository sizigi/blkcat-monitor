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
});
