import React, { useState, useCallback, useRef } from "react";
import type { SessionInfo } from "@blkcat/shared";
import type { OutputLine } from "../hooks/useSocket";
import { useSessionOutput } from "../hooks/useSessionOutput";
import { TerminalOutput } from "./TerminalOutput";
import { ChatInput } from "./ChatInput";

interface SplitViewProps {
  machineId: string;
  panes: SessionInfo[];
  isMobile: boolean;
  outputMapRef: React.RefObject<Map<string, OutputLine>>;
  subscribeOutput: (cb: (key: string) => void) => () => void;
  logMapRef: React.RefObject<Map<string, string[]>>;
  scrollbackMapRef: React.RefObject<Map<string, string[]>>;
  subscribeScrollback: (cb: (key: string) => void) => () => void;
  onRequestScrollback: (machineId: string, sessionId: string) => void;
  onSendInput: (machineId: string, sessionId: string, opts: { text?: string; key?: string; data?: string }) => void;
  onSendResize: (machineId: string, sessionId: string, cols: number, rows: number, force?: boolean) => void;
  getSessionName: (machineId: string, sessionId: string, defaultName: string) => string;
}

function SplitPane({
  machineId,
  pane,
  isFocused,
  onFocus,
  outputMapRef,
  subscribeOutput,
  logMapRef,
  scrollbackMapRef,
  subscribeScrollback,
  onRequestScrollback,
  onSendData,
  onSendResize,
  sessionName,
}: {
  machineId: string;
  pane: SessionInfo;
  isFocused: boolean;
  onFocus: () => void;
  outputMapRef: React.RefObject<Map<string, OutputLine>>;
  subscribeOutput: (cb: (key: string) => void) => () => void;
  logMapRef: React.RefObject<Map<string, string[]>>;
  scrollbackMapRef: React.RefObject<Map<string, string[]>>;
  subscribeScrollback: (cb: (key: string) => void) => () => void;
  onRequestScrollback: () => void;
  onSendData: (data: string) => void;
  onSendResize: (cols: number, rows: number, force?: boolean) => void;
  sessionName: string;
}) {
  const output = useSessionOutput(outputMapRef, subscribeOutput, machineId, pane.id);

  return (
    <div
      onClick={onFocus}
      style={{
        flex: 1,
        minWidth: 0,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        outline: isFocused ? "1px solid var(--accent)" : "1px solid transparent",
        outlineOffset: -1,
      }}
    >
      <div
        style={{
          padding: "4px 12px",
          fontSize: 12,
          background: isFocused ? "var(--bg-secondary)" : "var(--bg)",
          borderBottom: "1px solid var(--border)",
          color: isFocused ? "var(--text)" : "var(--text-muted)",
          fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {sessionName}
      </div>
      <TerminalOutput
        sessionKey={`${machineId}:${pane.id}`}
        lines={output.lines}
        cursor={output.cursor}
        logMapRef={logMapRef}
        scrollbackMapRef={scrollbackMapRef}
        subscribeScrollback={subscribeScrollback}
        onRequestScrollback={onRequestScrollback}
        onData={onSendData}
        onResize={onSendResize}
      />
    </div>
  );
}

export function SplitView({
  machineId,
  panes,
  isMobile,
  outputMapRef,
  subscribeOutput,
  logMapRef,
  scrollbackMapRef,
  subscribeScrollback,
  onRequestScrollback,
  onSendInput,
  onSendResize,
  getSessionName,
}: SplitViewProps) {
  const [focusedPaneId, setFocusedPaneId] = useState(panes[0]?.id);
  // Cache input text per pane
  const inputCacheRef = useRef(new Map<string, string>());

  // Ensure focusedPaneId is valid
  const activePaneId = panes.find((p) => p.id === focusedPaneId)?.id ?? panes[0]?.id;

  const handleSendText = useCallback((text: string) => {
    if (activePaneId) onSendInput(machineId, activePaneId, { text });
  }, [machineId, activePaneId, onSendInput]);

  const handleSendKey = useCallback((key: string) => {
    if (activePaneId) onSendInput(machineId, activePaneId, { key });
  }, [machineId, activePaneId, onSendInput]);

  const handleSendData = useCallback((data: string) => {
    if (activePaneId) onSendInput(machineId, activePaneId, { data });
  }, [machineId, activePaneId, onSendInput]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          flex: 1,
          minHeight: 0,
        }}
      >
        {panes.map((pane, i) => (
          <React.Fragment key={pane.id}>
            {i > 0 && (
              <div
                style={{
                  width: isMobile ? undefined : 2,
                  height: isMobile ? 2 : undefined,
                  background: "var(--border)",
                  flexShrink: 0,
                }}
              />
            )}
            <SplitPane
              machineId={machineId}
              pane={pane}
              isFocused={pane.id === activePaneId}
              onFocus={() => {
                // Cache current input before switching
                setFocusedPaneId(pane.id);
              }}
              outputMapRef={outputMapRef}
              subscribeOutput={subscribeOutput}
              logMapRef={logMapRef}
              scrollbackMapRef={scrollbackMapRef}
              subscribeScrollback={subscribeScrollback}
              onRequestScrollback={() => onRequestScrollback(machineId, pane.id)}
              onSendData={(data) => onSendInput(machineId, pane.id, { data })}
              onSendResize={(cols, rows, force) => onSendResize(machineId, pane.id, cols, rows, force)}
              sessionName={getSessionName(machineId, pane.id, pane.windowName ?? pane.name)}
            />
          </React.Fragment>
        ))}
      </div>
      <div style={{ borderTop: "1px solid var(--border)", flexShrink: 0, overflowY: "auto", maxHeight: "40vh" }}>
        <ChatInput
          key={activePaneId}
          onSendText={handleSendText}
          onSendKey={handleSendKey}
          onSendData={handleSendData}
          initialValue={inputCacheRef.current.get(activePaneId ?? "") ?? ""}
          onInputChange={(value) => {
            if (activePaneId) inputCacheRef.current.set(activePaneId, value);
          }}
        />
      </div>
    </div>
  );
}
