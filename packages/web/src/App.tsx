import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useSocket, type OutputLine } from "./hooks/useSocket";
import { useAgents } from "./hooks/useAgents";
import { useDisplayNames } from "./hooks/useDisplayNames";
import { useIsMobile } from "./hooks/useIsMobile";
import { useSidebarOrder } from "./hooks/useSidebarOrder";
import { Sidebar } from "./components/Sidebar";
import { SessionDetail } from "./components/SessionDetail";
import { EventFeed } from "./components/EventFeed";
import { NotificationList } from "./components/NotificationList";
import { SkillsMatrix } from "./components/SkillsMatrix";
import { ProjectSettingsModal } from "./components/ProjectSettingsModal";
import { Menu, Pencil, ClipboardList, Bell, Settings, ChevronUp } from "./components/Icons";

const WS_URL =
  (import.meta as any).env?.VITE_WS_URL ??
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/dashboard`;

const DEFAULT_SIDEBAR_WIDTH = 250;
const MIN_SIDEBAR_WIDTH = 160;
const MAX_SIDEBAR_WIDTH = 500;

/** Subscribe to output changes for a specific session. Only triggers a
 *  re-render when the selected session's output changes — not when any
 *  other session receives new data. */
function useSessionOutput(
  outputMapRef: React.RefObject<Map<string, OutputLine>>,
  subscribeOutput: (cb: (key: string) => void) => () => void,
  machineId?: string,
  sessionId?: string,
): { lines: string[]; cursor?: { x: number; y: number } } {
  const [output, setOutput] = useState<{ lines: string[]; cursor?: { x: number; y: number } }>({ lines: [] });
  const targetKey = machineId && sessionId ? `${machineId}:${sessionId}` : "";

  useEffect(() => {
    if (!targetKey) { setOutput({ lines: [] }); return; }

    const current = outputMapRef.current?.get(targetKey);
    if (current) setOutput({ lines: current.lines, cursor: current.cursor });

    return subscribeOutput((key) => {
      if (key === targetKey) {
        const o = outputMapRef.current?.get(key);
        if (o) setOutput({ lines: o.lines, cursor: o.cursor });
      }
    });
  }, [targetKey, outputMapRef, subscribeOutput]);

  return output;
}

export default function App() {
  const { connected, machines, waitingSessions, activeSessions, outputMapRef, logMapRef, scrollbackMapRef, subscribeOutput, subscribeScrollback, sendInput, startSession, closeSession, reloadSession, sendResize, requestScrollback, hookEventsRef, subscribeHookEvents, notificationCounts, clearNotifications, listDirectory, createDirectory, deploySkills, removeSkills, getSettings, updateSettings, subscribeDeployResult, subscribeSettingsSnapshot, subscribeSettingsResult, setDisplayName, subscribeDisplayNames, subscribeReloadResult } = useSocket(WS_URL);
  const { agents, addAgent, removeAgent } = useAgents();
  const { getMachineName, getSessionName, setMachineName, setSessionName } = useDisplayNames({
    sendDisplayName: setDisplayName,
    subscribeDisplayNames,
  });
  const { applyOrder, reorderMachine, reorderSession, syncOrder } = useSidebarOrder();
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
  const [selectedMachine, setSelectedMachine] = useState<string>();
  const [selectedSession, setSelectedSession] = useState<string>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [panelTab, setPanelTab] = useState<"events" | "notifications" | "skills" | null>(null);
  const [settingsSession, setSettingsSession] = useState<{ machineId: string; sessionId: string } | null>(null);
  const [editingTopbarName, setEditingTopbarName] = useState(false);
  const [topbarEditValue, setTopbarEditValue] = useState("");
  const [navMode, setNavMode] = useState(false);
  const resizing = useRef(false);
  // Refs for values used in stable effects (avoids re-registering document listeners)
  const selectedMachineRef = useRef(selectedMachine);
  selectedMachineRef.current = selectedMachine;
  const selectedSessionRef = useRef(selectedSession);
  selectedSessionRef.current = selectedSession;

  const sessionOutput = useSessionOutput(outputMapRef, subscribeOutput, selectedMachine, selectedSession);

  // Keep sidebar order in sync with server-provided machines
  const orderedMachines = useMemo(() => applyOrder(machines), [applyOrder, machines]);
  const orderedMachinesRef = useRef(orderedMachines);
  orderedMachinesRef.current = orderedMachines;
  useEffect(() => { if (machines.length > 0) syncOrder(machines); }, [machines, syncOrder]);

  // Navigation mode: backtick (`) as leader key, works in xterm and input fields.
  // Uses refs so the keydown listener registers once and never re-attaches.
  const navModeRef = useRef(false);
  useEffect(() => {
    function setNav(v: boolean) { navModeRef.current = v; setNavMode(v); }

    function selectMachine(idx: number) {
      const machine = orderedMachinesRef.current[idx];
      if (!machine) return;
      setSelectedMachine(machine.machineId);
      if (machine.sessions.length > 0) {
        setSelectedSession(machine.sessions[0].id);
        clearNotifications(`${machine.machineId}:${machine.sessions[0].id}`);
      }
    }
    function cycleMachine(delta: number) {
      const machines = orderedMachinesRef.current;
      const idx = machines.findIndex((m) => m.machineId === selectedMachineRef.current);
      const next = (idx + delta + machines.length) % machines.length;
      selectMachine(next);
    }
    function selectSession(idx: number) {
      const mid = selectedMachineRef.current;
      if (!mid) return;
      const machine = orderedMachinesRef.current.find((m) => m.machineId === mid);
      const session = machine?.sessions[idx];
      if (session) {
        setSelectedSession(session.id);
        clearNotifications(`${mid}:${session.id}`);
      }
    }
    function cycleSession(delta: number) {
      const mid = selectedMachineRef.current;
      if (!mid) return;
      const machine = orderedMachinesRef.current.find((m) => m.machineId === mid);
      if (!machine || machine.sessions.length === 0) return;
      const idx = machine.sessions.findIndex((s) => s.id === selectedSessionRef.current);
      const next = (idx + delta + machine.sessions.length) % machine.sessions.length;
      selectSession(next);
    }
    function sendLiteralBacktick() {
      const el = document.activeElement as HTMLElement;
      if (el?.closest?.(".xterm")) {
        const mid = selectedMachineRef.current;
        const sid = selectedSessionRef.current;
        if (mid && sid) sendInput(mid, sid, { data: "`" });
      } else if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA") {
        document.execCommand("insertText", false, "`");
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return;

      if (e.key === "`" && !e.ctrlKey && !e.altKey && !e.metaKey && !navModeRef.current) {
        e.preventDefault();
        e.stopPropagation();
        setNav(true);
        return;
      }

      if (!navModeRef.current) return;

      const code = e.code;
      const num = code?.startsWith("Digit") ? parseInt(code[5]) : NaN;

      if (e.key === "`") {
        e.preventDefault(); e.stopPropagation();
        setNav(false); sendLiteralBacktick(); return;
      }
      if (e.key === "Escape" || e.key === "Enter") {
        e.preventDefault(); e.stopPropagation();
        setNav(false); return;
      }
      if (!e.shiftKey && num >= 1 && num <= 9) {
        e.preventDefault(); e.stopPropagation();
        selectMachine(num - 1); setNav(false); return;
      }
      if (e.shiftKey && num >= 1 && num <= 9) {
        e.preventDefault(); e.stopPropagation();
        selectSession(num - 1); setNav(false); return;
      }
      if (code === "BracketLeft" || code === "BracketRight") {
        e.preventDefault(); e.stopPropagation();
        cycleMachine(code === "BracketLeft" ? -1 : 1); return;
      }
      if (e.key === "Tab") {
        e.preventDefault(); e.stopPropagation();
        cycleSession(e.shiftKey ? -1 : 1); return;
      }
      if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return;
      setNav(false);
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [clearNotifications, sendInput]); // stable deps — registers once

  const selectedSessionName = useMemo(() => {
    if (!selectedMachine || !selectedSession) return "";
    const machine = machines.find((m) => m.machineId === selectedMachine);
    const session = machine?.sessions.find((s) => s.id === selectedSession);
    const defaultName = session?.name ?? selectedSession;
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

  const sidebarBaseProps = {
    machines: orderedMachines,
    selectedMachine,
    selectedSession,
    notificationCounts,
    onStartSession: startSession,
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
    onReorderMachine: reorderMachine,
    onReorderSession: reorderSession,
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
              setSelectedMachine(m);
              setSelectedSession(s);
              clearNotifications(`${m}:${s}`);
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
                setSelectedMachine(m);
                setSelectedSession(s);
                clearNotifications(`${m}:${s}`);
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
        {(["events", "notifications", "skills"] as const).map((tab) => (
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
            })() : <Settings size={16} />}
          </button>
        ))}
      </div>
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
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
        {navMode && (
          <div style={{
            padding: "6px 16px",
            background: "rgba(255, 200, 0, 0.9)",
            color: "#000",
            fontSize: 12,
            fontWeight: 600,
            display: "flex",
            gap: 16,
            alignItems: "center",
            flexWrap: "wrap",
          }}>
            <span style={{ fontFamily: "monospace" }}>`</span>
            <span style={{ fontWeight: 400 }}>1-9 machine</span>
            <span style={{ fontWeight: 400, display: "inline-flex", alignItems: "center", gap: 2 }}><ChevronUp size={12} />1-9 session</span>
            <span style={{ fontWeight: 400 }}>[ ] cycle machine</span>
            <span style={{ fontWeight: 400 }}>Tab cycle session</span>
            <span style={{ fontWeight: 400, opacity: 0.7 }}>`` literal `</span>
            <span style={{ fontWeight: 400, opacity: 0.7 }}>Esc cancel</span>
          </div>
        )}
        {selectedMachine && selectedSession ? (
          <SessionDetail
            machineId={selectedMachine}
            sessionId={selectedSession}
            sessionName={selectedSessionName}
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
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-muted)",
            }}
          >
            Select a session from the sidebar
          </div>
        )}
      </main>
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
      {/* Desktop: right overlay panel with tab buttons + panel content */}
      {!isMobile && (
        <div style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          zIndex: 20,
          pointerEvents: "none",
        }}>
          {/* Tab buttons */}
          <div className="panel-tabs-desktop" style={{
            display: "flex",
            gap: 0,
            padding: "8px 8px 0",
            justifyContent: "flex-end",
            pointerEvents: "auto",
          }}>
            {(["events", "notifications", "skills"] as const).map((tab, i, arr) => (
              <button
                key={tab}
                onClick={() => setPanelTab((v) => v === tab ? null : tab)}
                style={{
                  background: panelTab === tab ? "var(--bg-secondary)" : "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  borderBottom: panelTab === tab ? "none" : "1px solid var(--border)",
                  color: panelTab === tab ? "var(--text-primary)" : "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: i === 0 ? "4px 0 0 0" : i === arr.length - 1 ? "0 4px 0 0" : "0",
                }}
              >
                {tab === "events" ? "Events" : tab === "notifications" ? "Notifications" : "Skills"}
                {tab === "notifications" && (() => {
                  let total = 0;
                  for (const c of notificationCounts.values()) total += c;
                  return total > 0 ? ` (${total})` : "";
                })()}
              </button>
            ))}
          </div>
          {/* Panel content */}
          {panelTab && panelTab !== "skills" && (
            <div style={{
              width: 320,
              flex: 1,
              pointerEvents: "auto",
              alignSelf: "flex-end",
              overflow: "hidden",
            }}>
              {panelTab === "events" ? (
                <EventFeed
                  hookEventsRef={hookEventsRef}
                  subscribeHookEvents={subscribeHookEvents}
                  onClose={() => setPanelTab(null)}
                />
              ) : (
                <NotificationList
                  hookEventsRef={hookEventsRef}
                  subscribeHookEvents={subscribeHookEvents}
                  machines={machines}
                  onSelectSession={(m, s) => {
                    setSelectedMachine(m);
                    setSelectedSession(s);
                    clearNotifications(`${m}:${s}`);
                    setPanelTab(null);
                  }}
                  getMachineName={getMachineName}
                  getSessionName={getSessionName}
                  onClose={() => setPanelTab(null)}
                />
              )}
            </div>
          )}
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
          ) : (
            <NotificationList
              hookEventsRef={hookEventsRef}
              subscribeHookEvents={subscribeHookEvents}
              machines={machines}
              onSelectSession={(m, s) => {
                setSelectedMachine(m);
                setSelectedSession(s);
                clearNotifications(`${m}:${s}`);
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
    </div>
  );
}
