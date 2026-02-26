import React, { useState, useCallback, useRef, useEffect } from "react";
import type { MachineSnapshot, View, ViewPane } from "@blkcat/shared";
import type { OutputLine } from "../hooks/useSocket";
import { useSessionOutput } from "../hooks/useSessionOutput";
import { TerminalOutput } from "./TerminalOutput";
import { ChatInput } from "./ChatInput";
import { X } from "./Icons";

interface CrossMachineSplitViewProps {
  view: View;
  machines: MachineSnapshot[];
  isMobile: boolean;
  outputMapRef: React.RefObject<Map<string, OutputLine>>;
  subscribeOutput: (cb: (key: string) => void) => () => void;
  logMapRef: React.RefObject<Map<string, string[]>>;
  scrollbackMapRef: React.RefObject<Map<string, string[]>>;
  subscribeScrollback: (cb: (key: string) => void) => () => void;
  onRequestScrollback: (machineId: string, sessionId: string) => void;
  onSendInput: (machineId: string, sessionId: string, opts: { text?: string; key?: string; data?: string }) => void;
  onSendResize: (machineId: string, sessionId: string, cols: number, rows: number, force?: boolean) => void;
  getMachineName: (machineId: string) => string;
  getSessionName: (machineId: string, sessionId: string, defaultName: string) => string;
  onUpdateView: (id: string, name?: string, panes?: ViewPane[]) => void;
  /** When set, focus this pane (format: "machineId:sessionId") */
  focusSessionKey?: string;
  /** Incrementing counter — each change triggers a focus update */
  focusSeq?: number;
}

function ViewPane({
  machineId,
  sessionId,
  isFocused,
  available,
  onFocus,
  outputMapRef,
  subscribeOutput,
  logMapRef,
  scrollbackMapRef,
  subscribeScrollback,
  onRequestScrollback,
  onSendData,
  onSendResize,
  machineName,
  sessionName,
  onRemove,
}: {
  machineId: string;
  sessionId: string;
  isFocused: boolean;
  available: boolean;
  onFocus: () => void;
  outputMapRef: React.RefObject<Map<string, OutputLine>>;
  subscribeOutput: (cb: (key: string) => void) => () => void;
  logMapRef: React.RefObject<Map<string, string[]>>;
  scrollbackMapRef: React.RefObject<Map<string, string[]>>;
  subscribeScrollback: (cb: (key: string) => void) => () => void;
  onRequestScrollback: () => void;
  onSendData: (data: string) => void;
  onSendResize: (cols: number, rows: number, force?: boolean) => void;
  machineName: string;
  sessionName: string;
  onRemove: () => void;
}) {
  const output = useSessionOutput(outputMapRef, subscribeOutput, machineId, sessionId);

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
          padding: "3px 12px",
          fontSize: 11,
          background: isFocused ? "var(--bg-secondary)" : "var(--bg)",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
        }}
      >
        <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
          <div style={{ color: "var(--text-muted)", fontSize: 10, lineHeight: 1.3 }}>{machineName}</div>
          <div style={{
            color: isFocused ? "var(--text)" : "var(--text-muted)",
            fontSize: 12,
            lineHeight: 1.3,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {sessionName}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          title="Remove from view"
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: 2,
            lineHeight: 1,
            opacity: 0.5,
            flexShrink: 0,
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; (e.target as HTMLElement).style.color = "var(--red)"; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.5"; (e.target as HTMLElement).style.color = "var(--text-muted)"; }}
        >
          <X size={10} />
        </button>
      </div>
      {available ? (
        <TerminalOutput
          sessionKey={`${machineId}:${sessionId}`}
          lines={output.lines}
          cursor={output.cursor}
          logMapRef={logMapRef}
          scrollbackMapRef={scrollbackMapRef}
          subscribeScrollback={subscribeScrollback}
          onRequestScrollback={onRequestScrollback}
          onData={onSendData}
          onResize={onSendResize}
        />
      ) : (
        <div style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: 13,
          background: "var(--bg)",
        }}>
          Session unavailable
        </div>
      )}
    </div>
  );
}

