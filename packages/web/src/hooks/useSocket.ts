import { useState, useEffect, useRef, useCallback } from "react";
import type {
  MachineSnapshot,
  ServerToDashboardMessage,
  AgentHookEventMessage,
} from "@blkcat/shared";
import { NOTIFY_HOOK_EVENTS } from "@blkcat/shared";

export interface OutputLine {
  machineId: string;
  sessionId: string;
  lines: string[];
  timestamp: number;
  waitingForInput?: boolean;
}

const MAX_LOG_LINES = 10000;

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trimEnd();
}

/** Detect how many lines scrolled off the top between two viewport snapshots.
 *  Returns 0 for in-place edits (spinners, typing). */
function detectScrolled(prev: string[], curr: string[]): number {
  if (prev.length === 0 || curr.length === 0) return 0;

  const prevStripped = prev.map(stripAnsi);
  const currStripped = curr.map(stripAnsi);

  // Scroll overlap: longest suffix of prev matching prefix of curr
  let scrollOverlap = 0;
  const maxK = Math.min(prev.length, curr.length);
  for (let k = maxK; k >= 1; k--) {
    let match = true;
    for (let i = 0; i < k; i++) {
      if (prevStripped[prev.length - k + i] !== currStripped[i]) {
        match = false;
        break;
      }
    }
    if (match) { scrollOverlap = k; break; }
  }

  // In-place match: lines identical at the same position
  let inPlaceMatch = 0;
  const minLen = Math.min(prevStripped.length, currStripped.length);
  for (let i = 0; i < minLen; i++) {
    if (prevStripped[i] === currStripped[i]) inPlaceMatch++;
  }

  return scrollOverlap > inPlaceMatch ? prev.length - scrollOverlap : 0;
}

export interface UseSocketReturn {
  connected: boolean;
  machines: MachineSnapshot[];
  waitingSessions: Set<string>;
  activeSessions: Set<string>;
  outputMapRef: React.RefObject<Map<string, OutputLine>>;
  logMapRef: React.RefObject<Map<string, string[]>>;
  scrollbackMapRef: React.RefObject<Map<string, string[]>>;
  subscribeOutput: (cb: (key: string) => void) => () => void;
  subscribeScrollback: (cb: (key: string) => void) => () => void;
  sendInput: (machineId: string, sessionId: string, opts: { text?: string; key?: string; data?: string }) => void;
  startSession: (machineId: string, args?: string, cwd?: string, name?: string) => void;
  closeSession: (machineId: string, sessionId: string) => void;
  reloadSession: (machineId: string, sessionId: string) => void;
  sendResize: (machineId: string, sessionId: string, cols: number, rows: number) => void;
  requestScrollback: (machineId: string, sessionId: string) => void;
  hookEventsRef: React.RefObject<AgentHookEventMessage[]>;
  subscribeHookEvents: (cb: (event: AgentHookEventMessage) => void) => () => void;
  notificationCounts: Map<string, number>;
  clearNotifications: (sessionKey: string) => void;
  listDirectory: (machineId: string, path: string) => Promise<{ path: string; entries: { name: string; isDir: boolean }[]; error?: string }>;
  sendRaw: (msg: object) => void;
  deploySkills: (machineId: string, skills: { name: string; files: { path: string; content: string }[] }[]) => string;
  getSettings: (machineId: string, scope: "global" | "project", projectPath?: string) => string;
  updateSettings: (machineId: string, scope: "global" | "project", settings: Record<string, unknown>, projectPath?: string) => string;
  subscribeDeployResult: (cb: (msg: any) => void) => () => void;
  subscribeSettingsSnapshot: (cb: (msg: any) => void) => () => void;
  subscribeSettingsResult: (cb: (msg: any) => void) => () => void;
}

