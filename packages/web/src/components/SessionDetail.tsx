import React, { useState, useCallback } from "react";
import { TerminalOutput } from "./TerminalOutput";
import { FloatingChatInput } from "./FloatingChatInput";
import { Folder } from "./Icons";
import { useKeyboardOffset } from "../hooks/useKeyboardOffset";

interface SessionDetailProps {
  machineId: string;
  sessionId: string;
  sessionName: string;
  cwd?: string;
  lines: string[];
  cursor?: { x: number; y: number };
  logMapRef?: React.RefObject<Map<string, string[]>>;
  scrollbackMapRef?: React.RefObject<Map<string, string[]>>;
  subscribeScrollback?: (cb: (key: string) => void) => () => void;
  onRequestScrollback?: () => void;
  onSendText: (text: string) => void;
  onSendKey: (key: string) => void;
  onSendData: (data: string) => void;
  onResize?: (cols: number, rows: number, force?: boolean) => void;
}

export function SessionDetail({
  machineId,
  sessionId,
  sessionName,
  cwd,
  lines,
  cursor,
  logMapRef,
  scrollbackMapRef,
  subscribeScrollback,
  onRequestScrollback,
  onSendText,
  onSendKey,
  onSendData,
  onResize,
}: SessionDetailProps) {
  const displayCwd = cwd?.replace(/^\/home\/[^/]+/, "~")?.replace(/^\/root/, "~");
  const keyboardOffset = useKeyboardOffset();
  const [obscuredHeight, setObscuredHeight] = useState(0);
  const onObscuredHeight = useCallback((h: number) => setObscuredHeight(h), []);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" }}>
      <div
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-secondary)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          overflow: "hidden",
          fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
        }}
      >
        <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{sessionName}</span>
        <span style={{ color: "var(--text-muted)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {machineId} / {sessionId}
        </span>
        {displayCwd && (
          <>
            <span style={{ color: "var(--border)", fontSize: 12 }}>|</span>
            <span style={{ color: "var(--text-muted)", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
              <Folder size={12} />
              {displayCwd}
            </span>
          </>
        )}
      </div>
      <TerminalOutput
        sessionKey={`${machineId}:${sessionId}`}
        lines={lines}
        cursor={cursor}
        logMapRef={logMapRef}
        scrollbackMapRef={scrollbackMapRef}
        subscribeScrollback={subscribeScrollback}
        onRequestScrollback={onRequestScrollback}
        onData={onSendData}
        onResize={onResize}
        inputObscuredHeight={obscuredHeight}
      />
      <FloatingChatInput
        inputKey={`${machineId}:${sessionId}`}
        onSendText={onSendText}
        onSendKey={onSendKey}
        onSendData={onSendData}
        keyboardOffset={keyboardOffset}
        onObscuredHeight={onObscuredHeight}
      />
    </div>
  );
}
