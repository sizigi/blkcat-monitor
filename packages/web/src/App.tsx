import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import type { CliTool } from "@blkcat/shared";
import { useSocket } from "./hooks/useSocket";
import { useSessionOutput } from "./hooks/useSessionOutput";
import { useAgents } from "./hooks/useAgents";
import { useDisplayNames } from "./hooks/useDisplayNames";
import { useGroupNames } from "./hooks/useGroupNames";
import { useIsMobile } from "./hooks/useIsMobile";
import { useTheme } from "./hooks/useTheme";
import { Sidebar } from "./components/Sidebar";
import { SessionDetail } from "./components/SessionDetail";
import { CrossMachineSplitView } from "./components/CrossMachineSplitView";
import { CreateViewModal } from "./components/CreateViewModal";
import { StartSessionModal } from "./components/StartSessionModal";
import { EventFeed } from "./components/EventFeed";
import { NotificationList } from "./components/NotificationList";
import { SkillsMatrix } from "./components/SkillsMatrix";
import { HealthPanel } from "./components/HealthPanel";
import { ProjectSettingsModal } from "./components/ProjectSettingsModal";
import { PWAPrompt } from "./components/PWAPrompt";
import { useHealth } from "./hooks/useHealth";
import { useAttachedTerminals } from "./hooks/useAttachedTerminals";
import { useCwdGroupOrder } from "./hooks/useCwdGroupOrder";
import { useMachineOrder } from "./hooks/useMachineOrder";
import { Menu, Pencil, ClipboardList, Bell, Settings, Activity, Plug } from "./components/Icons";
import { AgentManager } from "./components/AgentManager";

