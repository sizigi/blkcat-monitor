import React, { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalOutputProps {
  sessionKey?: string;
  lines: string[];
  logMapRef?: React.RefObject<Map<string, string[]>>;
  scrollbackMapRef?: React.RefObject<Map<string, string[]>>;
  subscribeScrollback?: (cb: (key: string) => void) => () => void;
  onRequestScrollback?: () => void;
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

export function TerminalOutput({ sessionKey, lines, logMapRef, scrollbackMapRef, subscribeScrollback, onRequestScrollback, onData, onResize }: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const prevLinesRef = useRef<string[]>([]);
  const pendingLinesRef = useRef<string[] | null>(null);
  const scrollModeRef = useRef(false);
  const [scrollMode, setScrollMode] = useState(false);
  const [scrollInfo, setScrollInfo] = useState("");
  const [scrollbackLoading, setScrollbackLoading] = useState(false);
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const sessionKeyRef = useRef(sessionKey);
  sessionKeyRef.current = sessionKey;
  const logMapRefRef = useRef(logMapRef);
  logMapRefRef.current = logMapRef;
  const scrollbackMapRefRef = useRef(scrollbackMapRef);
  scrollbackMapRefRef.current = scrollbackMapRef;
  const onRequestScrollbackRef = useRef(onRequestScrollback);
  onRequestScrollbackRef.current = onRequestScrollback;

  // Scroll mode state: offset into the full log array.
  // offset=0 → bottom (most recent), positive → scrolled up N lines.
  const scrollOffsetRef = useRef(0);
  const scrollAllRef = useRef<string[]>([]);

  /** Render the visible window of the scroll buffer using cursor positioning. */
  const renderScrollView = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    const all = scrollAllRef.current;
    const rows = term.rows;
    const cols = term.cols;
    const end = all.length - scrollOffsetRef.current;
    const start = Math.max(0, end - rows);
    const slice = all.slice(start, end);

    // Build output using absolute cursor positioning per row.
    // Truncate each line to terminal width to prevent wrapping issues.
    let buf = "\x1b[2J"; // clear screen
    for (let i = 0; i < rows; i++) {
      buf += `\x1b[${i + 1};1H`; // move to row i+1, col 1
      if (i < slice.length) {
        buf += slice[i];
      }
      buf += "\x1b[K"; // clear to end of line
    }
    term.write(buf);

    // Update position indicator
    const total = all.length;
    const pos = total > 0 ? Math.max(1, start + 1) : 0;
    const endPos = Math.min(total, start + slice.length);
    setScrollInfo(total > 0 ? `${pos}-${endPos} / ${total}` : "empty");
  }, []);

  const enterScrollMode = useCallback(() => {
    const term = termRef.current;
    if (!term || scrollModeRef.current) return;
    scrollModeRef.current = true;
    setScrollMode(true);
    // Use client-side log as immediate fallback
    const log = logMapRefRef.current?.current?.get(sessionKeyRef.current ?? "") || [];
    const all = [...log, ...prevLinesRef.current];
    scrollAllRef.current = all;
    scrollOffsetRef.current = 0;
    renderScrollView();
    // Request full tmux scrollback from agent
    if (onRequestScrollbackRef.current) {
      setScrollbackLoading(true);
      onRequestScrollbackRef.current();
    }
  }, [renderScrollView]);

  const exitScrollMode = useCallback(() => {
    const term = termRef.current;
    if (!term || !scrollModeRef.current) return;
    scrollModeRef.current = false;
    setScrollMode(false);
    setScrollInfo("");
    setScrollbackLoading(false);
    scrollAllRef.current = [];
    scrollOffsetRef.current = 0;
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
      scrollback: 0,
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
    // Send initial dimensions immediately (don't wait for debounced ResizeObserver)
    onResizeRef.current?.(term.cols, term.rows);

    termRef.current = term;
    fitRef.current = fit;

    const dataDisposable = term.onData((data) => { onDataRef.current?.(data); });

    const selDisposable = term.onSelectionChange(() => {
      if (!term.hasSelection() && !scrollModeRef.current && pendingLinesRef.current) {
        const deferred = pendingLinesRef.current;
        pendingLinesRef.current = null;
        prevLinesRef.current = deferred;
        term.write("\x1b[H\x1b[2J" + deferred.join("\r\n"));
      }
    });

    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;

      // Shift+PageUp: enter scroll mode and page up
      if (!scrollModeRef.current && event.shiftKey && event.key === "PageUp") {
        enterScrollMode();
        scrollNav("pageUp");
        return false;
      }

      // Ctrl+Shift+S: enter scroll mode (for keyboards without PageUp)
      if (!scrollModeRef.current && event.ctrlKey && event.shiftKey && event.key === "S") {
        enterScrollMode();
        return false;
      }

      if (scrollModeRef.current) {
        if (event.key === "Escape" || event.key === "q") { exitScrollMode(); return false; }
        if (event.key === "PageUp") { scrollNav("pageUp"); return false; }
        if (event.key === "PageDown") { scrollNav("pageDown"); return false; }
        if (event.key === "ArrowUp" || event.key === "k") { scrollNav("lineUp"); return false; }
        if (event.key === "ArrowDown" || event.key === "j") { scrollNav("lineDown"); return false; }
        if (event.key === "Home" || event.key === "g") { scrollNav("top"); return false; }
        if (event.key === "End" || event.key === "G") { scrollNav("bottom"); return false; }
        if (event.key === "b" || event.key === "u") { scrollNav("pageUp"); return false; }
        if (event.key === "f" || event.key === "d") { scrollNav("pageDown"); return false; }
        return false;
      }

      return true;
    });

    // Mouse wheel: scroll in scroll mode, or enter scroll mode on wheel up
    const container = containerRef.current;
    const onWheel = (e: WheelEvent) => {
      if (!scrollModeRef.current) {
        // Enter scroll mode on scroll up
        if (e.deltaY < 0) {
          enterScrollMode();
          scrollNav("lineUp");
          scrollNav("lineUp");
          scrollNav("lineUp");
        }
        return;
      }
      e.preventDefault();
      const lines = Math.max(1, Math.round(Math.abs(e.deltaY) / 20));
      for (let i = 0; i < lines; i++) {
        scrollNav(e.deltaY < 0 ? "lineUp" : "lineDown");
      }
    };
    container.addEventListener("wheel", onWheel, { passive: false });

    // Touch: swipe to scroll in scroll mode, or enter on swipe down (finger moves down = scroll up)
    let touchStartY = 0;
    let touchAccum = 0;
    const LINE_PX = 20; // pixels per line of scroll
    const onTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
      touchAccum = 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      const dy = e.touches[0].clientY - touchStartY;
      touchStartY = e.touches[0].clientY;

      if (!scrollModeRef.current) {
        // Swipe down (finger moves down) = scroll up into history
        if (dy > 30) {
          enterScrollMode();
          scrollNav("pageUp");
        }
        return;
      }
      e.preventDefault();
      touchAccum += dy;
      const lines = Math.floor(Math.abs(touchAccum) / LINE_PX);
      if (lines > 0) {
        for (let i = 0; i < lines; i++) {
          scrollNav(touchAccum > 0 ? "lineUp" : "lineDown");
        }
        touchAccum = touchAccum % LINE_PX;
      }
    };
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });

    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const doFit = () => {
      fit.fit();
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        onResizeRef.current?.(term.cols, term.rows);
      }, 300);
    };
    const resizeObserver = new ResizeObserver(doFit);
    resizeObserver.observe(containerRef.current);

    // Safety net: also listen for window resize events (covers layout transitions
    // where ResizeObserver may not re-fire if element dimensions didn't change)
    window.addEventListener("resize", doFit);

    return () => {
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      window.removeEventListener("resize", doFit);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      dataDisposable.dispose();
      selDisposable.dispose();
      term.dispose();
    };
  }, []);

  // Subscribe to scrollback responses: replace scroll buffer with full tmux history.
  useEffect(() => {
    if (!subscribeScrollback) return;
    return subscribeScrollback((key) => {
      if (!scrollModeRef.current) return;
      if (key !== sessionKeyRef.current) return;
      const data = scrollbackMapRefRef.current?.current?.get(key);
      if (!data) return;
      scrollAllRef.current = data;
      // Maintain relative position: stay at same offset, clamped to new bounds
      const term = termRef.current;
      if (term) {
        const maxOffset = Math.max(0, data.length - term.rows);
        scrollOffsetRef.current = Math.min(scrollOffsetRef.current, maxOffset);
      }
      setScrollbackLoading(false);
      renderScrollView();
    });
  }, [subscribeScrollback, renderScrollView]);

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
    setScrollInfo("");
    setScrollbackLoading(false);
    term.clear();
    term.write("\x1b[H\x1b[2J");
    // Send current dimensions so the agent resizes the tmux pane for this session
    onResizeRef.current?.(term.cols, term.rows);
  }, [sessionKey]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (lines === prevLinesRef.current) return;

    prevLinesRef.current = lines;

    if (scrollModeRef.current) {
      pendingLinesRef.current = lines;
      return;
    }

    if (term.hasSelection()) {
      pendingLinesRef.current = lines;
      return;
    }

    term.write("\x1b[H\x1b[2J" + lines.join("\r\n"));
  }, [lines]);

  const forceFit = useCallback(() => {
    const fit = fitRef.current;
    const term = termRef.current;
    if (!fit || !term) return;
    fit.fit();
    // Force redraw current content at the new dimensions
    const lines = prevLinesRef.current;
    if (lines.length > 0) {
      term.write("\x1b[H\x1b[2J" + lines.join("\r\n"));
    }
    onResizeRef.current?.(term.cols, term.rows);
  }, []);

  const hasLog = logMapRef?.current?.has(sessionKey ?? "") ?? false;
  const pd = useCallback((e: React.MouseEvent) => e.preventDefault(), []);

  const btnBase: React.CSSProperties = {
    background: "none",
    border: "1px solid rgba(0,0,0,0.3)",
    color: "#000",
    cursor: "pointer",
    borderRadius: 4,
    padding: "4px 8px",
    fontSize: 16,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 36,
    minHeight: 36,
  };

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", overflow: "hidden", background: "#0d1117" }}
      />
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
          {scrollbackLoading && <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.7 }}>loading...</span>}
          {scrollInfo && !scrollbackLoading && <span style={{ fontWeight: 400, fontSize: 10, opacity: 0.7 }}>{scrollInfo}</span>}
          <button onMouseDown={pd} onClick={() => scrollNav("top")} style={btnBase} title="Top (Home)">&#8607;</button>
          <button onMouseDown={pd} onClick={() => scrollNav("pageUp")} style={btnBase} title="Page Up">&#8679;</button>
          <button onMouseDown={pd} onClick={() => scrollNav("pageDown")} style={btnBase} title="Page Down">&#8681;</button>
          <button onMouseDown={pd} onClick={() => scrollNav("bottom")} style={btnBase} title="Bottom (End)">&#8609;</button>
          <button onMouseDown={pd} onClick={exitScrollMode} style={{ ...btnBase, fontWeight: 700, fontSize: 12 }} title="Exit (Esc)">&#10005;</button>
        </div>
      ) : (
        <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 6, zIndex: 10 }}>
          <button
            onMouseDown={pd}
            onClick={forceFit}
            title="Force resize terminal"
            style={{
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.25)",
              color: "#fff",
              cursor: "pointer",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 18,
              lineHeight: 1,
              opacity: 0.6,
              transition: "opacity 0.15s",
              minWidth: 40,
              minHeight: 40,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.6"; }}
          >
            &#8862;
          </button>
          {(hasLog || lines.length > 0) && (
            <button
              onMouseDown={pd}
              onClick={enterScrollMode}
              title="Scroll history (Ctrl+Shift+S)"
              style={{
                background: "rgba(255,255,255,0.12)",
                border: "1px solid rgba(255,255,255,0.25)",
                color: "#fff",
                cursor: "pointer",
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 18,
                lineHeight: 1,
                opacity: 0.6,
                transition: "opacity 0.15s",
                minWidth: 40,
                minHeight: 40,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "0.6"; }}
            >
              &#8597;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