export function useSocket(url: string): UseSocketReturn {
  const [connected, setConnected] = useState(false);
  const [machines, setMachines] = useState<MachineSnapshot[]>([]);
  const [waitingSessions, setWaitingSessions] = useState<Set<string>>(new Set());
  const [activeSessions, setActiveSessions] = useState<Set<string>>(new Set());
  const activeTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const wsRef = useRef<WebSocket | null>(null);

  // Store outputs in a ref-based Map for O(1) lookup without triggering
  // App-level re-renders on every output message from every session.
  const outputMapRef = useRef(new Map<string, OutputLine>());
  const outputSubsRef = useRef(new Set<(key: string) => void>());

  // Per-session log buffers and previous-output tracking for overlap detection.
  // Runs for ALL sessions so logs accumulate even when not selected.
  const logMapRef = useRef(new Map<string, string[]>());
  const prevLinesMapRef = useRef(new Map<string, string[]>());

  // Scrollback responses from agents (full tmux scrollback buffer).
  const scrollbackMapRef = useRef(new Map<string, string[]>());
  const scrollbackSubsRef = useRef(new Set<(key: string) => void>());

  const hookEventsRef = useRef<AgentHookEventMessage[]>([]);
  const hookEventSubsRef = useRef(new Set<(event: AgentHookEventMessage) => void>());

  const directoryListingSubsRef = useRef(new Map<string, (msg: { path: string; entries: { name: string; isDir: boolean }[]; error?: string }) => void>());

  const deployResultSubsRef = useRef(new Set<(msg: any) => void>());
  const settingsSnapshotSubsRef = useRef(new Set<(msg: any) => void>());
  const settingsResultSubsRef = useRef(new Set<(msg: any) => void>());

  const [notificationCounts, setNotificationCounts] = useState<Map<string, number>>(new Map());

  const clearNotifications = useCallback((sessionKey: string) => {
    setNotificationCounts((prev) => {
      if (!prev.has(sessionKey)) return prev;
      const next = new Map(prev);
      next.delete(sessionKey);
      return next;
    });
  }, []);

  const subscribeHookEvents = useCallback((cb: (event: AgentHookEventMessage) => void) => {
    hookEventSubsRef.current.add(cb);
    return () => { hookEventSubsRef.current.delete(cb); };
  }, []);

  const subscribeOutput = useCallback((cb: (key: string) => void) => {
    outputSubsRef.current.add(cb);
    return () => { outputSubsRef.current.delete(cb); };
  }, []);

  const subscribeScrollback = useCallback((cb: (key: string) => void) => {
    scrollbackSubsRef.current.add(cb);
    return () => { scrollbackSubsRef.current.delete(cb); };
  }, []);

  const subscribeDeployResult = useCallback((cb: (msg: any) => void) => {
    deployResultSubsRef.current.add(cb);
    return () => { deployResultSubsRef.current.delete(cb); };
  }, []);

  const subscribeSettingsSnapshot = useCallback((cb: (msg: any) => void) => {
    settingsSnapshotSubsRef.current.add(cb);
    return () => { settingsSnapshotSubsRef.current.delete(cb); };
  }, []);

  const subscribeSettingsResult = useCallback((cb: (msg: any) => void) => {
    settingsResultSubsRef.current.add(cb);
    return () => { settingsResultSubsRef.current.delete(cb); };
  }, []);

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
          // Seed hook events from snapshot
          for (const machine of msg.machines) {
            if (machine.recentEvents) {
              hookEventsRef.current.push(...machine.recentEvents);
            }
          }
          const counts = new Map<string, number>();
          for (const machine of msg.machines) {
            if (machine.recentEvents) {
              for (const ev of machine.recentEvents) {
                if (NOTIFY_HOOK_EVENTS.has(ev.hookEventName) && ev.sessionId) {
                  const key = `${machine.machineId}:${ev.sessionId}`;
                  counts.set(key, (counts.get(key) ?? 0) + 1);
                }
              }
            }
          }
          if (counts.size > 0) setNotificationCounts(counts);
        } else if (msg.type === "machine_update") {
          setMachines((prev) => {
            if (msg.online === false) {
              return prev.filter((m) => m.machineId !== msg.machineId);
            }
            const idx = prev.findIndex((m) => m.machineId === msg.machineId);
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
        } else if (msg.type === "scrollback") {
          const key = `${msg.machineId}:${msg.sessionId}`;
          scrollbackMapRef.current.set(key, msg.lines);
          for (const sub of scrollbackSubsRef.current) sub(key);
        } else if (msg.type === "output") {
          const key = `${msg.machineId}:${msg.sessionId}`;
          const entry: OutputLine = {
            machineId: msg.machineId,
            sessionId: msg.sessionId,
            lines: msg.lines,
            timestamp: msg.timestamp,
            waitingForInput: (msg as any).waitingForInput,
          };
          outputMapRef.current.set(key, entry);

          // Accumulate scrolled-off lines into per-session log
          const prev = prevLinesMapRef.current.get(key) || [];
          const scrolled = detectScrolled(prev, msg.lines);
          if (scrolled > 0) {
            let log = logMapRef.current.get(key);
            if (!log) { log = []; logMapRef.current.set(key, log); }
            log.push(...prev.slice(0, scrolled));
            if (log.length > MAX_LOG_LINES) {
              logMapRef.current.set(key, log.slice(-MAX_LOG_LINES));
            }
          }
          prevLinesMapRef.current.set(key, msg.lines);

          // Notify subscribers (only the selected session's hook re-renders)
          for (const sub of outputSubsRef.current) sub(key);

          // Track active sessions (recently received output)
          setActiveSessions((prev) => {
            if (!prev.has(key)) {
              const next = new Set(prev);
              next.add(key);
              return next;
            }
            return prev;
          });
          // Reset inactivity timer
          const prevTimer = activeTimersRef.current.get(key);
          if (prevTimer) clearTimeout(prevTimer);
          activeTimersRef.current.set(key, setTimeout(() => {
            activeTimersRef.current.delete(key);
            setActiveSessions((prev) => {
              if (!prev.has(key)) return prev;
              const next = new Set(prev);
              next.delete(key);
              return next;
            });
          }, 3000));

          // Clear waiting state when output flows (Claude is generating)
          setWaitingSessions((prev) => {
            if (!prev.has(key)) return prev;
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        } else if (msg.type === "hook_event") {
          const hookEvent = msg as unknown as AgentHookEventMessage;
          hookEventsRef.current.push(hookEvent);
          if (hookEventsRef.current.length > 1000) {
            hookEventsRef.current = hookEventsRef.current.slice(-1000);
          }
          for (const sub of hookEventSubsRef.current) sub(hookEvent);
          // Mark session as waiting on Stop / PermissionRequest
          if ((hookEvent.hookEventName === "Stop" || hookEvent.hookEventName === "PermissionRequest") && hookEvent.sessionId) {
            const key = `${hookEvent.machineId}:${hookEvent.sessionId}`;
            setWaitingSessions((prev) => {
              if (prev.has(key)) return prev;
              const next = new Set(prev);
              next.add(key);
              return next;
            });
          }
          if (NOTIFY_HOOK_EVENTS.has(hookEvent.hookEventName) && hookEvent.sessionId) {
            const key = `${hookEvent.machineId}:${hookEvent.sessionId}`;
            setNotificationCounts((prev) => {
              const next = new Map(prev);
              next.set(key, (next.get(key) ?? 0) + 1);
              return next;
            });
          }
        } else if (msg.type === "directory_listing") {
          const cb = directoryListingSubsRef.current.get(msg.requestId);
          if (cb) {
            directoryListingSubsRef.current.delete(msg.requestId);
            cb({ path: msg.path, entries: (msg as any).entries ?? [], error: (msg as any).error });
          }
        } else if (msg.type === "deploy_result") {
          for (const sub of deployResultSubsRef.current) sub(msg);
        } else if (msg.type === "settings_snapshot") {
          for (const sub of settingsSnapshotSubsRef.current) sub(msg);
        } else if (msg.type === "settings_result") {
          for (const sub of settingsResultSubsRef.current) sub(msg);
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
        // Clear waiting state when user sends input
        const key = `${machineId}:${sessionId}`;
        setWaitingSessions((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [],
  );

  const startSession = useCallback(
    (machineId: string, args?: string, cwd?: string, name?: string) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        const msg: Record<string, any> = { type: "start_session", machineId };
        if (args) msg.args = args;
        if (cwd) msg.cwd = cwd;
        if (name) msg.name = name;
        ws.send(JSON.stringify(msg));
      }
    },
    [],
  );

  const closeSession = useCallback(
    (machineId: string, sessionId: string) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "close_session", machineId, sessionId }));
      }
    },
    [],
  );

  const reloadSession = useCallback(
    (machineId: string, sessionId: string) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "reload_session", machineId, sessionId }));
      }
    },
    [],
  );

  const sendResize = useCallback(
    (machineId: string, sessionId: string, cols: number, rows: number) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", machineId, sessionId, cols, rows }));
      }
    },
    [],
  );

  const requestScrollback = useCallback(
    (machineId: string, sessionId: string) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "request_scrollback", machineId, sessionId }));
      }
    },
    [],
  );

  const listDirectory = useCallback(
    (machineId: string, path: string): Promise<{ path: string; entries: { name: string; isDir: boolean }[]; error?: string }> => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        return Promise.resolve({ path, entries: [], error: "Not connected" });
      }
      const requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          directoryListingSubsRef.current.delete(requestId);
          resolve({ path, entries: [], error: "Timeout" });
        }, 5000);
        directoryListingSubsRef.current.set(requestId, (result) => {
          clearTimeout(timeout);
          resolve(result);
        });
        ws.send(JSON.stringify({ type: "list_directory", machineId, requestId, path }));
      });
    },
    [],
  );

  const sendRaw = useCallback((msg: object) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const deploySkills = useCallback((machineId: string, skills: { name: string; files: { path: string; content: string }[] }[]) => {
    const requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sendRaw({ type: "deploy_skills", machineId, requestId, skills });
    return requestId;
  }, [sendRaw]);

  const getSettings = useCallback((machineId: string, scope: "global" | "project", projectPath?: string) => {
    const requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const msg: Record<string, any> = { type: "get_settings", machineId, requestId, scope };
    if (projectPath) msg.projectPath = projectPath;
    sendRaw(msg);
    return requestId;
  }, [sendRaw]);

  const updateSettings = useCallback((machineId: string, scope: "global" | "project", settings: Record<string, unknown>, projectPath?: string) => {
    const requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const msg: Record<string, any> = { type: "update_settings", machineId, requestId, scope, settings };
    if (projectPath) msg.projectPath = projectPath;
    sendRaw(msg);
    return requestId;
  }, [sendRaw]);

  return { connected, machines, waitingSessions, activeSessions, outputMapRef, logMapRef, scrollbackMapRef, subscribeOutput, subscribeScrollback, sendInput, startSession, closeSession, reloadSession, sendResize, requestScrollback, hookEventsRef, subscribeHookEvents, notificationCounts, clearNotifications, listDirectory, sendRaw, deploySkills, getSettings, updateSettings, subscribeDeployResult, subscribeSettingsSnapshot, subscribeSettingsResult };
}
