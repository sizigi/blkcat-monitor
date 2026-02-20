import React from "react";
import { TerminalOutput } from "./TerminalOutput";
import { ChatInput } from "./ChatInput";

interface SessionDetailProps {
  machineId: string;
  sessionId: string;
  sessionName: string;
  lines: string[];
  logMapRef?: React.RefObject<Map<string, string[]>>;
  scrollbackMapRef?: React.RefObject<Map<string, string[]>>;
  subscribeScrollback?: (cb: (key: string) => void) => () => void;
  onRequestScrollback?: () => void;
  onSendText: (text: string) => void;
  onSendKey: (key: string) => void;
  onSendData: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  onReload?: () => void;
}

export function SessionDetail({
  machineId,
  sessionId,
  sessionName,
  lines,
  logMapRef,
  scrollbackMapRef,
  subscribeScrollback,
  onRequestScrollback,
  onSendText,
  onSendKey,
  onSendData,
  onResize,
  onReload,
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
        {onReload && (
          <button
            onClick={onReload}
            title="Reload session (claude --resume)"
            style={{
              marginLeft: "auto",
              background: "none",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 12,
              padding: "2px 8px",
              borderRadius: 4,
            }}
          >
            Reload
          </button>
        )}
      </div>
      <TerminalOutput sessionKey={`${machineId}:${sessionId}`} lines={lines} logMapRef={logMapRef} scrollbackMapRef={scrollbackMapRef} subscribeScrollback={subscribeScrollback} onRequestScrollback={onRequestScrollback} onData={onSendData} onResize={onResize} />
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <ChatInput onSendText={onSendText} onSendKey={onSendKey} />
      </div>
    </div>
  );
}
