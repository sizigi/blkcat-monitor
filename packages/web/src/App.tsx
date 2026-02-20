import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useSocket, type OutputLine } from "./hooks/useSocket";
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
  const { connected, machines, waitingSessions, outputMapRef, logMapRef, subscribeOutput, sendInput, startSession, closeSession, sendResize } = useSocket(WS_URL);
  const { agents, addAgent, removeAgent } = useAgents();
  const { getMachineName, getSessionName, setMachineName, setSessionName } = useDisplayNames();
  const [selectedMachine, setSelectedMachine] = useState<string>();
  const [selectedSession, setSelectedSession] = useState<string>();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const resizing = useRef(false);

  const sessionLines = useSessionLines(outputMapRef, subscribeOutput, selectedMachine, selectedSession);

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
            logMapRef={logMapRef}
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
