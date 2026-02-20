import React, { useEffect, useRef, useState } from "react";
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
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;

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
        scrollModeRef.current = true;
        setScrollMode(true);
        // Populate terminal with full log + current viewport
        const log = logMapRef?.current?.get(sessionKey ?? "") || [];
        term.clear();
        const all = [...log, ...prevLinesRef.current];
        term.write("\x1b[H\x1b[2J" + all.join("\r\n"));
        // Let xterm handle the PageUp to scroll up
        return true;
      }

      // Escape or q: exit scroll mode
      if (scrollModeRef.current && (event.key === "Escape" || event.key === "q")) {
        scrollModeRef.current = false;
        setScrollMode(false);
        term.clear();
        const latest = pendingLinesRef.current || prevLinesRef.current;
        pendingLinesRef.current = null;
        term.write("\x1b[H\x1b[2J" + latest.join("\r\n"));
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
      selDisposable.dispose();
      term.dispose();
    };
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term || !onData) return;
    const disposable = term.onData(onData);
    return () => disposable.dispose();
  }, [onData]);

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

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <div
        ref={containerRef}
        style={{ height: "100%", background: "#0d1117" }}
      />
      {scrollMode && (
        <div
          style={{
            position: "absolute",
            top: 0,
            right: 0,
            padding: "2px 8px",
            background: "rgba(255, 200, 0, 0.9)",
            color: "#000",
            fontSize: 11,
            fontWeight: 600,
            borderBottomLeftRadius: 4,
            zIndex: 10,
          }}
        >
          SCROLL &middot; Esc to exit
        </div>
      )}
    </div>
  );
}
