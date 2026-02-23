import React, { useState } from "react";
import type { MachineSnapshot, OutboundAgentInfo } from "@blkcat/shared";
import { AgentManager } from "./AgentManager";
import { StartSessionModal } from "./StartSessionModal";

interface SidebarProps {
  width?: number;
  machines: MachineSnapshot[];
  selectedMachine?: string;
  selectedSession?: string;
  onSelectSession: (machineId: string, sessionId: string) => void;
  onStartSession?: (machineId: string, args?: string, cwd?: string, name?: string) => void;
  onCloseSession?: (machineId: string, sessionId: string) => void;
  onReloadSession?: (machineId: string, sessionId: string) => void;
  getMachineName?: (machineId: string) => string;
  getSessionName?: (machineId: string, sessionId: string, defaultName: string) => string;
  onRenameMachine?: (machineId: string, name: string) => void;
  onRenameSession?: (machineId: string, sessionId: string, name: string) => void;
  notificationCounts?: Map<string, number>;
  waitingSessions?: Set<string>;
  activeSessions?: Set<string>;
  agents?: OutboundAgentInfo[];
  onAddAgent?: (address: string) => Promise<{ ok: boolean; error?: string }>;
  onRemoveAgent?: (address: string) => Promise<void>;
  onCollapse?: () => void;
  listDirectory?: (machineId: string, path: string) => Promise<{ path: string; entries: { name: string; isDir: boolean }[]; error?: string }>;
  onSessionSettings?: (machineId: string, sessionId: string) => void;
  className?: string;
}

export function Sidebar({
  width = 250,
  machines,
  selectedMachine,
  selectedSession,
  onSelectSession,
  onStartSession,
  onCloseSession,
  onReloadSession,
  getMachineName,
  getSessionName,
  onRenameMachine,
  onRenameSession,
  notificationCounts,
  waitingSessions,
  activeSessions,
  agents,
  onAddAgent,
  onRemoveAgent,
  onCollapse,
  listDirectory,
  onSessionSettings,
  className,
}: SidebarProps) {
  const [modalMachineId, setModalMachineId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  return (
    <aside
      className={`sidebar${className ? ` ${className}` : ""}`}
      style={{
        width,
        borderRight: "1px solid var(--border)",
        background: "var(--bg-secondary)",
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Machines</h2>
        {onCollapse && (
          <button
            onClick={onCollapse}
            title="Hide sidebar"
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
              padding: "2px 4px",
            }}
          >
            &#x2039;&#x2039;
          </button>
        )}
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
                onClick={() => setModalMachineId(machine.machineId)}
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
          {machine.sessions.map((session) => {
            const isSelected =
              selectedMachine === machine.machineId &&
              selectedSession === session.id;
            const isWaiting = waitingSessions?.has(`${machine.machineId}:${session.id}`);
            const isActive = activeSessions?.has(`${machine.machineId}:${session.id}`);
            const isDangerous = session.args?.includes("--dangerously-skip-permissions");
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
                    color: isDangerous ? "var(--red)" : isSelected ? "var(--accent)" : "var(--text)",
                    cursor: "pointer",
                    fontSize: 13,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  <span
                    className={isActive ? "active-indicator" : isWaiting ? "waiting-indicator" : undefined}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: isActive ? "var(--green)" : isWaiting ? "var(--accent)" : "var(--text-muted)",
                      display: "inline-block",
                      flexShrink: 0,
                      opacity: isActive || isWaiting ? 1 : 0.3,
                    }}
                    title={isActive ? "Active" : isWaiting ? "Waiting for input" : ""}
                  />
                  {editingId === `session:${session.id}` ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => {
                        const currentName = getSessionName
                          ? getSessionName(machine.machineId, session.id, session.name)
                          : session.name;
                        const trimmed = editValue.trim();
                        if (trimmed && trimmed !== currentName) {
                          onRenameSession?.(machine.machineId, session.id, trimmed);
                        }
                        setEditingId(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          onRenameSession?.(machine.machineId, session.id, editValue.trim());
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
                          getSessionName ? getSessionName(machine.machineId, session.id, session.name) : session.name,
                        );
                      }}
                      title="Double-click to rename"
                    >
                      {getSessionName ? getSessionName(machine.machineId, session.id, session.name) : session.name}
                      {session.target === "ssh" && (
                        <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>
                          (ssh)
                        </span>
                      )}
                    </span>
                  )}
                  {(() => {
                    const count = notificationCounts?.get(`${machine.machineId}:${session.id}`) ?? 0;
                    if (count === 0) return null;
                    return (
                      <span style={{
                        background: "var(--red)",
                        color: "#fff",
                        borderRadius: 8,
                        padding: "0 5px",
                        fontSize: 10,
                        fontWeight: 700,
                        marginLeft: 4,
                        minWidth: 16,
                        textAlign: "center" as const,
                        lineHeight: "16px",
                        display: "inline-block",
                      }}>
                        {count}
                      </span>
                    );
                  })()}
                </button>
                {onSessionSettings && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSessionSettings(machine.machineId, session.id);
                    }}
                    title="Project settings"
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
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.5"; }}
                  >
                    ⚙
                  </button>
                )}
                {onReloadSession && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Reload this session?")) {
                        onReloadSession(machine.machineId, session.id);
                      }
                    }}
                    title="Reload session (claude --resume)"
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
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.5"; }}
                  >
                    ↻
                  </button>
                )}
                {onCloseSession && (
                  <button
                    data-testid={`close-session-${session.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm("Close this session?")) {
                        onCloseSession(machine.machineId, session.id);
                      }
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
      {modalMachineId && onStartSession && listDirectory && (
        <StartSessionModal
          machineId={modalMachineId}
          machineName={getMachineName ? getMachineName(modalMachineId) : modalMachineId}
          onStart={(mid, args, cwd, name) => {
            onStartSession(mid, args, cwd, name);
            setModalMachineId(null);
          }}
          onClose={() => setModalMachineId(null)}
          listDirectory={listDirectory}
        />
      )}
    </aside>
  );
}
