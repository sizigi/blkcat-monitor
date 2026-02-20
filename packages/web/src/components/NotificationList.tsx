import React, { useState, useEffect, useRef } from "react";
import type { AgentHookEventMessage } from "@blkcat/shared";
import { NOTIFY_HOOK_EVENTS } from "@blkcat/shared";

interface NotificationListProps {
  hookEventsRef: React.RefObject<AgentHookEventMessage[]>;
  subscribeHookEvents: (cb: (event: AgentHookEventMessage) => void) => () => void;
  onSelectSession?: (machineId: string, sessionId: string) => void;
  getMachineName?: (machineId: string) => string;
  getSessionName?: (sessionId: string, defaultName: string) => string;
}

const EVENT_LABELS: Record<string, string> = {
  Stop: "Response complete",
  Notification: "Notification",
  PermissionRequest: "Permission needed",
};

const EVENT_COLORS: Record<string, string> = {
  Stop: "#2196f3",
  Notification: "#00bcd4",
  PermissionRequest: "#e91e63",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function NotificationList({
  hookEventsRef,
  subscribeHookEvents,
  onSelectSession,
  getMachineName,
  getSessionName,
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
            <div style={{ marginTop: 2, color: "var(--text-muted)", fontSize: 11 }}>
              {getMachineName ? getMachineName(event.machineId) : event.machineId}
              {event.sessionId && (
                <> / {getSessionName
                  ? getSessionName(event.sessionId, event.sessionId)
                  : event.sessionId}</>
              )}
            </div>
            <div style={{ marginTop: 1, fontSize: 11 }}>
              {EVENT_LABELS[event.hookEventName] ?? event.hookEventName}
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
