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
    const { result } = renderHook(() => useSocket("ws://test", "secret"));

    await vi.waitFor(() => {
      expect(result.current.connected).toBe(true);
    });
  });

  it("handles snapshot message", async () => {
    const { result } = renderHook(() => useSocket("ws://test", "secret"));
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

  it("sends input message", async () => {
    const { result } = renderHook(() => useSocket("ws://test", "secret"));

    await vi.waitFor(() => expect(result.current.connected).toBe(true));

    act(() => {
      result.current.sendInput("m1", "s1", "hello\n");
    });

    const ws = MockWebSocket.instances[0];
    const sent = JSON.parse(ws.sent[0]);
    expect(sent.type).toBe("input");
    expect(sent.text).toBe("hello\n");
  });
});
