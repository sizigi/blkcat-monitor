import React, { useState, useMemo, useCallback, useRef } from "react";
import { useSocket } from "./hooks/useSocket";
import { useAgents } from "./hooks/useAgents";
import { useDisplayNames } from "./hooks/useDisplayNames";
import { Sidebar } from "./components/Sidebar";
import { SessionDetail } from "./components/SessionDetail";

const WS_URL =
  (import.meta as any).env?.VITE_WS_URL ??
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/dashboard`;

const DEFAULT_SIDEBAR_WIDTH = 250;
const MIN_SIDEBAR_WIDTH = 160;
const MAX_SIDEBAR_WIDTH = 500;

export default function App() {
  const { connected, machines, outputs, sendInput, startSession, closeSession, sendResize } = useSocket(WS_URL);
  const { agents, addAgent, removeAgent } = useAgents();
  const { getMachineName, getSessionName, setMachineName, setSessionName } = useDisplayNames();
  const [selectedMachine, setSelectedMachine] = useState<string>();
  const [selectedSession, setSelectedSession] = useState<string>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const resizing = useRef(false);

  const sessionLines = useMemo(() => {
    if (!selectedMachine || !selectedSession) return [];
    const matching = outputs.filter(
      (o) => o.machineId === selectedMachine && o.sessionId === selectedSession,
    );
    return matching.length > 0 ? matching[matching.length - 1].lines : [];
  }, [outputs, selectedMachine, selectedSession]);

  const waitingSessions = useMemo(() => {
    const set = new Set<string>();
    for (const o of outputs) {
      if (o.waitingForInput) set.add(`${o.machineId}:${o.sessionId}`);
    }
    return set;
  }, [outputs]);

  const selectedSessionName = useMemo(() => {
    if (!selectedMachine || !selectedSession) return "";
    const machine = machines.find((m) => m.machineId === selectedMachine);
    const session = machine?.sessions.find((s) => s.id === selectedSession);
    const defaultName = session?.name ?? selectedSession;
    return getSessionName(selectedSession, defaultName);
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

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {!sidebarCollapsed && (
        <Sidebar
          width={sidebarWidth}
          machines={machines}
          selectedMachine={selectedMachine}
          selectedSession={selectedSession}
          onSelectSession={(m, s) => {
            setSelectedMachine(m);
            setSelectedSession(s);
          }}
          onStartSession={startSession}
          onCloseSession={(machineId, sessionId) => {
            closeSession(machineId, sessionId);
            if (selectedMachine === machineId && selectedSession === sessionId) {
              setSelectedMachine(undefined);
              setSelectedSession(undefined);
            }
          }}
          getMachineName={getMachineName}
          getSessionName={getSessionName}
          onRenameMachine={setMachineName}
          onRenameSession={setSessionName}
          waitingSessions={waitingSessions}
          agents={agents}
          onAddAgent={addAgent}
          onRemoveAgent={removeAgent}
          onCollapse={() => setSidebarCollapsed(true)}
        />
      )}
      {!sidebarCollapsed && (
        <div
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
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {(sidebarCollapsed || !connected) && (
          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
            {sidebarCollapsed && (
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
                  flex: 1,
                  padding: 16,
                  background: "var(--red)",
                  color: "#fff",
                  textAlign: "center",
                }}
              >
                Disconnected from server
              </div>
            )}
          </div>
        )}
        {selectedMachine && selectedSession ? (
          <SessionDetail
            machineId={selectedMachine}
            sessionId={selectedSession}
            sessionName={selectedSessionName}
            lines={sessionLines}
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
    </div>
  );
}
