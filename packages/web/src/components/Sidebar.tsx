import React, { useState } from "react";
import type { MachineSnapshot } from "@blkcat/shared";

interface SidebarProps {
  machines: MachineSnapshot[];
  selectedMachine?: string;
  selectedSession?: string;
  onSelectSession: (machineId: string, sessionId: string) => void;
  onStartSession?: (machineId: string, args?: string) => void;
}

export function Sidebar({
  machines,
  selectedMachine,
  selectedSession,
  onSelectSession,
  onStartSession,
}: SidebarProps) {
  const [expandedMachine, setExpandedMachine] = useState<string | null>(null);
  const [sessionArgs, setSessionArgs] = useState("");
  return (
    <aside
      style={{
        width: 250,
        borderRight: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        overflowY: "auto",
        flexShrink: 0,
      }}
    >
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Machines</h2>
      </div>
      {machines.length === 0 && (
        <p style={{ padding: 16, color: "var(--text-muted)" }}>No machines connected</p>
      )}
      {machines.map((machine) => (
        <div key={machine.machineId}>
          <div
            style={{
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--green)",
                display: "inline-block",
              }}
            />
            <span style={{ flex: 1 }}>{machine.machineId}</span>
            {onStartSession && (
              <button
                data-testid={`new-session-${machine.machineId}`}
                onClick={() => {
                  setExpandedMachine(
                    expandedMachine === machine.machineId ? null : machine.machineId,
                  );
                  setSessionArgs("");
                }}
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 14,
                  lineHeight: 1,
                  padding: "2px 6px",
                }}
              >
                +
              </button>
            )}
          </div>
          {expandedMachine === machine.machineId && onStartSession && (
            <form
              data-testid={`new-session-form-${machine.machineId}`}
              onSubmit={(e) => {
                e.preventDefault();
                onStartSession(machine.machineId, sessionArgs || undefined);
                setExpandedMachine(null);
                setSessionArgs("");
              }}
              style={{
                padding: "4px 16px 8px 32px",
                display: "flex",
                gap: 4,
              }}
            >
              <input
                data-testid={`new-session-args-${machine.machineId}`}
                type="text"
                value={sessionArgs}
                onChange={(e) => setSessionArgs(e.target.value)}
                placeholder="e.g. --model sonnet"
                style={{
                  flex: 1,
                  padding: "4px 8px",
                  fontSize: 12,
                  background: "var(--bg)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                }}
              />
              <button
                type="submit"
                style={{
                  padding: "4px 8px",
                  fontSize: 12,
                  background: "var(--accent)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Start
              </button>
            </form>
          )}
          {machine.sessions.map((session) => {
            const isSelected =
              selectedMachine === machine.machineId &&
              selectedSession === session.id;
            return (
              <button
                key={session.id}
                onClick={() => onSelectSession(machine.machineId, session.id)}
                data-testid={`session-${session.id}`}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 16px 6px 32px",
                  background: isSelected ? "var(--bg-tertiary)" : "transparent",
                  border: "none",
                  color: isSelected ? "var(--accent)" : "var(--text)",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                {session.name}
                {session.target === "ssh" && (
                  <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>
                    (ssh)
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
