import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalOutputProps {
  sessionKey?: string;
  lines: string[];
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
}

// Strip ANSI escape codes and trailing whitespace for reliable comparison.
// tmux may emit different escape sequences between captures for the same text.
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trimEnd();
}

export function TerminalOutput({ sessionKey, lines, onData, onResize }: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const prevLinesRef = useRef<string[]>([]);
  const pendingLinesRef = useRef<string[] | null>(null);
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
      if (!term.hasSelection() && pendingLinesRef.current) {
        const deferred = pendingLinesRef.current;
        pendingLinesRef.current = null;
        prevLinesRef.current = deferred;
        term.write("\x1b[H\x1b[2J" + deferred.join("\r\n"));
      }
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

  // Reset terminal state when switching sessions so overlap detection
  // doesn't compare unrelated content from different sessions.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    prevLinesRef.current = [];
    pendingLinesRef.current = null;
    term.clear();
    term.write("\x1b[H\x1b[2J");
  }, [sessionKey]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (lines === prevLinesRef.current) return;
    const prev = prevLinesRef.current;

    // tmux capture-pane sends viewport snapshots. We need to distinguish
    // between content that scrolled (old lines leave the top, new ones appear
    // at the bottom) and content that was edited in place (e.g. spinner
    // updates, typing at a prompt). Only actual scrolling should push lines
    // into xterm's scrollback buffer.
    const prevStripped = prev.map(stripAnsi);
    const linesStripped = lines.map(stripAnsi);

    // 1. Scroll overlap: longest suffix of prev matching prefix of new.
    //    Detects how many lines scrolled off the top.
    let scrollOverlap = 0;
    if (prev.length > 0 && lines.length > 0) {
      const maxK = Math.min(prev.length, lines.length);
      for (let k = maxK; k >= 1; k--) {
        let match = true;
        for (let i = 0; i < k; i++) {
          if (prevStripped[prev.length - k + i] !== linesStripped[i]) {
            match = false;
            break;
          }
        }
        if (match) { scrollOverlap = k; break; }
      }
    }

    // 2. In-place match: count lines that are identical at the same position.
    //    High in-place match means content was edited, not scrolled.
    let inPlaceMatch = 0;
    const minLen = Math.min(prevStripped.length, linesStripped.length);
    for (let i = 0; i < minLen; i++) {
      if (prevStripped[i] === linesStripped[i]) inPlaceMatch++;
    }

    // Use scroll overlap only when it explains the change better than
    // in-place matching. This prevents false scrollback pushes when content
    // is merely edited (spinners, typing, partial redraws).
    const scrolled = scrollOverlap > inPlaceMatch
      ? prev.length - scrollOverlap
      : 0;

    // If the user has text selected (e.g. for copy), defer the redraw so
    // the selection isn't destroyed by the screen clear.
    if (term.hasSelection()) {
      pendingLinesRef.current = lines;
      return;
    }

    if (scrolled > 0) {
      // Move cursor to last row first — \r\n only scrolls content into
      // the scrollback buffer when the cursor is at the bottom of the
      // viewport. Without this, lines are lost if prev had fewer lines
      // than the terminal rows.
      term.write(`\x1b[${term.rows};1H` + "\r\n".repeat(scrolled));
    }

    // Overwrite the visible viewport with the current snapshot.
    // \x1b[H = cursor home, \x1b[2J = clear visible screen (scrollback preserved)
    term.write("\x1b[H\x1b[2J" + lines.join("\r\n"));
    prevLinesRef.current = lines;
  }, [lines]);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, minHeight: 0, background: "#0d1117" }}
    />
  );
}
