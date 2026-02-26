import React, { useState, useCallback, useRef, useEffect } from "react";
import type { MachineSnapshot, View, ViewPane } from "@blkcat/shared";
import type { OutputLine } from "../hooks/useSocket";
import { useSessionOutput } from "../hooks/useSessionOutput";
import { TerminalOutput } from "./TerminalOutput";
import type { TerminalOutputHandle } from "./TerminalOutput";
import { FloatingChatInput } from "./FloatingChatInput";
import { X, Maximize } from "./Icons";

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
  /** Ref callback for direct pane cycling from keyboard shortcuts (bypasses App re-render) */
  cyclePaneRef?: React.MutableRefObject<((delta: number) => void) | undefined>;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<TerminalOutputHandle>(null);

  useEffect(() => {
    if (!isFocused) return;
    const timer = setTimeout(() => {
      const textarea = containerRef.current?.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null;
      if (textarea) textarea.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [isFocused]);

  return (
    <div
      ref={containerRef}
      onMouseDownCapture={onFocus}
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
          background: isFocused ? "color-mix(in srgb, var(--accent) 12%, var(--bg-secondary))" : "var(--bg)",
          borderBottom: isFocused ? "2px solid var(--accent)" : "2px solid var(--border)",
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
          onClick={(e) => { e.stopPropagation(); termRef.current?.forceFit(); }}
          title="Force resize terminal"
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
          onMouseEnter={(e) => { (e.target as HTMLElement).style.opacity = "1"; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = "0.5"; }}
        >
          <Maximize size={10} />
        </button>
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
          ref={termRef}
          sessionKey={`${machineId}:${sessionId}`}
          lines={output.lines}
          cursor={output.cursor}
          logMapRef={logMapRef}
          scrollbackMapRef={scrollbackMapRef}
          subscribeScrollback={subscribeScrollback}
          onRequestScrollback={onRequestScrollback}
          onData={onSendData}
          onResize={onSendResize}
          hideFloatingButtons
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
  cyclePaneRef,
}: CrossMachineSplitViewProps) {
  const firstPane = view.panes[0];
  const [focusedKey, setFocusedKey] = useState(firstPane ? `${firstPane.machineId}:${firstPane.sessionId}` : "");
  const focusedKeyRef = useRef(focusedKey);
  focusedKeyRef.current = focusedKey;

  // Sync focus when requested externally (e.g. sidebar click)
  // Uses focusSeq as trigger so repeated clicks on the same session still work
  useEffect(() => {
    if (focusSessionKey) {
      setFocusedKey(focusSessionKey);
    }
  }, [focusSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputCacheRef = useRef(new Map<string, string>());
  const dragRef = useRef<number | null>(null);
  const dropTargetRef = useRef<number | null>(null);
  const paneRefsMap = useRef<Map<number, HTMLDivElement>>(new Map());
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const viewPanesRef = useRef(view.panes);
  viewPanesRef.current = view.panes;

  // Find the focused pane (or fall back to first)
  const activePane = view.panes.find((p) => `${p.machineId}:${p.sessionId}` === focusedKey) ?? view.panes[0];
  const activeKey = activePane ? `${activePane.machineId}:${activePane.sessionId}` : "";

  // Expose direct pane cycling via ref (bypasses App re-render)
  useEffect(() => {
    if (!cyclePaneRef) return;
    cyclePaneRef.current = (delta: number) => {
      const panes = viewPanesRef.current;
      if (panes.length === 0) return;
      const currentKey = focusedKeyRef.current;
      const idx = currentKey ? panes.findIndex((p) => `${p.machineId}:${p.sessionId}` === currentKey) : -1;
      const next = (idx + delta + panes.length) % panes.length;
      const pane = panes[next];
      setFocusedKey(`${pane.machineId}:${pane.sessionId}`);
    };
    return () => { cyclePaneRef.current = undefined; };
  }, [cyclePaneRef]);

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
      ref={splitContainerRef}
      style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, minWidth: 0, position: "relative" }}
      onDragOver={(e) => {
        // Internal pane drag — always allow drop everywhere to prevent forbidden cursor
        if (dragRef.current !== null) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          return;
        }
        // External drop from sidebar
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
                ref={(el) => { if (el) paneRefsMap.current.set(i, el); else paneRefsMap.current.delete(i); }}
                draggable
                onDragStart={(e) => {
                  dragRef.current = i;
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", key);
                  // Use 1x1 transparent image instead of browser screenshotting
                  // the entire pane (with terminal canvas) — that's extremely expensive
                  const img = new Image();
                  img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
                  e.dataTransfer.setDragImage(img, 0, 0);
                  splitContainerRef.current?.classList.add("split-dragging");
                }}
                onDragOver={(e) => {
                  // Always preventDefault during internal drag to prevent forbidden cursor
                  if (dragRef.current !== null) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dragRef.current !== i && dropTargetRef.current !== i) {
                      // Clear previous target highlight
                      if (dropTargetRef.current !== null) {
                        paneRefsMap.current.get(dropTargetRef.current)?.classList.remove("pane-swap-target");
                      }
                      dropTargetRef.current = i;
                      paneRefsMap.current.get(i)?.classList.add("pane-swap-target");
                    }
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
                  splitContainerRef.current?.classList.remove("split-dragging");
                  // Clear highlight
                  if (dropTargetRef.current !== null) {
                    paneRefsMap.current.get(dropTargetRef.current)?.classList.remove("pane-swap-target");
                  }
                  dropTargetRef.current = null;
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
                  splitContainerRef.current?.classList.remove("split-dragging");
                  dragRef.current = null;
                  if (dropTargetRef.current !== null) {
                    paneRefsMap.current.get(dropTargetRef.current)?.classList.remove("pane-swap-target");
                    dropTargetRef.current = null;
                  }
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
      <FloatingChatInput
        inputKey={activeKey}
        onSendText={handleSendText}
        onSendKey={handleSendKey}
        onSendData={handleSendData}
        initialValue={inputCacheRef.current.get(activeKey) ?? ""}
        onInputChange={(value) => {
          if (activeKey) inputCacheRef.current.set(activeKey, value);
        }}
      />
    </div>
  );
}
