import React from "react";
import type { MachineSnapshot } from "@blkcat/shared";

interface SidebarProps {
  machines: MachineSnapshot[];
  selectedMachine?: string;
  selectedSession?: string;
  onSelectSession: (machineId: string, sessionId: string) => void;
}

export function Sidebar({
  machines,
  selectedMachine,
  selectedSession,
  onSelectSession,
}: SidebarProps) {
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
            {machine.machineId}
          </div>
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
