import React, { useState, useEffect, useRef } from "react";
import type { MachineSnapshot, OutboundAgentInfo, SessionInfo, CliTool } from "@blkcat/shared";
import { AgentManager } from "./AgentManager";
import { StartSessionModal } from "./StartSessionModal";
import { ReloadSessionModal } from "./ReloadSessionModal";
import { ChevronsLeft, ChevronDown, GripDots, Settings, Check, X, RotateCw, Plus } from "./Icons";

interface SidebarProps {
  width?: number;
  machines: MachineSnapshot[];
  selectedMachine?: string;
  selectedSession?: string;
  onSelectSession: (machineId: string, sessionId: string) => void;
  onDeselect?: () => void;
  onStartSession?: (machineId: string, args?: string, cwd?: string, name?: string, cliTool?: CliTool) => void;
  onCloseSession?: (machineId: string, sessionId: string) => void;
  onReloadSession?: (machineId: string, sessionId: string, args?: string, resume?: boolean) => void;
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
  createDirectory?: (machineId: string, path: string) => Promise<{ path: string; success: boolean; error?: string }>;
  onSessionSettings?: (machineId: string, sessionId: string) => void;
  subscribeReloadResult?: (cb: (msg: { machineId: string; sessionId: string; success: boolean; error?: string }) => void) => () => void;
  onReorderMachine?: (fromIndex: number, toIndex: number) => void;
  onReorderSession?: (machineId: string, fromIndex: number, toIndex: number) => void;
  className?: string;
  currentTheme?: string;
  onThemeChange?: (id: string) => void;
  themes?: { id: string; label: string; accent: string; bg: string }[];
}

