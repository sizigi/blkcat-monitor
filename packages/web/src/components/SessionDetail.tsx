import React from "react";
import { TerminalOutput } from "./TerminalOutput";
import { ChatInput } from "./ChatInput";

interface SessionDetailProps {
  machineId: string;
  sessionId: string;
  sessionName: string;
  lines: string[];
  onSendText: (text: string) => void;
  onSendKey: (key: string) => void;
  onSendData: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

export function SessionDetail({
  machineId,
  sessionId,
  sessionName,
  lines,
  onSendText,
  onSendKey,
  onSendData,
  onResize,
}: SessionDetailProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-secondary)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span style={{ fontWeight: 600 }}>{sessionName}</span>
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
          {machineId} / {sessionId}
        </span>
      </div>
      <TerminalOutput lines={lines} onData={onSendData} onResize={onResize} />
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <ChatInput onSendText={onSendText} onSendKey={onSendKey} />
      </div>
    </div>
  );
}
