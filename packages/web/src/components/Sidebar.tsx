import React, { useState, useEffect, useRef } from "react";
import type { MachineSnapshot, OutboundAgentInfo, SessionInfo, CliTool } from "@blkcat/shared";
import { AgentManager } from "./AgentManager";
import { StartSessionModal } from "./StartSessionModal";
import { ReloadSessionModal } from "./ReloadSessionModal";
import { ChevronsLeft, ChevronDown, Settings, Check, X, RotateCw, Plus } from "./Icons";

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
  className?: string;
  currentTheme?: string;
  onThemeChange?: (id: string) => void;
  themes?: { id: string; label: string; accent: string; bg: string }[];
  hideTmuxSessions?: boolean;
  onToggleHideTmux?: () => void;
  selectedGroup?: string;
  onSelectGroup?: (machineId: string, windowId: string) => void;
  onJoinPane?: (machineId: string, sourceSessionId: string, targetSessionId: string) => void;
  onBreakPane?: (machineId: string, sessionId: string) => void;
  onSwapPane?: (machineId: string, sessionId1: string, sessionId2: string) => void;
  onSwapWindow?: (machineId: string, sessionId1: string, sessionId2: string) => void;
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
  className,
  currentTheme,
  onThemeChange,
  themes,
  hideTmuxSessions,
  onToggleHideTmux,
  selectedGroup,
  onSelectGroup,
  onJoinPane,
  onBreakPane,
  onSwapPane,
  onSwapWindow,
}: SidebarProps) {
  const [modalMachineId, setModalMachineId] = useState<string | null>(null);
  const [reloadTarget, setReloadTarget] = useState<{ machineId: string; session: SessionInfo } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [editValue, setEditValue] = useState("");
  // Drag-to-reorder state
  const dragRef = useRef<{ machineId: string; sessionId: string; windowId?: string; group: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ sessionId: string } | null>(null);
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
      <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <h2
            onClick={() => onDeselect?.()}
            style={{ fontSize: 14, fontWeight: 600, fontFamily: "sans-serif", letterSpacing: "0.02em", cursor: "pointer" }}
          >BLKCAT Monitor</h2>
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
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        {onToggleHideTmux && (
          <button
            onClick={onToggleHideTmux}
            title={hideTmuxSessions ? "Show terminal sessions" : "Hide terminal sessions"}
            style={{
              background: "none",
              border: "none",
              color: hideTmuxSessions ? "var(--accent)" : "var(--text-muted)",
              cursor: "pointer",
              fontSize: 13,
              lineHeight: 1,
              padding: "2px 4px",
              fontFamily: "monospace",
            }}
          >
            {hideTmuxSessions ? ">_" : ">_"}
          </button>
        )}
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
      </div>
      {machines.length === 0 && (
        <p style={{ padding: 16, color: "var(--text-muted)" }}>No machines connected</p>
      )}
      {machines.map((machine, machineIndex) => (
        <div key={machine.machineId}>
          <div
            className="sidebar-machine-row"
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
          {!collapsedMachines.has(machine.machineId) && (() => {
            const cliSessions = machine.sessions.filter((s) => !!s.cliTool);
            const tmuxSessions = machine.sessions.filter((s) => !s.cliTool);
            const showGroupLabels = cliSessions.length > 0 && tmuxSessions.length > 0;

            function renderSession(session: SessionInfo, sessionIndex: number, group: "cli" | "terminal" | string) {
              const isSelected =
                selectedMachine === machine.machineId &&
                selectedSession === session.id;
              const isWaiting = waitingSessions?.has(`${machine.machineId}:${session.id}`);
              const isActive = activeSessions?.has(`${machine.machineId}:${session.id}`);
              const isDangerous = session.args?.includes("--dangerously-skip-permissions");
              const isCli = !!session.cliTool;
              const canDrag = !!(onSwapPane || onSwapWindow);
              const isDropTarget = dropTarget?.sessionId === session.id;
              return (
                <div
                  key={session.id}
                  className="sidebar-session-row"
                  draggable={canDrag}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    dragRef.current = { machineId: machine.machineId, sessionId: session.id, windowId: session.windowId, group };
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", session.id);
                  }}
                  onDragEnter={(e) => {
                    const src = dragRef.current;
                    if (!src || src.machineId !== machine.machineId || src.group !== group || src.sessionId === session.id) return;
                    e.preventDefault();
                  }}
                  onDragOver={(e) => {
                    const src = dragRef.current;
                    if (!src || src.machineId !== machine.machineId || src.group !== group || src.sessionId === session.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dropTarget?.sessionId !== session.id) setDropTarget({ sessionId: session.id });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropTarget(null);
                    const src = dragRef.current;
                    if (!src || src.machineId !== machine.machineId || src.group !== group || src.sessionId === session.id) return;
                    dragRef.current = null;
                    if (src.windowId === session.windowId) {
                      // Same window → swap panes
                      onSwapPane?.(machine.machineId, src.sessionId, session.id);
                    } else {
                      // Different windows → swap windows
                      onSwapWindow?.(machine.machineId, src.sessionId, session.id);
                    }
                  }}
                  onDragEnd={() => {
                    dragRef.current = null;
                    setDropTarget(null);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: isDropTarget ? "rgba(88,166,255,0.15)" : isSelected ? "var(--bg-tertiary)" : "transparent",
                    outline: isDropTarget ? "1px solid var(--accent)" : "none",
                    outlineOffset: "-1px",
                    borderRadius: isDropTarget ? 4 : 0,
                    userSelect: "none",
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
                            ? getSessionName(machine.machineId, session.id, session.windowName ?? session.name)
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
                            getSessionName ? getSessionName(machine.machineId, session.id, session.windowName ?? session.name) : (session.windowName ?? session.name),
                          );
                        }}
                        title="Double-click to rename"
                      >
                        {getSessionName ? getSessionName(machine.machineId, session.id, session.windowName ?? session.name) : (session.windowName ?? session.name)}
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
                  {isCli && onSessionSettings && (
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
                  {isCli && onReloadSession && (() => {
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
              );
            }

            interface WindowGroup { windowId: string; windowName?: string; panes: SessionInfo[] }
            function buildWindowGroups(sessions: SessionInfo[]): WindowGroup[] {
              const groups: WindowGroup[] = [];
              const windowMap = new Map<string, WindowGroup>();
              for (const session of sessions) {
                const wid = session.windowId;
                if (!wid) {
                  groups.push({ windowId: session.id, panes: [session] });
                  continue;
                }
                let group = windowMap.get(wid);
                if (!group) {
                  group = { windowId: wid, windowName: session.windowName, panes: [] };
                  windowMap.set(wid, group);
                  groups.push(group);
                }
                group.panes.push(session);
              }
              return groups;
            }

            function renderGroup(group: WindowGroup, defaultGroup: string) {
              if (group.panes.length === 1) {
                const idx = machine.sessions.indexOf(group.panes[0]);
                return renderSession(group.panes[0], idx, defaultGroup);
              }
              const isGroupSelected = selectedGroup === group.windowId && selectedMachine === machine.machineId;
              return (
                <div key={group.windowId}>
                  <div
                    onClick={() => onSelectGroup?.(machine.machineId, group.windowId)}
                    style={{
                      padding: "4px 16px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: isGroupSelected ? "var(--accent)" : "var(--text-muted)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      background: isGroupSelected ? "var(--bg-tertiary)" : "transparent",
                    }}
                  >
                    <span style={{ fontSize: 10 }}>{"\u25E8"}</span>
                    {editingId === `group:${group.windowId}` ? (
                      <input
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => {
                          const trimmed = editValue.trim();
                          if (trimmed && trimmed !== (group.windowName || group.windowId)) {
                            onRenameSession?.(machine.machineId, group.panes[0].id, trimmed);
                          }
                          setEditingId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const trimmed = editValue.trim();
                            if (trimmed) onRenameSession?.(machine.machineId, group.panes[0].id, trimmed);
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
                          fontSize: 12,
                          fontWeight: 600,
                          outline: "none",
                        }}
                      />
                    ) : (
                    <span
                      style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                      onDoubleClick={(e) => {
                        if (!onRenameSession) return;
                        e.stopPropagation();
                        setEditingId(`group:${group.windowId}`);
                        setEditValue(group.windowName || group.windowId);
                      }}
                      title="Double-click to rename"
                    >
                      {group.windowName || group.windowId}
                    </span>
                    )}
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                      {group.panes.length}
                    </span>
                  </div>
                  {group.panes.map((pane) => {
                    const idx = machine.sessions.indexOf(pane);
                    const groupedPane = { ...pane, windowName: pane.paneCommand ?? pane.windowName };
                    return (
                      <div key={pane.id} style={{ paddingLeft: 12 }}>
                        {renderSession(groupedPane, idx, group.windowId)}
                      </div>
                    );
                  })}
                </div>
              );
            }

            const cliGroups = buildWindowGroups(cliSessions);
            const terminalGroups = buildWindowGroups(tmuxSessions);

            return (
              <>
                {showGroupLabels && cliSessions.length > 0 && (
                  <div style={{ padding: "4px 16px 2px", fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Vibe Coding
                  </div>
                )}
                {cliGroups.map((g) => renderGroup(g, "cli"))}
                {!hideTmuxSessions && terminalGroups.length > 0 && (
                  <>
                    {showGroupLabels && (
                      <div style={{ padding: "4px 16px 2px", fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        Terminals
                      </div>
                    )}
                    {terminalGroups.map((g) => renderGroup(g, "terminal"))}
                  </>
                )}
              </>
            );
          })()}
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
            ? getSessionName(reloadTarget.machineId, reloadTarget.session.id, reloadTarget.session.windowName ?? reloadTarget.session.name)
            : (reloadTarget.session.windowName ?? reloadTarget.session.name)}
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