export function Sidebar({
  width = 250,
  machines,
  selectedMachine,
  selectedSession,
  onSelectSession,
  onDeselect,
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
  createDirectory,
  onSessionSettings,
  subscribeReloadResult,
  onReorderMachine,
  onReorderSession,
  className,
  currentTheme,
  onThemeChange,
  themes,
}: SidebarProps) {
  const [modalMachineId, setModalMachineId] = useState<string | null>(null);
  const [reloadTarget, setReloadTarget] = useState<{ machineId: string; session: SessionInfo } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [editValue, setEditValue] = useState("");
  // Drag-to-reorder state (refs to avoid re-renders during drag)
  const dragMachineRef = useRef<{ index: number } | null>(null);
  const dragSessionRef = useRef<{ machineId: string; index: number } | null>(null);
  const [dropIndicator, setDropIndicator] = useState<
    | { kind: "machine"; toIndex: number }
    | { kind: "session"; machineId: string; toIndex: number }
    | null
  >(null);
  // Track reload status per session: "success" | "error:message"
  const [reloadStatus, setReloadStatus] = useState<Map<string, string>>(new Map());
  // Collapsed machines: sessions hidden when machine is collapsed
  const [collapsedMachines, setCollapsedMachines] = useState<Set<string>>(new Set());
  const reloadTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!subscribeReloadResult) return;
    return subscribeReloadResult((msg) => {
      const key = `${msg.machineId}:${msg.sessionId}`;
      setReloadStatus((prev) => {
        const next = new Map(prev);
        next.set(key, msg.success ? "success" : `error:${msg.error ?? "Failed"}`);
        return next;
      });
      // Clear after 3 seconds
      const prev = reloadTimersRef.current.get(key);
      if (prev) clearTimeout(prev);
      reloadTimersRef.current.set(key, setTimeout(() => {
        reloadTimersRef.current.delete(key);
        setReloadStatus((prev) => {
          if (!prev.has(key)) return prev;
          const next = new Map(prev);
          next.delete(key);
          return next;
        });
      }, 3000));
    });
  }, [subscribeReloadResult]);
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
      <div style={{ flex: 1, overflowY: "auto" }} onClick={(e) => { if (e.target === e.currentTarget && onDeselect) onDeselect(); }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, fontFamily: "sans-serif", letterSpacing: "0.02em" }}>BLKCAT Monitor</h2>
          {themes && onThemeChange && (
            <span style={{ position: "relative" }}>
              <button
                onClick={() => setThemeOpen(!themeOpen)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 16,
                  padding: "2px 4px",
                  lineHeight: 1,
                  display: "flex",
                  alignItems: "center",
                }}
                title="Theme"
              >{"\u22EE"}</button>
              {themeOpen && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: 4,
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: 4,
                  zIndex: 50,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  minWidth: 140,
                }}>
                  {themes.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { onThemeChange(t.id); setThemeOpen(false); }}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "6px 8px",
                        background: currentTheme === t.id ? "var(--bg-tertiary)" : "transparent",
                        border: "none",
                        borderRadius: 4,
                        color: currentTheme === t.id ? "var(--text)" : "var(--text-muted)",
                        cursor: "pointer",
                        fontSize: 12,
                        textAlign: "left",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {currentTheme === t.id ? "\u2713 " : "  "}{t.label}
                    </button>
                  ))}
                </div>
              )}
            </span>
          )}
        </div>
        {onCollapse && (
          <button
            onClick={onCollapse}
            title="Hide sidebar"
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              lineHeight: 1,
              padding: "2px 4px",
            }}
          >
            <ChevronsLeft size={14} />
          </button>
        )}
      </div>
      {machines.length === 0 && (
        <p style={{ padding: 16, color: "var(--text-muted)" }}>No machines connected</p>
      )}
      {machines.map((machine, machineIndex) => (
        <div key={machine.machineId}>
          {dropIndicator?.kind === "machine" && dropIndicator.toIndex === machineIndex && (
            <div style={{ height: 2, background: "var(--accent)", margin: "0 8px" }} />
          )}
          <div
            className="sidebar-machine-row"
            draggable={!!onReorderMachine}
            onDragStart={(e) => {
              dragMachineRef.current = { index: machineIndex };
              dragSessionRef.current = null;
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", machine.machineId);
            }}
            onDragOver={(e) => {
              if (!dragMachineRef.current) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dropIndicator?.kind !== "machine" || dropIndicator.toIndex !== machineIndex) {
                setDropIndicator({ kind: "machine", toIndex: machineIndex });
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (!dragMachineRef.current) return;
              const from = dragMachineRef.current.index;
              dragMachineRef.current = null;
              setDropIndicator(null);
              if (from !== machineIndex) onReorderMachine?.(from, machineIndex);
            }}
            onDragEnd={() => {
              dragMachineRef.current = null;
              setDropIndicator(null);
            }}
            style={{
              padding: "8px 12px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text)",
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: selectedMachine === machine.machineId ? "rgba(88,166,255,0.06)" : "transparent",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span
              onClick={(e) => {
                e.stopPropagation();
                setCollapsedMachines((prev) => {
                  const next = new Set(prev);
                  if (next.has(machine.machineId)) next.delete(machine.machineId);
                  else next.add(machine.machineId);
                  return next;
                });
              }}
              style={{
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                flexShrink: 0,
                transition: "transform 0.15s",
                transform: collapsedMachines.has(machine.machineId) ? "rotate(-90deg)" : "rotate(0deg)",
              }}
            >
              <ChevronDown size={12} />
            </span>
            {machineIndex < 9 && (
              <span className="shortcut-badge shortcut-badge-machine">{machineIndex + 1}</span>
            )}
            {onReorderMachine && (
              <span className="drag-handle" style={{ lineHeight: 1, userSelect: "none", flexShrink: 0 }}>
                <GripDots size={10} />
              </span>
            )}
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--green)",
                display: "inline-block",
                flexShrink: 0,
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
                  lineHeight: 1,
                  padding: "2px 4px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Plus size={14} />
              </button>
            )}
          </div>
          {!collapsedMachines.has(machine.machineId) && machine.sessions.map((session, sessionIndex) => {
            const isSelected =
              selectedMachine === machine.machineId &&
              selectedSession === session.id;
            const isWaiting = waitingSessions?.has(`${machine.machineId}:${session.id}`);
            const isActive = activeSessions?.has(`${machine.machineId}:${session.id}`);
            const isDangerous = session.args?.includes("--dangerously-skip-permissions");
            return (
              <React.Fragment key={session.id}>
                {dropIndicator?.kind === "session" &&
                  dropIndicator.machineId === machine.machineId &&
                  dropIndicator.toIndex === sessionIndex && (
                  <div style={{ height: 2, background: "var(--accent)", margin: "0 8px 0 20px" }} />
                )}
              <div
                className="sidebar-session-row"
                draggable={!!onReorderSession}
                onDragStart={(e) => {
                  dragSessionRef.current = { machineId: machine.machineId, index: sessionIndex };
                  dragMachineRef.current = null;
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", session.id);
                }}
                onDragOver={(e) => {
                  if (!dragSessionRef.current) return;
                  if (dragSessionRef.current.machineId !== machine.machineId) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dropIndicator?.kind !== "session" || dropIndicator.machineId !== machine.machineId || dropIndicator.toIndex !== sessionIndex) {
                    setDropIndicator({ kind: "session", machineId: machine.machineId, toIndex: sessionIndex });
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!dragSessionRef.current) return;
                  if (dragSessionRef.current.machineId !== machine.machineId) return;
                  const from = dragSessionRef.current.index;
                  dragSessionRef.current = null;
                  setDropIndicator(null);
                  if (from !== sessionIndex) onReorderSession?.(machine.machineId, from, sessionIndex);
                }}
                onDragEnd={() => {
                  dragSessionRef.current = null;
                  setDropIndicator(null);
                }}
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
                    padding: "6px 4px 6px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "transparent",
                    border: "none",
                    color: isDangerous ? "var(--red)" : isSelected ? "var(--accent)" : "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: 13,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {sessionIndex < 9 && (
                    <span className="shortcut-badge shortcut-badge-session">{sessionIndex + 1}</span>
                  )}
                  {onReorderSession && (
                    <span className="drag-handle" style={{ lineHeight: 1, userSelect: "none", flexShrink: 0 }}>
                      <GripDots size={10} />
                    </span>
                  )}
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
                      {session.cliTool === "codex" && (
                        <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>
                          (codex)
                        </span>
                      )}
                      {session.cliTool === "gemini" && (
                        <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>
                          (gemini)
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
                      padding: "4px 8px",
                      lineHeight: 1,
                      opacity: 0.5,
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.5"; }}
                  >
                    <Settings size={12} />
                  </button>
                )}
                {onReloadSession && (() => {
                  const rKey = `${machine.machineId}:${session.id}`;
                  const status = reloadStatus.get(rKey);
                  if (status === "success") {
                    return (
                      <span style={{ padding: "4px 8px", color: "var(--green)" }} title="Reload succeeded">
                        <Check size={12} />
                      </span>
                    );
                  }
                  if (status?.startsWith("error:")) {
                    return (
                      <span style={{ padding: "4px 8px", color: "var(--red)" }} title={status.slice(6)}>
                        <X size={12} />
                      </span>
                    );
                  }
                  return (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setReloadTarget({ machineId: machine.machineId, session });
                      }}
                      title={`Reload session (${session.cliTool === "codex" ? "codex resume" : `${session.cliTool ?? "claude"} --resume`})`}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: "4px 8px",
                        lineHeight: 1,
                        opacity: 0.5,
                      }}
                      onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
                      onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.5"; }}
                    >
                      <RotateCw size={12} />
                    </button>
                  );
                })()}
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
                      padding: "4px 8px",
                      lineHeight: 1,
                      opacity: 0.5,
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; (e.target as HTMLElement).style.color = "var(--red)"; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.5"; (e.target as HTMLElement).style.color = "var(--text-muted)"; }}
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              </React.Fragment>
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
          onStart={(mid, args, cwd, name, cliTool) => {
            onStartSession(mid, args, cwd, name, cliTool);
            setModalMachineId(null);
          }}
          onClose={() => setModalMachineId(null)}
          listDirectory={listDirectory}
          createDirectory={createDirectory}
        />
      )}
      {reloadTarget && onReloadSession && (
        <ReloadSessionModal
          sessionName={getSessionName
            ? getSessionName(reloadTarget.machineId, reloadTarget.session.id, reloadTarget.session.name)
            : reloadTarget.session.name}
          currentArgs={reloadTarget.session.args}
          cliTool={reloadTarget.session.cliTool}
          onReload={(args, resume) => {
            onReloadSession(reloadTarget.machineId, reloadTarget.session.id, args, resume);
            setReloadTarget(null);
          }}
          onClose={() => setReloadTarget(null)}
        />
      )}
    </aside>
  );
}
