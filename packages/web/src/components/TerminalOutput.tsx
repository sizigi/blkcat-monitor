import React, { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalOutputProps {
  sessionKey?: string;
  lines: string[];
  logMapRef?: React.RefObject<Map<string, string[]>>;
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

export function TerminalOutput({ sessionKey, lines, logMapRef, onData, onResize }: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const prevLinesRef = useRef<string[]>([]);
  const pendingLinesRef = useRef<string[] | null>(null);
  const scrollModeRef = useRef(false);
  const [scrollMode, setScrollMode] = useState(false);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const sessionKeyRef = useRef(sessionKey);
  sessionKeyRef.current = sessionKey;
  const logMapRefRef = useRef(logMapRef);
  logMapRefRef.current = logMapRef;

  const enterScrollMode = useCallback(() => {
    const term = termRef.current;
    if (!term || scrollModeRef.current) return;
    scrollModeRef.current = true;
    setScrollMode(true);
    const log = logMapRefRef.current?.current?.get(sessionKeyRef.current ?? "") || [];
    term.clear();
    const all = [...log, ...prevLinesRef.current];
    // Use write callback to scroll after content is flushed
    term.write("\x1b[H\x1b[2J" + all.join("\r\n"), () => {
      term.scrollToTop();
    });
  }, []);

  const exitScrollMode = useCallback(() => {
    const term = termRef.current;
    if (!term || !scrollModeRef.current) return;
    scrollModeRef.current = false;
    setScrollMode(false);
    term.clear();
    const latest = pendingLinesRef.current || prevLinesRef.current;
    pendingLinesRef.current = null;
    term.write("\x1b[H\x1b[2J" + latest.join("\r\n"));
    term.focus();
  }, []);

  const scrollNav = useCallback((action: "pageUp" | "pageDown" | "top" | "bottom") => {
    const term = termRef.current;
    if (!term || !scrollModeRef.current) return;
    switch (action) {
      case "pageUp": term.scrollLines(-term.rows); break;
      case "pageDown": term.scrollLines(term.rows); break;
      case "top": term.scrollToTop(); break;
      case "bottom": term.scrollToBottom(); break;
    }
    term.focus();
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      disableStdin: !onData,
      convertEol: true,
      cursorBlink: !!onData,
      scrollback: 5000,
      theme: {
        background: "#0d1117",
        foreground: "#c9d1d9",
        cursor: "#c9d1d9",
      },
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', monospace",
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();

    termRef.current = term;
    fitRef.current = fit;

    // Subscribe once to terminal input with a stable wrapper. The actual
    // callback is read from onDataRef so it always calls the latest prop
    // without re-subscribing (which would drop keystrokes between dispose
    // and re-register since React effects run after paint).
    const dataDisposable = term.onData((data) => { onDataRef.current?.(data); });

    // When user clears selection, flush any deferred terminal updates
    const selDisposable = term.onSelectionChange(() => {
      if (!term.hasSelection() && !scrollModeRef.current && pendingLinesRef.current) {
        const deferred = pendingLinesRef.current;
        pendingLinesRef.current = null;
        prevLinesRef.current = deferred;
        term.write("\x1b[H\x1b[2J" + deferred.join("\r\n"));
      }
    });

    // Keyboard shortcuts for scroll mode (like byobu F7 / tmux copy-mode)
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;

      // Shift+PageUp: enter scroll mode
      if (!scrollModeRef.current && event.shiftKey && event.key === "PageUp") {
        enterScrollMode();
        // Let xterm handle the PageUp to scroll up
        return true;
      }

      // Escape or q: exit scroll mode
      if (scrollModeRef.current && (event.key === "Escape" || event.key === "q")) {
        exitScrollMode();
        return false;
      }

      // In scroll mode, block input keys from reaching the session
      // but allow navigation keys (PageUp/Down, arrows, Home/End)
      if (scrollModeRef.current) {
        const nav = ["PageUp", "PageDown", "ArrowUp", "ArrowDown", "Home", "End"];
        if (nav.includes(event.key)) return true;
        // Block everything else (typing, enter, etc.)
        return false;
      }

      return true;
    });

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        onResizeRef.current?.(term.cols, term.rows);
      }, 300);
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      dataDisposable.dispose();
      selDisposable.dispose();
      term.dispose();
    };
  }, []);

  // Reset terminal display when switching sessions.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    prevLinesRef.current = [];
    pendingLinesRef.current = null;
    scrollModeRef.current = false;
    setScrollMode(false);
    term.clear();
    term.write("\x1b[H\x1b[2J");
  }, [sessionKey]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (lines === prevLinesRef.current) return;

    prevLinesRef.current = lines;

    // In scroll mode, queue updates but don't redraw (user is browsing history).
    if (scrollModeRef.current) {
      pendingLinesRef.current = lines;
      return;
    }

    // If the user has text selected, defer the redraw.
    if (term.hasSelection()) {
      pendingLinesRef.current = lines;
      return;
    }

    // Live mode: clear and redraw the current viewport snapshot.
    term.write("\x1b[H\x1b[2J" + lines.join("\r\n"));
  }, [lines]);

  const hasLog = logMapRef?.current?.has(sessionKey ?? "") ?? false;

  // Prevent mousedown on toolbar buttons from stealing focus from the terminal
  const pd = useCallback((e: React.MouseEvent) => e.preventDefault(), []);

  const btnStyle: React.CSSProperties = {
    background: "none",
    border: "1px solid rgba(255,255,255,0.2)",
    color: "#fff",
    cursor: "pointer",
    borderRadius: 3,
    padding: "2px 6px",
    fontSize: 13,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 26,
  };

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <div
        ref={containerRef}
        style={{ height: "100%", background: "#0d1117" }}
      />
      {/* Scroll mode toolbar */}
      {scrollMode ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 8px",
            background: "rgba(255, 200, 0, 0.9)",
            color: "#000",
            fontSize: 11,
            fontWeight: 600,
            borderBottomLeftRadius: 4,
            zIndex: 10,
          }}
        >
          <span>SCROLL</span>
          <button onMouseDown={pd} onClick={() => scrollNav("top")} style={{ ...btnStyle, color: "#000", borderColor: "rgba(0,0,0,0.3)" }} title="Top">&#8607;</button>
          <button onMouseDown={pd} onClick={() => scrollNav("pageUp")} style={{ ...btnStyle, color: "#000", borderColor: "rgba(0,0,0,0.3)" }} title="Page Up">&#8679;</button>
          <button onMouseDown={pd} onClick={() => scrollNav("pageDown")} style={{ ...btnStyle, color: "#000", borderColor: "rgba(0,0,0,0.3)" }} title="Page Down">&#8681;</button>
          <button onMouseDown={pd} onClick={() => scrollNav("bottom")} style={{ ...btnStyle, color: "#000", borderColor: "rgba(0,0,0,0.3)" }} title="Bottom">&#8609;</button>
          <button onMouseDown={pd} onClick={exitScrollMode} style={{ ...btnStyle, color: "#000", borderColor: "rgba(0,0,0,0.3)", fontWeight: 700, fontSize: 12 }} title="Exit scroll mode (Esc)">&#10005;</button>
        </div>
      ) : (
        /* Enter scroll mode button — only show when there's log history */
        (hasLog || lines.length > 0) && (
          <button
            onMouseDown={pd}
            onClick={enterScrollMode}
            title="Scroll history (Shift+PageUp)"
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              ...btnStyle,
              background: "rgba(255,255,255,0.08)",
              padding: "3px 7px",
              fontSize: 14,
              opacity: 0.4,
              zIndex: 10,
              transition: "opacity 0.15s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.9"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.4"; }}
          >
            &#8597;
          </button>
        )
      )}
    </div>
  );
}
