import React, { useState, useMemo } from "react";
import { useSocket } from "./hooks/useSocket";
import { Sidebar } from "./components/Sidebar";
import { SessionDetail } from "./components/SessionDetail";

const WS_URL =
  (import.meta as any).env?.VITE_WS_URL ??
  `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws/dashboard`;
const SECRET = (import.meta as any).env?.VITE_SECRET ?? "";

export default function App() {
  const { connected, machines, outputs, sendInput } = useSocket(WS_URL, SECRET);
  const [selectedMachine, setSelectedMachine] = useState<string>();
  const [selectedSession, setSelectedSession] = useState<string>();

  const sessionLines = useMemo(() => {
    if (!selectedMachine || !selectedSession) return [];
    const matching = outputs.filter(
      (o) => o.machineId === selectedMachine && o.sessionId === selectedSession,
    );
    return matching.length > 0 ? matching[matching.length - 1].lines : [];
  }, [outputs, selectedMachine, selectedSession]);

  const selectedSessionName = useMemo(() => {
    if (!selectedMachine || !selectedSession) return "";
    const machine = machines.find((m) => m.machineId === selectedMachine);
    const session = machine?.sessions.find((s) => s.id === selectedSession);
    return session?.name ?? selectedSession;
  }, [machines, selectedMachine, selectedSession]);

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <Sidebar
        machines={machines}
        selectedMachine={selectedMachine}
        selectedSession={selectedSession}
        onSelectSession={(m, s) => {
          setSelectedMachine(m);
          setSelectedSession(s);
        }}
      />
      <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
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
            onSendInput={(text) => sendInput(selectedMachine, selectedSession, text)}
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
