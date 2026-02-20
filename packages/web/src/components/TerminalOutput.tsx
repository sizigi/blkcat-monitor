import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalOutputProps {
  lines: string[];
  onData?: (data: string) => void;
}

// Strip ANSI escape codes and trailing whitespace for reliable comparison.
// tmux may emit different escape sequences between captures for the same text.
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").trimEnd();
}

export function TerminalOutput({ lines, onData }: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const prevLinesRef = useRef<string[]>([]);

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

    const resizeObserver = new ResizeObserver(() => fit.fit());
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, []);

  useEffect(() => {
    const term = termRef.current;
    if (!term || !onData) return;
    const disposable = term.onData(onData);
    return () => disposable.dispose();
  }, [onData]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (lines === prevLinesRef.current) return;
    const prev = prevLinesRef.current;

    // tmux capture-pane sends viewport snapshots. When content scrolls, old
    // lines leave the top and new ones appear at the bottom. We find the
    // overlap (stripping ANSI codes which can differ between captures), then
    // push scrolled-off lines into xterm's scrollback buffer before redrawing
    // the visible viewport.
    let overlap = 0;
    if (prev.length > 0 && lines.length > 0) {
      const prevStripped = prev.map(stripAnsi);
      const linesStripped = lines.map(stripAnsi);
      const maxK = Math.min(prev.length, lines.length);
      for (let k = maxK; k >= 1; k--) {
        let match = true;
        for (let i = 0; i < k; i++) {
          if (prevStripped[prev.length - k + i] !== linesStripped[i]) {
            match = false;
            break;
          }
        }
        if (match) { overlap = k; break; }
      }
    }

    // Number of lines that scrolled off the top since last snapshot
    const scrolled = prev.length - overlap;
    if (scrolled > 0) {
      // Write newlines at the bottom to push old lines into scrollback
      term.write("\r\n".repeat(scrolled));
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
