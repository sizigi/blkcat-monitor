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

  // Scroll mode: we manage the offset ourselves instead of relying on
  // xterm's scrollback buffer (which has async/race issues with term.write).
  // scrollOffset = 0 means "show the end (most recent)", positive means
  // "N lines scrolled up from the bottom".
  const scrollOffsetRef = useRef(0);
  const scrollAllRef = useRef<string[]>([]);

  /** Render a window of `scrollAllRef` at the current offset into the terminal. */
  const renderScrollView = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    const all = scrollAllRef.current;
    const rows = term.rows;
    // offset=0 → show last `rows` lines; offset=N → shift window up by N
    const end = all.length - scrollOffsetRef.current;
    const start = Math.max(0, end - rows);
    const slice = all.slice(start, end);
    term.write("\x1b[H\x1b[2J" + slice.join("\r\n"));
  }, []);

  const enterScrollMode = useCallback(() => {
    const term = termRef.current;
    if (!term || scrollModeRef.current) return;
    scrollModeRef.current = true;
    setScrollMode(true);
    const log = logMapRefRef.current?.current?.get(sessionKeyRef.current ?? "") || [];
    const all = [...log, ...prevLinesRef.current];
    scrollAllRef.current = all;
    scrollOffsetRef.current = 0;
    // Disable xterm scrollback so our own scroll management isn't confused
    term.options.scrollback = 0;
    term.clear();
    renderScrollView();
  }, [renderScrollView]);

  const exitScrollMode = useCallback(() => {
    const term = termRef.current;
    if (!term || !scrollModeRef.current) return;
    scrollModeRef.current = false;
    setScrollMode(false);
    scrollAllRef.current = [];
    scrollOffsetRef.current = 0;
    // Restore scrollback (not used in live mode but reset to default)
    term.options.scrollback = 5000;
    term.clear();
    const latest = pendingLinesRef.current || prevLinesRef.current;
    pendingLinesRef.current = null;
    term.write("\x1b[H\x1b[2J" + latest.join("\r\n"));
    term.focus();
  }, []);

  const scrollNav = useCallback((action: "pageUp" | "pageDown" | "top" | "bottom" | "lineUp" | "lineDown") => {
    const term = termRef.current;
    if (!term || !scrollModeRef.current) return;
    const all = scrollAllRef.current;
    const rows = term.rows;
    const maxOffset = Math.max(0, all.length - rows);

    switch (action) {
      case "pageUp":
        scrollOffsetRef.current = Math.min(maxOffset, scrollOffsetRef.current + rows);
        break;
      case "pageDown":
        scrollOffsetRef.current = Math.max(0, scrollOffsetRef.current - rows);
        break;
      case "lineUp":
        scrollOffsetRef.current = Math.min(maxOffset, scrollOffsetRef.current + 1);
        break;
      case "lineDown":
        scrollOffsetRef.current = Math.max(0, scrollOffsetRef.current - 1);
        break;
      case "top":
        scrollOffsetRef.current = maxOffset;
        break;
      case "bottom":
        scrollOffsetRef.current = 0;
        break;
    }
    renderScrollView();
  }, [renderScrollView]);

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

    // Keyboard shortcuts for scroll mode
    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;

      // Shift+PageUp: enter scroll mode and immediately page up
      if (!scrollModeRef.current && event.shiftKey && event.key === "PageUp") {
        enterScrollMode();
        // Now page up one screen from the bottom
        scrollNav("pageUp");
        return false; // We handle it ourselves
      }

      if (scrollModeRef.current) {
        // Exit on Escape or q
        if (event.key === "Escape" || event.key === "q") {
          exitScrollMode();
          return false;
        }
        // Navigation keys — we handle them ourselves
        if (event.key === "PageUp") { scrollNav("pageUp"); return false; }
        if (event.key === "PageDown") { scrollNav("pageDown"); return false; }
        if (event.key === "ArrowUp") { scrollNav("lineUp"); return false; }
        if (event.key === "ArrowDown") { scrollNav("lineDown"); return false; }
        if (event.key === "Home") { scrollNav("top"); return false; }
        if (event.key === "End") { scrollNav("bottom"); return false; }
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
    scrollOffsetRef.current = 0;
    scrollAllRef.current = [];
    setScrollMode(false);
    term.options.scrollback = 5000;
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
