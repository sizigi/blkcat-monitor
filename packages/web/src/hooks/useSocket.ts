import { useState, useEffect, useRef, useCallback } from "react";
import type {
  MachineSnapshot,
  ServerToDashboardMessage,
} from "@blkcat/shared";

export interface OutputLine {
  machineId: string;
  sessionId: string;
  lines: string[];
  timestamp: number;
}

export interface UseSocketReturn {
  connected: boolean;
  machines: MachineSnapshot[];
  outputs: OutputLine[];
  sendInput: (machineId: string, sessionId: string, opts: { text?: string; key?: string; data?: string }) => void;
  startSession: (machineId: string, args?: string) => void;
}

export function useSocket(url: string): UseSocketReturn {
  const [connected, setConnected] = useState(false);
  const [machines, setMachines] = useState<MachineSnapshot[]>([]);
  const [outputs, setOutputs] = useState<OutputLine[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.addEventListener("open", () => setConnected(true));
    ws.addEventListener("close", () => setConnected(false));

    ws.addEventListener("message", (ev) => {
      try {
        const msg: ServerToDashboardMessage = JSON.parse(ev.data as string);

        if (msg.type === "snapshot") {
          setMachines(msg.machines);
        } else if (msg.type === "machine_update") {
          setMachines((prev) => {
            const idx = prev.findIndex((m) => m.machineId === msg.machineId);
            if (msg.sessions.length === 0) {
              return prev.filter((m) => m.machineId !== msg.machineId);
            }
            const updated: MachineSnapshot = {
              machineId: msg.machineId,
              sessions: msg.sessions,
              lastSeen: Date.now(),
            };
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = updated;
              return next;
            }
            return [...prev, updated];
          });
        } else if (msg.type === "output") {
          setOutputs((prev) => {
            const entry: OutputLine = {
              machineId: msg.machineId,
              sessionId: msg.sessionId,
              lines: msg.lines,
              timestamp: msg.timestamp,
            };
            const idx = prev.findIndex(
              (o) => o.machineId === msg.machineId && o.sessionId === msg.sessionId,
            );
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = entry;
              return next;
            }
            return [...prev, entry];
          });
        }
      } catch {}
    });

    return () => { ws.close(); };
  }, [url]);

  const sendInput = useCallback(
    (machineId: string, sessionId: string, opts: { text?: string; key?: string; data?: string }) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        const msg: Record<string, any> = { type: "input", machineId, sessionId };
        if (opts.text) msg.text = opts.text;
        if (opts.key) msg.key = opts.key;
        if (opts.data) msg.data = opts.data;
        ws.send(JSON.stringify(msg));
      }
    },
    [],
  );

  const startSession = useCallback(
    (machineId: string, args?: string) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        const msg: Record<string, any> = { type: "start_session", machineId };
        if (args) msg.args = args;
        ws.send(JSON.stringify(msg));
      }
    },
    [],
  );

  return { connected, machines, outputs, sendInput, startSession };
}
