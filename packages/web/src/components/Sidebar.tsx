import React, { useState, useEffect, useRef } from "react";
import type { MachineSnapshot, OutboundAgentInfo, SessionInfo, CliTool, View } from "@blkcat/shared";
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
  onSwapPane?: (machineId: string, sessionId1: string, sessionId2: string) => void;
  onSwapWindow?: (machineId: string, sessionId1: string, sessionId2: string) => void;
  views?: View[];
  selectedView?: string;
  onSelectView?: (viewId: string) => void;
  onCreateView?: () => void;
  onDeleteView?: (viewId: string) => void;
  onRenameView?: (viewId: string, name: string) => void;
  onCreateViewFromDrag?: (s1: { machineId: string; sessionId: string }, s2: { machineId: string; sessionId: string }) => void;
  onAttachTerminal?: (machineId: string, terminalId: string, cliSessionId: string) => void;
  onDetachTerminal?: (machineId: string, terminalId: string) => void;
  onHideTerminal?: (machineId: string, sessionId: string) => void;
  onShowTerminal?: (machineId: string, sessionId: string) => void;
  attachedTerminals?: {
    getAttachedTo: (machineId: string, terminalId: string) => string | null;
    isAttached: (machineId: string, terminalId: string) => boolean;
    isHidden: (machineId: string, sessionId: string) => boolean;
  };
  getGroupName?: (machineId: string, cwdRoot: string, defaultName: string) => string;
  onRenameGroup?: (machineId: string, cwdRoot: string, name: string) => void;
  getOrderedGroups?: <T extends { cwdRoot: string }>(machineId: string, groups: T[]) => T[];
  onReorderCwdGroups?: (machineId: string, cwdRoots: string[]) => void;
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
  onSwapPane,
  onSwapWindow,
  views,
  selectedView,
  onSelectView,
  onCreateView,
  onDeleteView,
  onRenameView,
  onCreateViewFromDrag,
  onAttachTerminal,
  onDetachTerminal,
  onHideTerminal,
  onShowTerminal,
  attachedTerminals,
  getGroupName,
  onRenameGroup,
  getOrderedGroups,
  onReorderCwdGroups,
}: SidebarProps) {
  const [modalMachineId, setModalMachineId] = useState<string | null>(null);
  const [reloadTarget, setReloadTarget] = useState<{ machineId: string; session: SessionInfo } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [themeOpen, setThemeOpen] = useState(false);
  const [editValue, setEditValue] = useState("");
  // Drag-to-reorder state
  const dragRef = useRef<{ machineId: string; sessionId: string; windowId?: string; group: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ sessionId: string } | null>(null);
  // CWD group drag-to-reorder state
  const cwdDragRef = useRef<{ machineId: string; cwdRoot: string } | null>(null);
  const [cwdDropTarget, setCwdDropTarget] = useState<string | null>(null);
  // Terminal dropdown state
  const [terminalMenuOpen, setTerminalMenuOpen] = useState(false);
  // Track Shift key during drag for attach mode
  const dragShiftRef = useRef(false);
  // Track reload status per session: "success" | "error:message"
  const [reloadStatus, setReloadStatus] = useState<Map<string, string>>(new Map());
  // Collapsed machines: sessions hidden when machine is collapsed
  const [collapsedMachines, setCollapsedMachines] = useState<Set<string>>(new Set());
  // Collapsed CWD groups: keyed by "machineId:cwdRoot"
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  // Collapsed CLI sessions (hide attached terminals): keyed by "machineId:sessionId"
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set());
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
        {onToggleHideTmux && (() => {
          // Collect individually hidden (non-attached) terminals
          const hiddenItems: { machineId: string; terminalId: string; name: string }[] = [];
          for (const m of machines) {
            for (const s of m.sessions) {
              if (!s.cliTool && attachedTerminals?.isHidden(m.machineId, s.id)
                  && !(attachedTerminals?.isAttached(m.machineId, s.id))) {
                const name = getSessionName ? getSessionName(m.machineId, s.id, s.windowName ?? s.name) : (s.windowName ?? s.name);
                hiddenItems.push({ machineId: m.machineId, terminalId: s.id, name });
              }
            }
          }
          const hasHidden = hiddenItems.length > 0 || hideTmuxSessions;
          return (
            <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
              <button
                onClick={() => {
                  if (hasHidden) {
                    setTerminalMenuOpen((v) => !v);
                  } else {
                    onToggleHideTmux();
                  }
                }}
                title={hasHidden ? "Terminal options" : "Hide terminal sessions"}
                style={{
                  background: "none",
                  border: "none",
                  color: hasHidden ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 13,
                  lineHeight: 1,
                  padding: "2px 4px",
                  fontFamily: "monospace",
                }}
              >
                {">_"}
              </button>
              {terminalMenuOpen && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  right: 0,
                  marginTop: 4,
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: 4,
                  zIndex: 50,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
                  minWidth: 160,
                }}>
                  <button
                    onClick={() => { onToggleHideTmux(); setTerminalMenuOpen(false); }}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "6px 8px",
                      background: "transparent",
                      border: "none",
                      borderRadius: 4,
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: 12,
                      textAlign: "left",
                    }}
                  >
                    {hideTmuxSessions ? "Show all terminals" : "Hide all terminals"}
                  </button>
                  {hiddenItems.length > 0 && (
                    <>
                      <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
                      <div style={{ padding: "4px 8px", fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>
                        Hidden terminals
                      </div>
                      {hiddenItems.map((item) => (
                        <button
                          key={`${item.machineId}:${item.terminalId}`}
                          onClick={() => {
                            onShowTerminal?.(item.machineId, item.terminalId);
                            setTerminalMenuOpen(false);
                          }}
                          style={{
                            display: "flex",
                            width: "100%",
                            padding: "5px 8px",
                            background: "transparent",
                            border: "none",
                            borderRadius: 4,
                            color: "var(--text-muted)",
                            cursor: "pointer",
                            fontSize: 12,
                            textAlign: "left",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <span className="terminal-badge" style={{ fontSize: 8, minWidth: 16, height: 13, padding: "0 3px" }}>{">_"}</span>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                          <span style={{ marginLeft: "auto", fontSize: 10, opacity: 0.6 }}>show</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </span>
          );
        })()}
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
      {/* Views section */}
      {(views && views.length > 0 || onCreateView) && (
        <div style={{ borderBottom: "1px solid var(--border)" }}>
          <div style={{
            padding: "6px 12px",
            fontSize: 10,
            fontWeight: 600,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <span>Views</span>
            {onCreateView && (
              <button
                onClick={onCreateView}
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: "1px 3px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <Plus size={10} />
              </button>
            )}
          </div>
          {views?.map((view) => (
            <div
              key={view.id}
              className="sidebar-session-row"
              style={{
                display: "flex",
                alignItems: "center",
                background: selectedView === view.id ? "var(--bg-tertiary)" : "transparent",
                userSelect: "none",
              }}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes("application/x-blkcat-session")) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "copy";
                }
              }}
              onDrop={(e) => {
                const data = e.dataTransfer.getData("application/x-blkcat-session");
                if (!data) return;
                e.preventDefault();
                // Handled by parent via onAddPaneToView — but we don't have it here.
                // Instead, fire a custom event or handle inline:
                const { machineId: mid, sessionId: sid } = JSON.parse(data);
                const alreadyExists = view.panes.some((p) => p.machineId === mid && p.sessionId === sid);
                if (!alreadyExists && onRenameView) {
                  // Use updateView pattern — we need onUpdateView. For now, cheat: rename triggers update.
                  // Actually let's just emit via a dedicated mechanism. We'll handle this in App.tsx.
                }
              }}
            >
              <button
                onClick={() => onSelectView?.(view.id)}
                style={{
                  flex: 1,
                  textAlign: "left",
                  padding: "6px 4px 6px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "transparent",
                  border: "none",
                  color: selectedView === view.id ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 13,
                  overflow: "hidden",
                }}
              >
                <span style={{ fontSize: 10, flexShrink: 0 }}>{"\u25A3"}</span>
                {editingId === `view:${view.id}` ? (
                  <input
                    autoFocus
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => {
                      const trimmed = editValue.trim();
                      if (trimmed && trimmed !== view.name) onRenameView?.(view.id, trimmed);
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const trimmed = editValue.trim();
                        if (trimmed) onRenameView?.(view.id, trimmed);
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
                      outline: "none",
                    }}
                  />
                ) : (
                  <span
                    style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    onDoubleClick={(e) => {
                      if (!onRenameView) return;
                      e.stopPropagation();
                      setEditingId(`view:${view.id}`);
                      setEditValue(view.name);
                    }}
                    title="Double-click to rename"
                  >
                    {view.name}
                  </span>
                )}
                <span style={{ color: "var(--text-muted)", fontSize: 11, flexShrink: 0 }}>
                  {view.panes.length}
                </span>
              </button>
              {onDeleteView && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this view?")) onDeleteView(view.id);
                  }}
                  title="Delete view"
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
          ))}
        </div>
      )}
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
            // ── CWD-based grouping ──────────────────────────────────────
            interface CwdGroup {
              cwdRoot: string;
              sessions: SessionInfo[];
            }

            function shortenPath(p: string): string {
              return p.replace(/^\/home\/[^/]+/, "~").replace(/^\/root/, "~");
            }

            function buildCwdGroups(sessions: SessionInfo[]): { groups: CwdGroup[]; ungrouped: SessionInfo[] } {
              // 1. Collect anchor roots from CLI sessions
              const anchorSet = new Set<string>();
              for (const s of sessions) {
                if (s.cliTool && s.cwd) anchorSet.add(s.cwd);
              }
              // 2. Sort shortest-first; merge subdirectory anchors into parent
              let anchors = [...anchorSet].sort((a, b) => a.length - b.length);
              const merged: string[] = [];
              for (const a of anchors) {
                const parent = merged.find((m) => a === m || a.startsWith(m + "/"));
                if (!parent) merged.push(a);
              }
              anchors = merged;

              // 3. Assign each session to best matching anchor (longest match)
              const groupMap = new Map<string, SessionInfo[]>();
              for (const a of anchors) groupMap.set(a, []);
              const ungrouped: SessionInfo[] = [];

              for (const s of sessions) {
                if (!s.cwd) {
                  ungrouped.push(s);
                  continue;
                }
                let bestAnchor: string | null = null;
                for (const a of anchors) {
                  if (s.cwd === a || s.cwd.startsWith(a + "/")) {
                    if (!bestAnchor || a.length > bestAnchor.length) bestAnchor = a;
                  }
                }
                if (bestAnchor) {
                  groupMap.get(bestAnchor)!.push(s);
                } else {
                  ungrouped.push(s);
                }
              }

              const groups: CwdGroup[] = anchors
                .map((a) => ({ cwdRoot: a, sessions: groupMap.get(a)! }))
                .filter((g) => g.sessions.length > 0);
              return { groups, ungrouped };
            }

            const { groups: cwdGroups, ungrouped } = buildCwdGroups(machine.sessions);

            // Filter out attached terminals — they render under their parent CLI session.
            // Only non-CLI terminals can be attached. Also require parent CLI to still exist
            // (stale attachments after tmux swaps show normally).
            const isSessionAttached = (s: SessionInfo) => {
              if (s.cliTool) return false; // CLI sessions are never attached
              if (!attachedTerminals?.isAttached(machine.machineId, s.id)) return false;
              const parentId = attachedTerminals.getAttachedTo(machine.machineId, s.id);
              if (!parentId) return false;
              // Parent must exist AND be a CLI session (guards against stale IDs after swaps)
              const parent = machine.sessions.find((p) => p.id === parentId);
              return !!parent?.cliTool;
            };
            // Filter out individually hidden terminals
            const isSessionHidden = (s: SessionInfo) =>
              !s.cliTool && (attachedTerminals?.isHidden(machine.machineId, s.id) ?? false);
            const filterSessions = (sessions: SessionInfo[]) =>
              sessions.filter((s) => !isSessionAttached(s) && !isSessionHidden(s));

            // When hideTmuxSessions, filter terminals out of groups and hide empty groups
            const visibleGroups = (hideTmuxSessions
              ? cwdGroups
                  .map((g) => ({ ...g, sessions: g.sessions.filter((s) => !!s.cliTool) }))
                  .filter((g) => g.sessions.length > 0)
              : cwdGroups
            ).map((g) => ({ ...g, sessions: filterSessions(g.sessions) }))
              .filter((g) => g.sessions.length > 0);
            const visibleUngrouped = filterSessions(
              hideTmuxSessions
                ? ungrouped.filter((s) => !!s.cliTool)
                : ungrouped,
            );

            function renderSession(session: SessionInfo, group: string, collapse?: { collapsed: boolean; onToggle: () => void }) {
              const isSelected =
                selectedMachine === machine.machineId &&
                selectedSession === session.id;
              const isWaiting = waitingSessions?.has(`${machine.machineId}:${session.id}`);
              const isActive = activeSessions?.has(`${machine.machineId}:${session.id}`);
              const isDangerous = session.args?.includes("--dangerously-skip-permissions");
              const isCli = !!session.cliTool;
              const isDropTarget = dropTarget?.sessionId === session.id;
              return (
                <div
                  key={session.id}
                  className={`sidebar-session-row${isSelected ? " selected" : ""}${isDropTarget ? " drop-center" : ""}`}
                  draggable
                  onDragStart={(e) => {
                    e.stopPropagation();
                    dragRef.current = { machineId: machine.machineId, sessionId: session.id, windowId: session.windowId, group };
                    e.dataTransfer.effectAllowed = "copyMove";
                    e.dataTransfer.setData("text/plain", session.id);
                    e.dataTransfer.setData("application/x-blkcat-session", JSON.stringify({ machineId: machine.machineId, sessionId: session.id }));
                  }}
                  onDragOver={(e) => {
                    const src = dragRef.current;
                    if (!src || src.sessionId === session.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    dragShiftRef.current = e.shiftKey;
                    if (dropTarget?.sessionId !== session.id) setDropTarget({ sessionId: session.id });
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      if (dropTarget?.sessionId === session.id) setDropTarget(null);
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDropTarget(null);
                    const src = dragRef.current;
                    if (!src || src.sessionId === session.id) return;
                    dragRef.current = null;
                    // Shift + terminal → CLI = attach under that CLI
                    // Everything else = create split View
                    const hasShift = dragShiftRef.current || e.shiftKey;
                    const srcSession = machine.sessions.find((s) => s.id === src.sessionId);
                    const srcIsCli = !!srcSession?.cliTool;
                    const tgtIsCli = !!session.cliTool;
                    if (hasShift && !srcIsCli && tgtIsCli && onAttachTerminal) {
                      onAttachTerminal(machine.machineId, src.sessionId, session.id);
                    } else if (onCreateViewFromDrag) {
                      onCreateViewFromDrag(
                        { machineId: src.machineId, sessionId: src.sessionId },
                        { machineId: machine.machineId, sessionId: session.id },
                      );
                    }
                  }}
                  onDragEnd={() => {
                    dragRef.current = null;
                    dragShiftRef.current = false;
                    setDropTarget(null);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    background: isSelected ? "var(--bg-tertiary)" : "transparent",
                    userSelect: "none",
                  }}
                >
                  <span
                    style={{
                      width: 14,
                      flexShrink: 0,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginLeft: 30,
                    }}
                  >
                    {collapse ? (
                      <span
                        onClick={(e) => { e.stopPropagation(); collapse.onToggle(); }}
                        style={{
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          transition: "transform 0.15s",
                          transform: collapse.collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                          color: "var(--text-muted)",
                          opacity: 0.5,
                        }}
                      >
                        <ChevronDown size={10} />
                      </span>
                    ) : null}
                  </span>
                  <button
                    onClick={() => onSelectSession(machine.machineId, session.id)}
                    data-testid={`session-${session.id}`}
                    style={{
                      flex: 1,
                      textAlign: "left",
                      padding: "6px 4px 6px 2px",
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
                    {isCli ? (
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
                    ) : (
                      <span className="terminal-badge">{">_"}</span>
                    )}
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
                  <div className="session-actions">
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
                  {!isCli && onHideTerminal && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onHideTerminal(machine.machineId, session.id);
                      }}
                      title="Hide terminal"
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: "4px 6px",
                        lineHeight: 1,
                        opacity: 0.5,
                        fontSize: 12,
                      }}
                      onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
                      onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.5"; }}
                    >
                      {"\u2212"}
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
                </div>
              );
            }

            // ── Render attached terminals under a CLI session ─────────
            function renderAttachedTerminals(cliSessionId: string) {
              if (!attachedTerminals) return null;
              const attached = machine.sessions.filter((s) => {
                const parentId = attachedTerminals.getAttachedTo(machine.machineId, s.id);
                return parentId === cliSessionId && !attachedTerminals.isHidden(machine.machineId, s.id);
              });
              if (attached.length === 0) return null;
              const canDragAttached = !!(onSwapPane || onSwapWindow);
              return attached.map((term) => (
                <div
                  key={`attached-${term.id}`}
                  draggable={canDragAttached}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    dragRef.current = { machineId: machine.machineId, sessionId: term.id, windowId: term.windowId, group: cliSessionId };
                    e.dataTransfer.effectAllowed = "copyMove";
                    e.dataTransfer.setData("text/plain", term.id);
                    e.dataTransfer.setData("application/x-blkcat-session", JSON.stringify({ machineId: machine.machineId, sessionId: term.id }));
                  }}
                  onDragEnd={() => {
                    // If dragRef is still set, no drop target accepted → detach
                    if (dragRef.current && onDetachTerminal) {
                      onDetachTerminal(machine.machineId, term.id);
                    }
                    dragRef.current = null;
                    setDropTarget(null);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 44,
                    fontSize: 12,
                    color: "var(--text-muted)",
                    userSelect: "none",
                  }}
                >
                  <button
                    onClick={() => onSelectSession(machine.machineId, term.id)}
                    data-testid={`attached-${term.id}`}
                    style={{
                      flex: 1,
                      textAlign: "left",
                      padding: "3px 4px",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      background: "transparent",
                      border: "none",
                      color: selectedSession === term.id ? "var(--accent)" : "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: 12,
                      overflow: "hidden",
                    }}
                  >
                    <span className="terminal-badge" style={{ fontSize: 8, minWidth: 16, height: 13, padding: "0 3px" }}>{">_"}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {getSessionName ? getSessionName(machine.machineId, term.id, term.windowName ?? term.name) : (term.windowName ?? term.name)}
                    </span>
                  </button>
                  {onHideTerminal && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onHideTerminal(machine.machineId, term.id); }}
                      title="Hide"
                      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px 4px", opacity: 0.5, fontSize: 10 }}
                    >
                      {"\u2212"}
                    </button>
                  )}
                  {onDetachTerminal && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDetachTerminal(machine.machineId, term.id); }}
                      title="Detach"
                      style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: "2px 4px", opacity: 0.5 }}
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              ));
            }

            // Check if a CLI session has any visible attached terminals
            function hasAttachedTerminals(cliSessionId: string): boolean {
              if (!attachedTerminals) return false;
              return machine.sessions.some((s) => {
                const parentId = attachedTerminals.getAttachedTo(machine.machineId, s.id);
                return parentId === cliSessionId && !attachedTerminals.isHidden(machine.machineId, s.id);
              });
            }

            // ── Render CWD groups + ungrouped ──────────────────────────
            function renderCwdGroupSessions(sessions: SessionInfo[], cwdRoot: string) {
              return sessions.map((s) => {
                const sessionKey = `${machine.machineId}:${s.id}`;
                const hasAttached = s.cliTool && hasAttachedTerminals(s.id);
                const isSessionCollapsed = collapsedSessions.has(sessionKey);
                const collapseProps = hasAttached ? {
                  collapsed: isSessionCollapsed,
                  onToggle: () => setCollapsedSessions((prev) => {
                    const next = new Set(prev);
                    if (next.has(sessionKey)) next.delete(sessionKey);
                    else next.add(sessionKey);
                    return next;
                  }),
                } : undefined;
                return (
                  <React.Fragment key={s.id}>
                    {renderSession(s, cwdRoot, collapseProps)}
                    {hasAttached && !isSessionCollapsed && renderAttachedTerminals(s.id)}
                  </React.Fragment>
                );
              });
            }

            // Apply saved CWD group order
            const orderedGroups = getOrderedGroups
              ? getOrderedGroups(machine.machineId, visibleGroups)
              : visibleGroups;

            return (
              <>
                {orderedGroups.map((cwdGroup) => {
                  const groupKey = `${machine.machineId}:${cwdGroup.cwdRoot}`;
                  const isCollapsed = collapsedGroups.has(groupKey);
                  const defaultLabel = shortenPath(cwdGroup.cwdRoot);
                  const label = getGroupName
                    ? getGroupName(machine.machineId, cwdGroup.cwdRoot, defaultLabel)
                    : defaultLabel;

                  const isCwdDropTarget = cwdDropTarget === cwdGroup.cwdRoot;
                  return (
                    <div key={cwdGroup.cwdRoot} data-testid={`cwd-group-${cwdGroup.cwdRoot}`}>
                      <div
                        className="sidebar-section-header section-cwd"
                        draggable={!!onReorderCwdGroups}
                        onDragStart={(e) => {
                          e.stopPropagation();
                          cwdDragRef.current = { machineId: machine.machineId, cwdRoot: cwdGroup.cwdRoot };
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("application/x-blkcat-cwdgroup", cwdGroup.cwdRoot);
                        }}
                        onDragOver={(e) => {
                          const src = cwdDragRef.current;
                          if (!src || src.machineId !== machine.machineId || src.cwdRoot === cwdGroup.cwdRoot) return;
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          if (cwdDropTarget !== cwdGroup.cwdRoot) setCwdDropTarget(cwdGroup.cwdRoot);
                        }}
                        onDragLeave={(e) => {
                          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                            if (cwdDropTarget === cwdGroup.cwdRoot) setCwdDropTarget(null);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          setCwdDropTarget(null);
                          const src = cwdDragRef.current;
                          if (!src || src.machineId !== machine.machineId || src.cwdRoot === cwdGroup.cwdRoot) return;
                          cwdDragRef.current = null;
                          // Compute new order: move src before target
                          const roots = orderedGroups.map((g) => g.cwdRoot);
                          const srcIdx = roots.indexOf(src.cwdRoot);
                          const tgtIdx = roots.indexOf(cwdGroup.cwdRoot);
                          if (srcIdx >= 0) roots.splice(srcIdx, 1);
                          const insertAt = roots.indexOf(cwdGroup.cwdRoot);
                          roots.splice(insertAt >= 0 ? insertAt : tgtIdx, 0, src.cwdRoot);
                          onReorderCwdGroups?.(machine.machineId, roots);
                        }}
                        onDragEnd={() => {
                          cwdDragRef.current = null;
                          setCwdDropTarget(null);
                        }}
                        onClick={() => {
                          setCollapsedGroups((prev) => {
                            const next = new Set(prev);
                            if (next.has(groupKey)) next.delete(groupKey);
                            else next.add(groupKey);
                            return next;
                          });
                        }}
                        style={isCwdDropTarget ? { borderTop: "2px solid var(--accent)" } : undefined}
                      >
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            flexShrink: 0,
                            transition: "transform 0.15s",
                            transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                          }}
                        >
                          <ChevronDown size={10} />
                        </span>
                        {editingId === `cwdgroup:${groupKey}` ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={() => {
                              const trimmed = editValue.trim();
                              if (trimmed && trimmed !== label) {
                                onRenameGroup?.(machine.machineId, cwdGroup.cwdRoot, trimmed);
                              }
                              setEditingId(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const trimmed = editValue.trim();
                                if (trimmed) onRenameGroup?.(machine.machineId, cwdGroup.cwdRoot, trimmed);
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
                              fontSize: 11,
                              fontWeight: 600,
                              outline: "none",
                            }}
                          />
                        ) : (
                          <span
                            style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            onDoubleClick={(e) => {
                              if (!onRenameGroup) return;
                              e.stopPropagation();
                              setEditingId(`cwdgroup:${groupKey}`);
                              setEditValue(label);
                            }}
                            title={`${cwdGroup.cwdRoot}\nDouble-click to rename`}
                          >
                            {label}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: "var(--text-muted)", flexShrink: 0 }}>
                          {cwdGroup.sessions.length}
                        </span>
                      </div>
                      {!isCollapsed && renderCwdGroupSessions(cwdGroup.sessions, cwdGroup.cwdRoot)}
                    </div>
                  );
                })}
                {visibleUngrouped.length > 0 && (
                  <>
                    {visibleGroups.length > 0 && (
                      <div style={{ height: 1, background: "var(--border)", margin: "4px 16px 0", opacity: 0.5 }} />
                    )}
                    {visibleGroups.length > 0 && (
                      <div className="sidebar-section-header section-terminals">
                        <span style={{ fontSize: 11, fontFamily: "monospace" }}>{">_"}</span>
                        Terminals
                      </div>
                    )}
                    {renderCwdGroupSessions(visibleUngrouped, "ungrouped")}
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
