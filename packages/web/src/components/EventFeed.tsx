import React, { useState, useEffect, useRef } from "react";
import type { AgentHookEventMessage } from "@blkcat/shared";

interface EventFeedProps {
  hookEventsRef: React.RefObject<AgentHookEventMessage[]>;
  subscribeHookEvents: (cb: (event: AgentHookEventMessage) => void) => () => void;
}

const EVENT_COLORS: Record<string, string> = {
  SessionStart: "#4caf50",
  SessionEnd: "#f44336",
  Stop: "#2196f3",
  PreToolUse: "#ff9800",
  PostToolUse: "#8bc34a",
  PostToolUseFailure: "#f44336",
  UserPromptSubmit: "#9c27b0",
  Notification: "#00bcd4",
  SubagentStart: "#673ab7",
  SubagentStop: "#795548",
  PermissionRequest: "#e91e63",
  TaskCompleted: "#009688",
  TeammateIdle: "#607d8b",
  ConfigChange: "#ffc107",
  PreCompact: "#9e9e9e",
};

function getEventColor(eventName: string): string {
  return EVENT_COLORS[eventName] ?? "#9e9e9e";
}

function getEventSummary(event: AgentHookEventMessage): string {
  const data = event.data;
  switch (event.hookEventName) {
    case "PreToolUse":
    case "PostToolUse":
      if (data.tool_name === "Bash" && data.tool_input && typeof (data.tool_input as any).command === "string") {
        const cmd = (data.tool_input as any).command as string;
        return cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd;
      }
      if (data.tool_name === "Edit" || data.tool_name === "Write") {
        return (data.tool_input as any)?.file_path ?? String(data.tool_name);
      }
      return String(data.tool_name ?? event.matcher ?? "");
    case "PostToolUseFailure":
      return `${data.tool_name ?? event.matcher ?? ""}: ${data.error ?? "failed"}`;
    case "UserPromptSubmit": {
      const prompt = String(data.prompt ?? "");
      return prompt.length > 60 ? prompt.slice(0, 57) + "..." : prompt;
    }
    case "SessionStart":
      return data.source ? `source: ${data.source}` : "started";
    case "SessionEnd":
      return data.reason ? `reason: ${data.reason}` : "ended";
    case "Stop":
      return "response complete";
    default:
      return event.matcher ?? "";
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function EventFeed({ hookEventsRef, subscribeHookEvents }: EventFeedProps) {
  const [events, setEvents] = useState<AgentHookEventMessage[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("");
  const listRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    // Seed with existing events
    setEvents([...hookEventsRef.current]);

    return subscribeHookEvents((event) => {
      setEvents((prev) => [...prev, event]);
    });
  }, [hookEventsRef, subscribeHookEvents]);

  // Auto-scroll to bottom when new events arrive
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

  const filtered = filter
    ? events.filter((e) => e.hookEventName === filter)
    : events;

  const eventTypes = [...new Set(events.map((e) => e.hookEventName))].sort();

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
        gap: 8,
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Events</span>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            marginLeft: "auto",
            fontSize: 11,
            padding: "2px 4px",
            background: "var(--bg-primary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            borderRadius: 3,
          }}
        >
          <option value="">All</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {filtered.length}
        </span>
      </div>
      <div
        ref={listRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          fontSize: 12,
        }}
      >
        {filtered.map((event, i) => {
          const globalIdx = events.indexOf(event);
          const isExpanded = expandedIdx === globalIdx;
          return (
            <div
              key={globalIdx}
              onClick={() => setExpandedIdx(isExpanded ? null : globalIdx)}
              style={{
                padding: "4px 12px",
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "var(--text-muted)", fontSize: 10, flexShrink: 0 }}>
                  {formatTime(event.timestamp)}
                </span>
                <span style={{
                  background: getEventColor(event.hookEventName),
                  color: "#fff",
                  borderRadius: 3,
                  padding: "1px 5px",
                  fontSize: 10,
                  fontWeight: 600,
                  flexShrink: 0,
                }}>
                  {event.hookEventName}
                </span>
                <span style={{
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {getEventSummary(event)}
                </span>
              </div>
              {isExpanded && (
                <pre style={{
                  marginTop: 4,
                  padding: 8,
                  background: "var(--bg-primary)",
                  borderRadius: 4,
                  fontSize: 11,
                  overflow: "auto",
                  maxHeight: 200,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}>
                  {JSON.stringify(event.data, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{
            padding: 24,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 12,
          }}>
            No events yet
          </div>
        )}
      </div>
    </div>
  );
}
