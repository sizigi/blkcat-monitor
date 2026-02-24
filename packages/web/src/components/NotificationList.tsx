import React, { useState, useEffect, useRef } from "react";
import type { AgentHookEventMessage, MachineSnapshot } from "@blkcat/shared";
import { NOTIFY_HOOK_EVENTS } from "@blkcat/shared";
import { X } from "./Icons";

interface NotificationListProps {
  hookEventsRef: React.RefObject<AgentHookEventMessage[]>;
  subscribeHookEvents: (cb: (event: AgentHookEventMessage) => void) => () => void;
  machines: MachineSnapshot[];
  onSelectSession?: (machineId: string, sessionId: string) => void;
  getMachineName?: (machineId: string) => string;
  getSessionName?: (machineId: string, sessionId: string, defaultName: string) => string;
  onClose?: () => void;
}

const EVENT_COLORS: Record<string, string> = {
  Stop: "#2196f3",
  Notification: "#00bcd4",
  PermissionRequest: "#e91e63",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function getEventDetail(event: AgentHookEventMessage): string {
  const data = event.data;
  switch (event.hookEventName) {
    case "Stop":
      return String(data.stop_hook_reason ?? "response complete");
    case "Notification": {
      const title = data.title ? String(data.title) : "";
      const message = data.message ? String(data.message) : "";
      const text = title && message ? `${title}: ${message}` : title || message || "notification";
      return text.length > 80 ? text.slice(0, 77) + "..." : text;
    }
    case "PermissionRequest": {
      const tool = data.tool_name ? String(data.tool_name) : "";
      if (tool === "Bash" && data.tool_input && typeof (data.tool_input as any).command === "string") {
        const cmd = (data.tool_input as any).command as string;
        return `${tool}: ${cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd}`;
      }
      if ((tool === "Edit" || tool === "Write") && data.tool_input && (data.tool_input as any).file_path) {
        return `${tool}: ${(data.tool_input as any).file_path}`;
      }
      return tool ? `permission: ${tool}` : "permission needed";
    }
    default:
      return event.hookEventName;
  }
}

function lookupSessionName(
  machines: MachineSnapshot[],
  machineId: string,
  sessionId: string,
): string {
  const machine = machines.find((m) => m.machineId === machineId);
  const session = machine?.sessions.find((s) => s.id === sessionId);
  return session?.name ?? sessionId;
}

export function NotificationList({
  hookEventsRef,
  subscribeHookEvents,
  machines,
  onSelectSession,
  getMachineName,
  getSessionName,
  onClose,
}: NotificationListProps) {
  const [events, setEvents] = useState<AgentHookEventMessage[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    setEvents(hookEventsRef.current.filter((e) => NOTIFY_HOOK_EVENTS.has(e.hookEventName)));
    return subscribeHookEvents((event) => {
      if (NOTIFY_HOOK_EVENTS.has(event.hookEventName)) {
        setEvents((prev) => [...prev, event]);
      }
    });
  }, [hookEventsRef, subscribeHookEvents]);

  useEffect(() => {
    if (autoScrollRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events.length]);

  const handleScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--bg-secondary)",
      borderLeft: "1px solid var(--border)",
    }}>
      <div style={{
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
      }}>
        {onClose && (
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "var(--text-muted)",
            cursor: "pointer", lineHeight: 1, padding: "8px 12px",
            minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center",
          }}><X size={18} /></button>
        )}
        <span style={{ fontWeight: 600, fontSize: 13 }}>Notifications</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
          {events.length}
        </span>
      </div>
      <div
        ref={listRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: "auto", fontSize: 12 }}
      >
        {events.map((event, i) => (
          <div
            key={i}
            onClick={() => {
              if (event.sessionId && onSelectSession) {
                onSelectSession(event.machineId, event.sessionId);
              }
            }}
            style={{
              padding: "6px 12px",
              borderBottom: "1px solid var(--border)",
              cursor: event.sessionId ? "pointer" : "default",
            }}
            onMouseEnter={(e) => { if (event.sessionId) (e.currentTarget as HTMLElement).style.background = "var(--bg-tertiary)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "var(--text-muted)", fontSize: 10, flexShrink: 0 }}>
                {formatTime(event.timestamp)}
              </span>
              <span style={{
                background: EVENT_COLORS[event.hookEventName] ?? "#9e9e9e",
                color: "#fff",
                borderRadius: 3,
                padding: "1px 5px",
                fontSize: 10,
                fontWeight: 600,
                flexShrink: 0,
              }}>
                {event.hookEventName}
              </span>
            </div>
            <div style={{ marginTop: 2, fontSize: 11, fontWeight: 600 }}>
              {getMachineName ? getMachineName(event.machineId) : event.machineId}
              {event.sessionId && (
                <> / {getSessionName
                  ? getSessionName(event.machineId, event.sessionId, lookupSessionName(machines, event.machineId, event.sessionId))
                  : lookupSessionName(machines, event.machineId, event.sessionId)}</>
              )}
            </div>
            <div style={{
              marginTop: 2,
              fontSize: 11,
              color: "var(--text-muted)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {getEventDetail(event)}
            </div>
          </div>
        ))}
        {events.length === 0 && (
          <div style={{
            padding: 24,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 12,
          }}>
            No notifications yet
          </div>
        )}
      </div>
    </div>
  );
}