const WS_URL =
  (import.meta as any).env?.VITE_WS_URL ??
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/dashboard`;

const DEFAULT_SIDEBAR_WIDTH = 250;
const MIN_SIDEBAR_WIDTH = 160;
const MAX_SIDEBAR_WIDTH = 500;

export default function App() {
  const { connected, machines, views, waitingSessions, activeSessions, outputMapRef, logMapRef, scrollbackMapRef, subscribeOutput, subscribeScrollback, sendInput, startSession, closeSession, reloadSession, sendResize, requestScrollback, hookEventsRef, subscribeHookEvents, notificationCounts, clearNotifications, listDirectory, createDirectory, deploySkills, removeSkills, getSettings, updateSettings, subscribeDeployResult, subscribeSettingsSnapshot, subscribeSettingsResult, setDisplayName, subscribeDisplayNames, subscribeReloadResult, swapPane, swapWindow, movePane, moveWindow, rediscover, createView, updateView, deleteView } = useSocket(WS_URL);
  const { agents, addAgent, removeAgent } = useAgents();
  const { getMachineName, getSessionName, setMachineName, setSessionName } = useDisplayNames({
    sendDisplayName: setDisplayName,
    subscribeDisplayNames,
  });
  const { getGroupName, setGroupName } = useGroupNames();
  const { theme, setTheme, themes } = useTheme();
  const attachedTerminals = useAttachedTerminals();
  const { getOrderedGroups, setGroupOrder } = useCwdGroupOrder();
  const { getOrderedMachines, setMachineOrder } = useMachineOrder();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Reset mobile-specific state and force terminal refit on mode transition
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
    // After layout settles, dispatch resize to trigger terminal refit.
    // Fire twice: once after initial layout and again after animations complete,
    // to catch cases where the container dimensions haven't fully settled.
    const timer1 = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 150);
    const timer2 = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 500);
    return () => { clearTimeout(timer1); clearTimeout(timer2); };
  }, [isMobile]);

  // Mobile: swipe from left edge to open sidebar, swipe left to close
  useEffect(() => {
    if (!isMobile) return;
    const EDGE_WIDTH = 24;
    const SWIPE_THRESHOLD = 60;
    let startX = 0;
    let startY = 0;
    let edgeSwipe = false;

    function onTouchStart(e: TouchEvent) {
      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      edgeSwipe = touch.clientX < EDGE_WIDTH;
    }
    function onTouchEnd(e: TouchEvent) {
      const touch = e.changedTouches[0];
      const dx = touch.clientX - startX;
      const dy = Math.abs(touch.clientY - startY);
      // Only count horizontal swipes (dx > dy)
      if (dy > Math.abs(dx)) return;
      if (edgeSwipe && dx > SWIPE_THRESHOLD) {
        setDrawerOpen(true);
      } else if (dx < -SWIPE_THRESHOLD) {
        setDrawerOpen(false);
      }
    }
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [isMobile]);

  // Re-send terminal dimensions when WebSocket (re)connects — handles the race
  // where the initial fit.fit() fires before the socket is open.
  useEffect(() => {
    if (!connected) return;
    const timer = setTimeout(() => window.dispatchEvent(new Event("resize")), 300);
    return () => clearTimeout(timer);
  }, [connected]);
  const [selectedMachine, setSelectedMachine] = useState<string>();
  const [selectedSession, setSelectedSession] = useState<string>();
  const [selectedView, setSelectedView] = useState<string>();
  const [showCreateViewModal, setShowCreateViewModal] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [panelTab, setPanelTab] = useState<"events" | "notifications" | "skills" | "health" | "agents" | null>(null);
  const health = useHealth(panelTab === "health");
  const [settingsSession, setSettingsSession] = useState<{ machineId: string; sessionId: string } | null>(null);
  const [newSessionModal, setNewSessionModal] = useState<{ machineId: string; cwd?: string } | null>(null);
  const [editingTopbarName, setEditingTopbarName] = useState(false);
  const [topbarEditValue, setTopbarEditValue] = useState("");
  const navBarRef = useRef<HTMLDivElement>(null);
  const [hideTmuxSessions, setHideTmuxSessions] = useState(() => {
    try { return localStorage.getItem("blkcat:hideTmux") === "true"; } catch { return false; }
  });
  const toggleHideTmux = useCallback(() => {
    setHideTmuxSessions((prev) => {
      const next = !prev;
      try { localStorage.setItem("blkcat:hideTmux", String(next)); } catch {}
      return next;
    });
  }, []);
  const resizing = useRef(false);
  // Refs for values used in stable effects (avoids re-registering document listeners)
  const selectedMachineRef = useRef(selectedMachine);
  selectedMachineRef.current = selectedMachine;
  const selectedSessionRef = useRef(selectedSession);
  selectedSessionRef.current = selectedSession;

  const viewsRef = useRef(views);
  viewsRef.current = views;
  const selectedViewRef = useRef(selectedView);
  selectedViewRef.current = selectedView;
  const newSessionModalRef = useRef(newSessionModal);
  newSessionModalRef.current = newSessionModal;
  const getOrderedMachinesRef = useRef(getOrderedMachines);
  getOrderedMachinesRef.current = getOrderedMachines;

  const cyclePaneRef = useRef<((delta: number) => void) | undefined>();

  const sessionOutput = useSessionOutput(outputMapRef, subscribeOutput, selectedMachine, selectedSession);

  const machinesRef = useRef(machines);
  machinesRef.current = machines;

  // Navigation mode: backtick (`) as leader key, works in xterm and input fields.
  // Uses refs so the keydown listener registers once and never re-attaches.
  const navModeRef = useRef(false);
  useEffect(() => {
    function setNav(v: boolean) {
      navModeRef.current = v;
      if (navBarRef.current) navBarRef.current.style.display = v ? "flex" : "none";
    }

    function selectMachine(idx: number) {
      const ordered = getOrderedMachinesRef.current(machinesRef.current);
      const machine = ordered[idx];
      if (!machine) return;
      setSelectedMachine(machine.machineId);
      setSelectedView(undefined);
      if (machine.sessions.length > 0) {
        setSelectedSession(machine.sessions[0].id);
        clearNotifications(`${machine.machineId}:${machine.sessions[0].id}`);
      }
    }
    function cycleMachine(delta: number) {
      const ordered = getOrderedMachinesRef.current(machinesRef.current);
      const idx = ordered.findIndex((m) => m.machineId === selectedMachineRef.current);
      const next = (idx + delta + ordered.length) % ordered.length;
      selectMachine(next);
    }
    function selectSession(idx: number) {
      let mid = selectedMachineRef.current;
      // If in a view, derive machine from the view's first pane
      if (!mid && selectedViewRef.current) {
        const view = viewsRef.current.find((v) => v.id === selectedViewRef.current);
        mid = view?.panes[0]?.machineId;
      }
      if (!mid) return;
      const machine = machinesRef.current.find((m) => m.machineId === mid);
      const session = machine?.sessions[idx];
      if (session) {
        setSelectedMachine(mid);
        setSelectedSession(session.id);
        setSelectedView(undefined);
        clearNotifications(`${mid}:${session.id}`);
      }
    }
    function cycleSession(delta: number) {
      let mid = selectedMachineRef.current;
      let sid = selectedSessionRef.current;
      // If in a view, derive machine/session from the view's first pane
      if (!mid && selectedViewRef.current) {
        const view = viewsRef.current.find((v) => v.id === selectedViewRef.current);
        if (view?.panes[0]) {
          mid = view.panes[0].machineId;
          sid = view.panes[0].sessionId;
        }
      }
      if (!mid) return;
      const machine = machinesRef.current.find((m) => m.machineId === mid);
      if (!machine || machine.sessions.length === 0) return;
      const idx = machine.sessions.findIndex((s) => s.id === sid);
      const next = (idx + delta + machine.sessions.length) % machine.sessions.length;
      selectSession(next);
    }
    // Track which key activated nav mode so double-tap sends the correct literal
    let navTriggerKey = "`";

    function sendLiteralChar(ch: string) {
      const el = document.activeElement as HTMLElement;
      if (el?.closest?.(".xterm")) {
        const mid = selectedMachineRef.current;
        const sid = selectedSessionRef.current;
        if (mid && sid) sendInput(mid, sid, { data: ch });
      } else if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA") {
        document.execCommand("insertText", false, ch);
      }
    }

    function cyclePane(delta: number) {
      // Call directly into CrossMachineSplitView's local state — no App re-render
      cyclePaneRef.current?.(delta);
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return;

      // Ctrl/Cmd+T: open new session modal
      if ((e.ctrlKey || e.metaKey) && e.key === "t") {
        e.preventDefault();
        if (newSessionModalRef.current) return; // already open
        const machines = machinesRef.current;
        if (machines.length === 0) return;

        let machineId: string | undefined;
        let cwd: string | undefined;

        const selView = selectedViewRef.current;
        const selMachine = selectedMachineRef.current;
        const selSession = selectedSessionRef.current;

        if (selMachine && selSession) {
          machineId = selMachine;
          const machine = machines.find((m) => m.machineId === selMachine);
          cwd = machine?.sessions.find((s) => s.id === selSession)?.cwd;
        } else if (selView) {
          const view = viewsRef.current.find((v) => v.id === selView);
          const pane = view?.panes[0];
          if (pane) {
            machineId = pane.machineId;
            const machine = machines.find((m) => m.machineId === pane.machineId);
            cwd = machine?.sessions.find((s) => s.id === pane.sessionId)?.cwd;
          }
        }

        if (!machineId) machineId = machines[0].machineId;
        setNewSessionModal({ machineId, cwd });
        return;
      }

      // Skip all other shortcuts when new session modal is open
      if (newSessionModalRef.current) return;

      // Shift+Arrow Left/Right: switch focus between split view panes
      if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        if (cyclePaneRef.current) {
          e.preventDefault(); e.stopPropagation();
          cyclePane(e.key === "ArrowRight" ? 1 : -1);
          return;
        }
      }

      if ((e.key === "`" || e.key === "~") && !e.ctrlKey && !e.altKey && !e.metaKey && !navModeRef.current) {
        // ~ is Shift+` on most keyboards — accept both as prefix
        if (e.key === "~" && !e.shiftKey) return; // ignore bare ~ if not shift
        e.preventDefault();
        e.stopPropagation();
        navTriggerKey = e.key === "~" ? "~" : "`";
        setNav(true);
        return;
      }

      if (!navModeRef.current) return;

      const code = e.code;
      const num = code?.startsWith("Digit") ? parseInt(code[5]) : NaN;

      // Double-tap prefix key → send literal character
      if (e.key === navTriggerKey || (navTriggerKey === "~" && e.key === "~")) {
        e.preventDefault(); e.stopPropagation();
        setNav(false); sendLiteralChar(navTriggerKey); return;
      }
      // Also handle the other prefix key as exit
      if (e.key === "`" || e.key === "~") {
        e.preventDefault(); e.stopPropagation();
        setNav(false); sendLiteralChar(e.key === "~" ? "~" : "`"); return;
      }
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault(); e.stopPropagation();
        setNav(false); return;
      }
      if (!e.shiftKey && num >= 1 && num <= 9) {
        e.preventDefault(); e.stopPropagation();
        selectMachine(num - 1); setNav(false); return;
      }
      if (code === "BracketLeft" || code === "BracketRight") {
        e.preventDefault(); e.stopPropagation();
        cycleMachine(code === "BracketLeft" ? -1 : 1); return;
      }
      if (e.key === "Tab") {
        e.preventDefault(); e.stopPropagation();
        cycleSession(e.shiftKey ? -1 : 1); return;
      }
      if (e.key === "j" || e.key === "k") {
        e.preventDefault(); e.stopPropagation();
        cyclePane(e.key === "j" ? 1 : -1); return;
      }
      if (e.key === "r" || e.key === "R") {
        e.preventDefault(); e.stopPropagation();
        window.dispatchEvent(new Event("blkcat:force-fit"));
        setNav(false); return;
      }
      if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return;
      setNav(false);
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [clearNotifications, sendInput]); // stable deps — registers once

  const selectedSessionData = useMemo(() => {
    if (!selectedMachine || !selectedSession) return undefined;
    const machine = machines.find((m) => m.machineId === selectedMachine);
    return machine?.sessions.find((s) => s.id === selectedSession);
  }, [machines, selectedMachine, selectedSession]);

  const selectedSessionName = useMemo(() => {
    if (!selectedMachine || !selectedSession) return "";
    const defaultName = selectedSessionData?.name ?? selectedSession;
    return getSessionName(selectedMachine, selectedSession, defaultName);
  }, [machines, selectedMachine, selectedSession, getSessionName]);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, startWidth + ev.clientX - startX));
      setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
      resizing.current = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, [sidebarWidth]);

  // Track which pane to focus inside a split view (set by sidebar click)
  // Focus request for split view: key + a counter so repeated clicks on the same session still trigger
  const [viewFocusReq, setViewFocusReq] = useState<{ key: string; seq: number } | undefined>();
  const focusSeqRef = useRef(0);

  // When clicking a session, check if it belongs to a view — if so, select that view and focus
  const handleSelectSession = useCallback((machineId: string, sessionId: string) => {
    const containingView = views.find((v) =>
      v.panes.some((p) => p.machineId === machineId && p.sessionId === sessionId)
    );
    if (containingView) {
      setSelectedView(containingView.id);
      setViewFocusReq({ key: `${machineId}:${sessionId}`, seq: ++focusSeqRef.current });
      setSelectedMachine(undefined);
      setSelectedSession(undefined);
    } else {
      setSelectedMachine(machineId);
      setSelectedSession(sessionId);
      setSelectedView(undefined);
      setViewFocusReq(undefined);
    }
    clearNotifications(`${machineId}:${sessionId}`);
  }, [views, clearNotifications]);

  // Auto-select newly created sessions (or add to view if created from a split view)
  const pendingStartRef = useRef<{ machineId: string; sessionCount: number; viewId?: string } | null>(null);
  useEffect(() => {
    const pending = pendingStartRef.current;
    if (!pending) return;
    const machine = machines.find((m) => m.machineId === pending.machineId);
    if (!machine || machine.sessions.length <= pending.sessionCount) return;
    // New session appeared
    const newSession = machine.sessions[machine.sessions.length - 1];
    pendingStartRef.current = null;

    if (pending.viewId) {
      // Add to the split view that was active when session was created
      const view = views.find((v) => v.id === pending.viewId);
      if (view) {
        updateView(pending.viewId, undefined, [...view.panes, { machineId: pending.machineId, sessionId: newSession.id }]);
        setSelectedView(pending.viewId);
        setViewFocusReq({ key: `${pending.machineId}:${newSession.id}`, seq: ++focusSeqRef.current });
        setSelectedMachine(undefined);
        setSelectedSession(undefined);
        return;
      }
    }
    setSelectedMachine(pending.machineId);
    setSelectedSession(newSession.id);
    setSelectedView(undefined);
    setViewFocusReq(undefined);
  }, [machines, views, updateView]);

  const sidebarBaseProps = {
    machines: machines,
    selectedMachine,
    selectedSession,
    notificationCounts,
    onStartSession: (machineId: string, args?: string, cwd?: string, name?: string, cliTool?: CliTool) => {
      const machine = machines.find((m) => m.machineId === machineId);
      pendingStartRef.current = { machineId, sessionCount: machine?.sessions.length ?? 0 };
      // Show terminal sessions if creating a plain terminal while they're hidden

      startSession(machineId, args, cwd, name, cliTool);
    },
    listDirectory,
    createDirectory,
    onCloseSession: (machineId: string, sessionId: string) => {
      closeSession(machineId, sessionId);
      if (selectedMachine === machineId && selectedSession === sessionId) {
        setSelectedMachine(undefined);
        setSelectedSession(undefined);
      }
    },
    onReloadSession: reloadSession,
    getMachineName,
    getSessionName,
    onRenameMachine: setMachineName,
    onRenameSession: setSessionName,
    waitingSessions,
    activeSessions,
    agents,
    onAddAgent: addAgent,
    onRemoveAgent: removeAgent,
    onSessionSettings: (m: string, s: string) => setSettingsSession({ machineId: m, sessionId: s }),
    subscribeReloadResult,
    currentTheme: theme,
    onThemeChange: setTheme,
    themes,
    onDeselect: () => { setSelectedMachine(undefined); setSelectedSession(undefined); setSelectedView(undefined); setViewFocusReq(undefined); },
    onSelectSessionDirect: (machineId: string, sessionId: string) => {
      setSelectedMachine(machineId);
      setSelectedSession(sessionId);
      setSelectedView(undefined);
      setViewFocusReq(undefined);
      clearNotifications(`${machineId}:${sessionId}`);
    },
    hideTmuxSessions,
    onToggleHideTmux: toggleHideTmux,
    onSwapPane: swapPane,
    onSwapWindow: swapWindow,
    onMovePane: movePane,
    onMoveWindow: moveWindow,
    onRediscover: rediscover,
    views,
    selectedView,
    onSelectView: (viewId: string) => {
      setSelectedView(viewId);
      setSelectedMachine(undefined);
      setSelectedSession(undefined);
    },
    onCreateView: () => setShowCreateViewModal(true),
    onDeleteView: (id: string) => {
      deleteView(id);
      if (selectedView === id) setSelectedView(undefined);
    },
    onRenameView: (id: string, name: string) => updateView(id, name),
    onAddPaneToView: (viewId: string, pane: { machineId: string; sessionId: string }) => {
      const view = views.find((v) => v.id === viewId);
      if (!view) return;
      updateView(viewId, undefined, [...view.panes, pane]);
    },
    onCreateViewFromDrag: (s1: { machineId: string; sessionId: string }, s2: { machineId: string; sessionId: string }) => {
      // Check if a View with exactly these two sessions already exists
      const existing = views.find((v) =>
        v.panes.length === 2 &&
        v.panes.some((p) => p.machineId === s1.machineId && p.sessionId === s1.sessionId) &&
        v.panes.some((p) => p.machineId === s2.machineId && p.sessionId === s2.sessionId)
      );
      if (existing) {
        setSelectedView(existing.id);
        setSelectedMachine(undefined);
        setSelectedSession(undefined);
        return;
      }
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const getName = (mid: string, sid: string) => {
        const machine = machines.find((m) => m.machineId === mid);
        const session = machine?.sessions.find((s) => s.id === sid);
        const defaultName = session?.windowName ?? session?.name ?? sid;
        return getSessionName ? getSessionName(mid, sid, defaultName) : defaultName;
      };
      const name = `${getName(s1.machineId, s1.sessionId)} + ${getName(s2.machineId, s2.sessionId)}`;
      createView(id, name, [s1, s2]);
      setSelectedView(id);
      setSelectedMachine(undefined);
      setSelectedSession(undefined);
    },
    onAttachTerminal: attachedTerminals.attachTerminal,
    onDetachTerminal: attachedTerminals.detachTerminal,
    onHideTerminal: attachedTerminals.hideTerminal,
    onShowTerminal: attachedTerminals.showTerminal,
    attachedTerminals: {
      getAttachedTo: attachedTerminals.getAttachedTo,
      isAttached: attachedTerminals.isAttached,
      isHidden: attachedTerminals.isHidden,
    },
    getGroupName,
    onRenameGroup: setGroupName,
    getOrderedGroups,
    onReorderCwdGroups: setGroupOrder,
    getOrderedMachines,
    onReorderMachines: setMachineOrder,
    panelTab,
    onPanelTab: setPanelTab,
  };

  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: "100dvh", position: "relative" }}>
      {isMobile ? (
        <>
          {drawerOpen && (
            <div className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} />
          )}
          <Sidebar
            width={280}
            className={drawerOpen ? "open" : ""}
            {...sidebarBaseProps}
            onSelectSession={(m, s) => {
              handleSelectSession(m, s);
              setDrawerOpen(false);
            }}
            onCollapse={() => setDrawerOpen(false)}
          />
        </>
      ) : (
        <>
          {!sidebarCollapsed && (
            <Sidebar
              width={sidebarWidth}
              {...sidebarBaseProps}
              onSelectSession={(m, s) => {
                handleSelectSession(m, s);
              }}
              onCollapse={() => setSidebarCollapsed(true)}
            />
          )}
          {!sidebarCollapsed && (
            <div
              className="sidebar-resize-handle"
              onMouseDown={handleResizeStart}
              style={{
                width: 4,
                cursor: "col-resize",
                background: "transparent",
                flexShrink: 0,
                position: "relative",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--accent)"; }}
              onMouseLeave={(e) => { if (!resizing.current) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
            />
          )}
        </>
      )}
      {/* Mobile top bar — hidden on desktop via CSS */}
      <div className="mobile-topbar" style={{
        alignItems: "center",
        padding: "8px 12px",
        gap: 8,
        background: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border)",
      }}>
        <button
          onClick={() => setDrawerOpen(true)}
          style={{
            background: "none",
            border: "none",
            color: "var(--text)",
            cursor: "pointer",
            padding: "4px 8px",
            lineHeight: 1,
          }}
        ><Menu size={20} /></button>
        {editingTopbarName && selectedMachine && selectedSession ? (
          <input
            autoFocus
            value={topbarEditValue}
            onChange={(e) => setTopbarEditValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setSessionName(selectedMachine, selectedSession, topbarEditValue);
                setEditingTopbarName(false);
              } else if (e.key === "Escape") {
                setEditingTopbarName(false);
              }
            }}
            onBlur={() => {
              setSessionName(selectedMachine, selectedSession, topbarEditValue);
              setEditingTopbarName(false);
            }}
            style={{
              flex: 1,
              fontSize: 14,
              fontWeight: 600,
              background: "var(--bg-primary)",
              color: "var(--text)",
              border: "1px solid var(--accent)",
              borderRadius: 4,
              padding: "2px 6px",
              outline: "none",
              minWidth: 0,
            }}
          />
        ) : (
          <span style={{ flex: 1, fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedSessionName || "blkcat-monitor"}
          </span>
        )}
        {selectedMachine && selectedSession && !editingTopbarName && (
          <button
            onClick={() => {
              setTopbarEditValue(selectedSessionName);
              setEditingTopbarName(true);
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "4px 6px",
              lineHeight: 1,
              flexShrink: 0,
            }}
            title="Rename session"
          ><Pencil size={14} /></button>
        )}
        {(["events", "notifications", "skills", "health", "agents"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setPanelTab((v) => v === tab ? null : tab)}
            style={{
              background: panelTab === tab ? "var(--accent)" : "none",
              border: "none",
              color: panelTab === tab ? "#fff" : "var(--text-muted)",
              cursor: "pointer",
              padding: "4px 8px",
              borderRadius: 4,
              display: "inline-flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            {tab === "events" ? <ClipboardList size={16} /> : tab === "notifications" ? (() => {
              let total = 0;
              for (const c of notificationCounts.values()) total += c;
              return <><Bell size={16} />{total > 0 && <span style={{ fontSize: 11, fontWeight: 600 }}>{total}</span>}</>;
            })() : tab === "health" ? <Activity size={16} /> : tab === "agents" ? <Plug size={16} /> : <Settings size={16} />}
          </button>
        ))}
      </div>
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden", position: "relative" }}>
        {(!isMobile && sidebarCollapsed) && (
          <button
            onClick={() => setSidebarCollapsed(false)}
            title="Show sidebar"
            style={{
              background: "var(--bg-secondary)",
              border: "none",
              borderRight: "1px solid var(--border)",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "8px 12px",
              lineHeight: 1,
            }}
          >
            <Menu size={16} />
          </button>
        )}
        {!connected && (
          <div
            style={{
              padding: 16,
              background: "var(--red)",
              color: "#fff",
              textAlign: "center",
            }}
          >
            Disconnected from server
          </div>
        )}
        <div ref={navBarRef} style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          padding: "6px 16px",
          background: "rgba(255, 200, 0, 0.9)",
          color: "#000",
          fontSize: 12,
          fontWeight: 600,
          display: "none",
          gap: 16,
          alignItems: "center",
          flexWrap: "wrap",
          pointerEvents: "none",
        }}>
          <span style={{ fontFamily: "monospace" }}>` ~</span>
          <span style={{ fontWeight: 400 }}>1-9 machine</span>
          <span style={{ fontWeight: 400 }}>[ ] cycle machine</span>
          <span style={{ fontWeight: 400 }}>Tab cycle session</span>
          <span style={{ fontWeight: 400 }}>j/k cycle pane</span>
          <span style={{ fontWeight: 400, opacity: 0.7 }}>`` ~~ literal</span>
          <span style={{ fontWeight: 400, opacity: 0.7 }}>Esc cancel</span>
        </div>
        {selectedView && (() => {
          const view = views.find((v) => v.id === selectedView);
          if (!view || view.panes.length === 0) {
            return (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: 14 }}>
                View is empty. Drag sessions from the sidebar to add them.
              </div>
            );
          }
          return (
            <CrossMachineSplitView
              view={view}
              machines={machines}
              isMobile={isMobile}
              outputMapRef={outputMapRef}
              subscribeOutput={subscribeOutput}
              logMapRef={logMapRef}
              scrollbackMapRef={scrollbackMapRef}
              subscribeScrollback={subscribeScrollback}
              onRequestScrollback={requestScrollback}
              onSendInput={sendInput}
              onSendResize={sendResize}
              getMachineName={getMachineName}
              getSessionName={getSessionName}
              getOrderedGroups={getOrderedGroups}
              onSelectSessionDirect={(machineId, sessionId) => {
                setSelectedMachine(machineId);
                setSelectedSession(sessionId);
                setSelectedView(undefined);
                setViewFocusReq(undefined);
                clearNotifications(`${machineId}:${sessionId}`);
              }}
              onUpdateView={(id, name, panes) => {
                if (panes && panes.length === 0) {
                  deleteView(id);
                  if (selectedView === id) setSelectedView(undefined);
                } else {
                  updateView(id, name, panes);
                }
              }}
              focusSessionKey={viewFocusReq?.key}
              focusSeq={viewFocusReq?.seq}
              cyclePaneRef={cyclePaneRef}
            />
          );
        })()}
        {selectedView ? null : selectedMachine && selectedSession ? (
          <SessionDetail
            machineId={selectedMachine}
            sessionId={selectedSession}
            sessionName={selectedSessionName}
            cwd={selectedSessionData?.cwd}
            lines={sessionOutput.lines}
            cursor={sessionOutput.cursor}
            logMapRef={logMapRef}
            scrollbackMapRef={scrollbackMapRef}
            subscribeScrollback={subscribeScrollback}
            onRequestScrollback={() => requestScrollback(selectedMachine, selectedSession)}
            onSendText={(text) => sendInput(selectedMachine, selectedSession, { text })}
            onSendKey={(key) => sendInput(selectedMachine, selectedSession, { key })}
            onSendData={(data) => sendInput(selectedMachine, selectedSession, { data })}
            onResize={(cols, rows, force) => sendResize(selectedMachine, selectedSession, cols, rows, force)}
          />
        ) : (
          <div
            style={{
              flex: 1,
              background: "var(--bg)",
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div className="idle-layer idle-layer-even" />
            <div className="idle-layer idle-layer-odd" />
          </div>
        )}
      </main>
      {/* Desktop: panel content overlay next to sidebar */}
      {!isMobile && panelTab && panelTab !== "skills" && (
        <div style={{
          position: "absolute",
          top: 0,
          left: sidebarCollapsed ? 0 : sidebarWidth + 4,
          bottom: 0,
          width: 320,
          zIndex: 20,
          overflow: "hidden",
        }}>
          {panelTab === "events" ? (
            <EventFeed
              hookEventsRef={hookEventsRef}
              subscribeHookEvents={subscribeHookEvents}
              onClose={() => setPanelTab(null)}
            />
          ) : panelTab === "health" ? (
            <HealthPanel
              health={health}
              onClose={() => setPanelTab(null)}
            />
          ) : panelTab === "agents" ? (
            <AgentManager agents={agents} onAdd={addAgent} onRemove={removeAgent} onClose={() => setPanelTab(null)} />
          ) : (
            <NotificationList
              hookEventsRef={hookEventsRef}
              subscribeHookEvents={subscribeHookEvents}
              machines={machines}
              onSelectSession={(m, s) => {
                handleSelectSession(m, s);
                setPanelTab(null);
              }}
              getMachineName={getMachineName}
              getSessionName={getSessionName}
              onClose={() => setPanelTab(null)}
            />
          )}
        </div>
      )}
      {/* Full-width skills matrix overlay */}
      {panelTab === "skills" && (
        <div className="panel-overlay" style={{
          position: "absolute",
          top: 0,
          left: isMobile ? 0 : (sidebarCollapsed ? 0 : sidebarWidth + 4),
          right: 0,
          bottom: 0,
          zIndex: 15,
        }}>
          <SkillsMatrix
            machines={machines}
            getMachineName={getMachineName}
            deploySkills={deploySkills}
            removeSkills={removeSkills}
            getSettings={getSettings}
            updateSettings={updateSettings}
            subscribeDeployResult={subscribeDeployResult}
            subscribeSettingsSnapshot={subscribeSettingsSnapshot}
            subscribeSettingsResult={subscribeSettingsResult}
            onClose={() => setPanelTab(null)}
          />
        </div>
      )}
      {/* Mobile: full-screen panel overlay (rendered outside pointer-events:none container) */}
      {isMobile && panelTab && panelTab !== "skills" && (
        <div className="panel-overlay" style={{ overflow: "hidden" }}>
          {panelTab === "events" ? (
            <EventFeed
              hookEventsRef={hookEventsRef}
              subscribeHookEvents={subscribeHookEvents}
              onClose={() => setPanelTab(null)}
            />
          ) : panelTab === "health" ? (
            <HealthPanel
              health={health}
              onClose={() => setPanelTab(null)}
            />
          ) : panelTab === "agents" ? (
            <AgentManager agents={agents} onAdd={addAgent} onRemove={removeAgent} onClose={() => setPanelTab(null)} />
          ) : (
            <NotificationList
              hookEventsRef={hookEventsRef}
              subscribeHookEvents={subscribeHookEvents}
              machines={machines}
              onSelectSession={(m, s) => {
                handleSelectSession(m, s);
                setPanelTab(null);
              }}
              getMachineName={getMachineName}
              getSessionName={getSessionName}
              onClose={() => setPanelTab(null)}
            />
          )}
        </div>
      )}
      {/* Project settings modal */}
      {settingsSession && (() => {
        const machine = machines.find(m => m.machineId === settingsSession.machineId);
        const session = machine?.sessions.find(s => s.id === settingsSession.sessionId);
        const mName = getMachineName(settingsSession.machineId);
        const sName = session ? getSessionName(settingsSession.machineId, session.id, session.name) : settingsSession.sessionId;
        return (
          <ProjectSettingsModal
            machineId={settingsSession.machineId}
            machineName={mName}
            sessionName={sName}
            getSettings={getSettings}
            updateSettings={updateSettings}
            subscribeSettingsSnapshot={subscribeSettingsSnapshot}
            subscribeSettingsResult={subscribeSettingsResult}
            listDirectory={listDirectory}
            onClose={() => setSettingsSession(null)}
          />
        );
      })()}
      {/* New session modal (Ctrl/Cmd+T) */}
      {newSessionModal && (
        <StartSessionModal
          machineId={newSessionModal.machineId}
          machineName={getMachineName(newSessionModal.machineId)}
          initialCwd={newSessionModal.cwd}
          onStart={(mid, args, cwd, name, cliTool) => {
            const machine = machines.find((m) => m.machineId === mid);
            pendingStartRef.current = { machineId: mid, sessionCount: machine?.sessions.length ?? 0, viewId: selectedView };
      
            startSession(mid, args, cwd, name, cliTool);
            setNewSessionModal(null);
          }}
          onClose={() => setNewSessionModal(null)}
          listDirectory={listDirectory}
          createDirectory={createDirectory}
        />
      )}
      <PWAPrompt />
      {/* Create View modal */}
      {showCreateViewModal && (
        <CreateViewModal
          machines={machines}
          getMachineName={getMachineName}
          getSessionName={getSessionName}
          onCreate={(id, name, panes) => {
            createView(id, name, panes);
            setShowCreateViewModal(false);
            setSelectedView(id);
            setSelectedMachine(undefined);
            setSelectedSession(undefined);
          }}
          onClose={() => setShowCreateViewModal(false)}
        />
      )}
    </div>
  );
}
