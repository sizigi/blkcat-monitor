import React, { useState } from "react";
import type { MachineSnapshot, OutboundAgentInfo } from "@blkcat/shared";
import { AgentManager } from "./AgentManager";

interface SidebarProps {
  machines: MachineSnapshot[];
  selectedMachine?: string;
  selectedSession?: string;
  onSelectSession: (machineId: string, sessionId: string) => void;
  onStartSession?: (machineId: string, args?: string, cwd?: string) => void;
  onCloseSession?: (machineId: string, sessionId: string) => void;
  getMachineName?: (machineId: string) => string;
  getSessionName?: (sessionId: string, defaultName: string) => string;
  onRenameMachine?: (machineId: string, name: string) => void;
  onRenameSession?: (sessionId: string, name: string) => void;
  waitingSessions?: Set<string>;
  agents?: OutboundAgentInfo[];
  onAddAgent?: (address: string) => Promise<{ ok: boolean; error?: string }>;
  onRemoveAgent?: (address: string) => Promise<void>;
}

export function Sidebar({
  machines,
  selectedMachine,
  selectedSession,
  onSelectSession,
  onStartSession,
  onCloseSession,
  getMachineName,
  getSessionName,
  onRenameMachine,
  onRenameSession,
  waitingSessions,
  agents,
  onAddAgent,
  onRemoveAgent,
}: SidebarProps) {
  const [expandedMachine, setExpandedMachine] = useState<string | null>(null);
  const [sessionArgs, setSessionArgs] = useState("");
  const [sessionCwd, setSessionCwd] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  return (
    <aside
      style={{
        width: 250,
        borderRight: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, overflowY: "auto" }}>
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
            {editingId === `machine:${machine.machineId}` ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => {
                  onRenameMachine?.(machine.machineId, editValue.trim());
                  setEditingId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onRenameMachine?.(machine.machineId, editValue.trim());
                    setEditingId(null);
                  } else if (e.key === "Escape") {
                    setEditingId(null);
                  }
                }}
                style={{
                  flex: 1,
                  background: "var(--bg)",
                  color: "var(--text)",
                  border: "1px solid var(--accent)",
                  borderRadius: 3,
                  padding: "1px 4px",
                  fontSize: 13,
                  fontWeight: 600,
                  outline: "none",
                }}
              />
            ) : (
              <span
                style={{ flex: 1, cursor: onRenameMachine ? "pointer" : "default" }}
                onDoubleClick={() => {
                  if (!onRenameMachine) return;
                  setEditingId(`machine:${machine.machineId}`);
                  setEditValue(getMachineName ? getMachineName(machine.machineId) : machine.machineId);
                }}
                title="Double-click to rename"
              >
                {getMachineName ? getMachineName(machine.machineId) : machine.machineId}
              </span>
            )}
            {onStartSession && (
              <button
                data-testid={`new-session-${machine.machineId}`}
                onClick={() => {
                  setExpandedMachine(
                    expandedMachine === machine.machineId ? null : machine.machineId,
                  );
                  setSessionArgs("");
                  setSessionCwd("");
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
                onStartSession(machine.machineId, sessionArgs || undefined, sessionCwd || undefined);
                setExpandedMachine(null);
                setSessionArgs("");
                setSessionCwd("");
              }}
              style={{
                padding: "4px 16px 8px 32px",
                display: "flex",
                flexDirection: "column",
                gap: 4,
              }}
            >
              <input
                data-testid={`new-session-cwd-${machine.machineId}`}
                type="text"
                value={sessionCwd}
                onChange={(e) => setSessionCwd(e.target.value)}
                placeholder="path, e.g. ~/projects/myapp"
                style={{
                  width: "100%",
                  padding: "4px 8px",
                  fontSize: 12,
                  background: "var(--bg)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: 4 }}>
                <input
                  data-testid={`new-session-args-${machine.machineId}`}
                  type="text"
                  value={sessionArgs}
                  onChange={(e) => setSessionArgs(e.target.value)}
                  placeholder="args, e.g. --model sonnet"
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
              </div>
            </form>
          )}
          {machine.sessions.map((session) => {
            const isSelected =
              selectedMachine === machine.machineId &&
              selectedSession === session.id;
            const isWaiting = waitingSessions?.has(`${machine.machineId}:${session.id}`);
            return (
              <div
                key={session.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: isSelected ? "var(--bg-tertiary)" : "transparent",
                }}
              >
                <button
                  onClick={() => onSelectSession(machine.machineId, session.id)}
                  data-testid={`session-${session.id}`}
                  style={{
                    flex: 1,
                    textAlign: "left",
                    padding: "6px 4px 6px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "transparent",
                    border: "none",
                    color: isSelected ? "var(--accent)" : "var(--text)",
                    cursor: "pointer",
                    fontSize: 13,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    className={isWaiting ? "waiting-indicator" : undefined}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: isWaiting ? "var(--accent)" : "var(--text-muted)",
                      display: "inline-block",
                      flexShrink: 0,
                      opacity: isWaiting ? 1 : 0.3,
                    }}
                    title={isWaiting ? "Waiting for input" : ""}
                  />
                  {editingId === `session:${session.id}` ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => {
                        onRenameSession?.(session.id, editValue.trim());
                        setEditingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onRenameSession?.(session.id, editValue.trim());
                          setEditingId(null);
                        } else if (e.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                      style={{
                        width: "100%",
                        background: "var(--bg)",
                        color: "var(--text)",
                        border: "1px solid var(--accent)",
                        borderRadius: 3,
                        padding: "1px 4px",
                        fontSize: 13,
                        outline: "none",
                      }}
                    />
                  ) : (
                    <span
                      onDoubleClick={(e) => {
                        if (!onRenameSession) return;
                        e.stopPropagation();
                        setEditingId(`session:${session.id}`);
                        setEditValue(
                          getSessionName ? getSessionName(session.id, session.name) : session.name,
                        );
                      }}
                      title="Double-click to rename"
                    >
                      {getSessionName ? getSessionName(session.id, session.name) : session.name}
                      {session.target === "ssh" && (
                        <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>
                          (ssh)
                        </span>
                      )}
                    </span>
                  )}
                </button>
                {onCloseSession && (
                  <button
                    data-testid={`close-session-${session.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onCloseSession(machine.machineId, session.id);
                    }}
                    title="Close session"
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: 12,
                      padding: "4px 8px",
                      lineHeight: 1,
                      opacity: 0.5,
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; (e.target as HTMLElement).style.color = "var(--red)"; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.5"; (e.target as HTMLElement).style.color = "var(--text-muted)"; }}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
      </div>
      {agents && onAddAgent && onRemoveAgent && (
        <AgentManager agents={agents} onAdd={onAddAgent} onRemove={onRemoveAgent} />
      )}
    </aside>
  );
}