export function CrossMachineSplitView({
  view,
  machines,
  isMobile,
  outputMapRef,
  subscribeOutput,
  logMapRef,
  scrollbackMapRef,
  subscribeScrollback,
  onRequestScrollback,
  onSendInput,
  onSendResize,
  getMachineName,
  getSessionName,
  onUpdateView,
  focusSessionKey,
  focusSeq,
}: CrossMachineSplitViewProps) {
  const firstPane = view.panes[0];
  const [focusedKey, setFocusedKey] = useState(firstPane ? `${firstPane.machineId}:${firstPane.sessionId}` : "");

  // Sync focus when requested externally (e.g. sidebar click)
  // Uses focusSeq as trigger so repeated clicks on the same session still work
  useEffect(() => {
    if (focusSessionKey) {
      setFocusedKey(focusSessionKey);
    }
  }, [focusSeq]); // eslint-disable-line react-hooks/exhaustive-deps
  const inputCacheRef = useRef(new Map<string, string>());
  const dragRef = useRef<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);

  // Find the focused pane (or fall back to first)
  const activePane = view.panes.find((p) => `${p.machineId}:${p.sessionId}` === focusedKey) ?? view.panes[0];
  const activeKey = activePane ? `${activePane.machineId}:${activePane.sessionId}` : "";

  // Check if a session is available (machine connected and session exists)
  const isAvailable = (machineId: string, sessionId: string) => {
    const machine = machines.find((m) => m.machineId === machineId);
    return !!machine?.sessions.some((s) => s.id === sessionId);
  };

  // Resolve session name
  const resolveSessionName = (machineId: string, sessionId: string) => {
    const machine = machines.find((m) => m.machineId === machineId);
    const session = machine?.sessions.find((s) => s.id === sessionId);
    if (!session) return sessionId;
    return getSessionName(machineId, sessionId, session.windowName ?? session.name);
  };

  const handleSendText = useCallback((text: string) => {
    if (activePane) onSendInput(activePane.machineId, activePane.sessionId, { text });
  }, [activePane, onSendInput]);

  const handleSendKey = useCallback((key: string) => {
    if (activePane) onSendInput(activePane.machineId, activePane.sessionId, { key });
  }, [activePane, onSendInput]);

  const handleSendData = useCallback((data: string) => {
    if (activePane) onSendInput(activePane.machineId, activePane.sessionId, { data });
  }, [activePane, onSendInput]);

  const handleRemovePane = (index: number) => {
    const newPanes = [...view.panes];
    newPanes.splice(index, 1);
    onUpdateView(view.id, undefined, newPanes);
  };

  // Drop handler for adding sessions from sidebar
  const handleContainerDrop = (e: React.DragEvent) => {
    const data = e.dataTransfer.getData("application/x-blkcat-session");
    if (!data) return;
    e.preventDefault();
    const { machineId, sessionId } = JSON.parse(data);
    const alreadyExists = view.panes.some((p) => p.machineId === machineId && p.sessionId === sessionId);
    if (!alreadyExists) {
      onUpdateView(view.id, undefined, [...view.panes, { machineId, sessionId }]);
    }
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0 }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("application/x-blkcat-session")) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={handleContainerDrop}
    >
      <div
        style={{
          display: "flex",
          flexDirection: isMobile ? "column" : "row",
          flex: 1,
          minHeight: 0,
          minWidth: 0,
        }}
      >
        {view.panes.map((pane, i) => {
          const key = `${pane.machineId}:${pane.sessionId}`;
          const available = isAvailable(pane.machineId, pane.sessionId);
          const isSwapTarget = dropTarget === i && dragRef.current !== null && dragRef.current !== i;
          return (
            <React.Fragment key={key}>
              {i > 0 && (
                <div style={{
                  width: isMobile ? undefined : 2,
                  height: isMobile ? 2 : undefined,
                  background: "var(--border)",
                  flexShrink: 0,
                }} />
              )}
              <div
                draggable
                onDragStart={(e) => {
                  dragRef.current = i;
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", key);
                }}
                onDragEnter={(e) => {
                  if (dragRef.current !== null && dragRef.current !== i) e.preventDefault();
                  if (e.dataTransfer.types.includes("application/x-blkcat-session")) e.preventDefault();
                }}
                onDragOver={(e) => {
                  // Internal reorder
                  if (dragRef.current !== null && dragRef.current !== i) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = "move";
                    if (dropTarget !== i) setDropTarget(i);
                    return;
                  }
                  // External drop from sidebar
                  if (e.dataTransfer.types.includes("application/x-blkcat-session")) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDropTarget(null);
                  // Internal swap
                  const from = dragRef.current;
                  if (from !== null && from !== i) {
                    const newPanes = [...view.panes];
                    [newPanes[from], newPanes[i]] = [newPanes[i], newPanes[from]];
                    dragRef.current = null;
                    onUpdateView(view.id, undefined, newPanes);
                    return;
                  }
                  // External add from sidebar
                  const data = e.dataTransfer.getData("application/x-blkcat-session");
                  if (data) {
                    const { machineId, sessionId } = JSON.parse(data);
                    if (!view.panes.some((p) => p.machineId === machineId && p.sessionId === sessionId)) {
                      onUpdateView(view.id, undefined, [...view.panes, { machineId, sessionId }]);
                    }
                  }
                }}
                onDragEnd={() => {
                  dragRef.current = null;
                  setDropTarget(null);
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                }}
              >
                {isSwapTarget && (
                  <div style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(88,166,255,0.15)",
                    border: "2px solid var(--accent)",
                    zIndex: 10,
                    pointerEvents: "none",
                  }} />
                )}
                <ViewPane
                  machineId={pane.machineId}
                  sessionId={pane.sessionId}
                  isFocused={key === activeKey}
                  available={available}
                  onFocus={() => setFocusedKey(key)}
                  outputMapRef={outputMapRef}
                  subscribeOutput={subscribeOutput}
                  logMapRef={logMapRef}
                  scrollbackMapRef={scrollbackMapRef}
                  subscribeScrollback={subscribeScrollback}
                  onRequestScrollback={() => onRequestScrollback(pane.machineId, pane.sessionId)}
                  onSendData={(data) => onSendInput(pane.machineId, pane.sessionId, { data })}
                  onSendResize={(cols, rows, force) => onSendResize(pane.machineId, pane.sessionId, cols, rows, force)}
                  machineName={getMachineName(pane.machineId)}
                  sessionName={resolveSessionName(pane.machineId, pane.sessionId)}
                  onRemove={() => handleRemovePane(i)}
                />
              </div>
            </React.Fragment>
          );
        })}
      </div>
      <div style={{ borderTop: "1px solid var(--border)", flexShrink: 0, overflowY: "auto", maxHeight: "40vh" }}>
        <ChatInput
          key={activeKey}
          onSendText={handleSendText}
          onSendKey={handleSendKey}
          onSendData={handleSendData}
          initialValue={inputCacheRef.current.get(activeKey) ?? ""}
          onInputChange={(value) => {
            if (activeKey) inputCacheRef.current.set(activeKey, value);
          }}
        />
      </div>
    </div>
  );
}
