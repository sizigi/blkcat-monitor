import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useSocket, type OutputLine } from "./hooks/useSocket";
import { useAgents } from "./hooks/useAgents";
import { useDisplayNames } from "./hooks/useDisplayNames";
import { useIsMobile } from "./hooks/useIsMobile";
import { Sidebar } from "./components/Sidebar";
import { SessionDetail } from "./components/SessionDetail";
import { EventFeed } from "./components/EventFeed";
import { NotificationList } from "./components/NotificationList";
import { SkillsMatrix } from "./components/SkillsMatrix";
import { ProjectSettingsModal } from "./components/ProjectSettingsModal";

const WS_URL =
  (import.meta as any).env?.VITE_WS_URL ??
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/dashboard`;

const DEFAULT_SIDEBAR_WIDTH = 250;
const MIN_SIDEBAR_WIDTH = 160;
const MAX_SIDEBAR_WIDTH = 500;

/** Subscribe to output changes for a specific session. Only triggers a
 *  re-render when the selected session's output changes — not when any
 *  other session receives new data. */
function useSessionLines(
  outputMapRef: React.RefObject<Map<string, OutputLine>>,
  subscribeOutput: (cb: (key: string) => void) => () => void,
  machineId?: string,
  sessionId?: string,
): string[] {
  const [lines, setLines] = useState<string[]>([]);
  const targetKey = machineId && sessionId ? `${machineId}:${sessionId}` : "";

  useEffect(() => {
    if (!targetKey) { setLines([]); return; }

    // Read current cached value
    const current = outputMapRef.current?.get(targetKey);
    setLines(current?.lines ?? []);

    // Subscribe to future updates for this session only
    return subscribeOutput((key) => {
      if (key === targetKey) {
        const output = outputMapRef.current?.get(key);
        if (output) setLines(output.lines);
      }
    });
  }, [targetKey, outputMapRef, subscribeOutput]);

  return lines;
}

export default function App() {
  const { connected, machines, waitingSessions, activeSessions, outputMapRef, logMapRef, scrollbackMapRef, subscribeOutput, subscribeScrollback, sendInput, startSession, closeSession, reloadSession, sendResize, requestScrollback, hookEventsRef, subscribeHookEvents, notificationCounts, clearNotifications, listDirectory, deploySkills, removeSkills, getSettings, updateSettings, subscribeDeployResult, subscribeSettingsSnapshot, subscribeSettingsResult, setDisplayName, subscribeDisplayNames } = useSocket(WS_URL);
  const { agents, addAgent, removeAgent } = useAgents();
  const { getMachineName, getSessionName, setMachineName, setSessionName } = useDisplayNames({
    sendDisplayName: setDisplayName,
    subscribeDisplayNames,
  });
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Reset mobile-specific state and force terminal refit on mode transition
  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
    // After layout settles, dispatch resize to trigger terminal refit.
    // Use setTimeout to ensure browser has completed layout recalculation.
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 150);
    return () => clearTimeout(timer);
  }, [isMobile]);
  const [selectedMachine, setSelectedMachine] = useState<string>();
  const [selectedSession, setSelectedSession] = useState<string>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [panelTab, setPanelTab] = useState<"events" | "notifications" | "skills" | null>(null);
  const [settingsSession, setSettingsSession] = useState<{ machineId: string; sessionId: string } | null>(null);
  const [editingTopbarName, setEditingTopbarName] = useState(false);
  const [topbarEditValue, setTopbarEditValue] = useState("");
  const resizing = useRef(false);

  const sessionLines = useSessionLines(outputMapRef, subscribeOutput, selectedMachine, selectedSession);

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
    machines,
    selectedMachine,
    selectedSession,
    notificationCounts,
    onStartSession: startSession,
    listDirectory,
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
  };

  return (
    <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", height: "100vh", position: "relative" }}>
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
            fontSize: 20,
            padding: "4px 8px",
            lineHeight: 1,
          }}
        >&#9776;</button>
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
              fontSize: 14,
              padding: "4px 6px",
              lineHeight: 1,
              flexShrink: 0,
            }}
            title="Rename session"
          >&#9998;</button>
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
              fontSize: 16,
              padding: "4px 8px",
              borderRadius: 4,
            }}
          >
            {tab === "events" ? "\u{1F4CB}" : tab === "notifications" ? (() => {
              let total = 0;
              for (const c of notificationCounts.values()) total += c;
              return total > 0 ? `\u{1F514}${total}` : "\u{1F514}";
            })() : "\u{2699}\u{FE0F}"}
          </button>
        ))}
      </div>
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
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
              fontSize: 16,
              padding: "8px 12px",
              lineHeight: 1,
            }}
          >
            &#9776;
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
        {selectedMachine && selectedSession ? (
          <SessionDetail
            machineId={selectedMachine}
            sessionId={selectedSession}
            sessionName={selectedSessionName}
            lines={sessionLines}
            logMapRef={logMapRef}
            scrollbackMapRef={scrollbackMapRef}
            subscribeScrollback={subscribeScrollback}
            onRequestScrollback={() => requestScrollback(selectedMachine, selectedSession)}
            onSendText={(text) => sendInput(selectedMachine, selectedSession, { text })}
            onSendKey={(key) => sendInput(selectedMachine, selectedSession, { key })}
            onSendData={(data) => sendInput(selectedMachine, selectedSession, { data })}
            onResize={(cols, rows) => sendResize(selectedMachine, selectedSession, cols, rows)}
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
