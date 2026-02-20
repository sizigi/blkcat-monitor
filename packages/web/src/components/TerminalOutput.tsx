import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalOutputProps {
  lines: string[];
  onData?: (data: string) => void;
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

    // tmux capture-pane sends a viewport snapshot each time. When content
    // scrolls, old lines disappear from the top and new ones appear at the
    // bottom. Find the overlap between the end of prev and the start of
    // lines, then append only the truly new lines — preserving scrollback.
    let overlap = 0;
    if (prev.length > 0 && lines.length > 0) {
      // Find the largest k where prev's last k lines == lines' first k lines
      const maxK = Math.min(prev.length, lines.length);
      for (let k = maxK; k >= 1; k--) {
        let match = true;
        for (let i = 0; i < k; i++) {
          if (prev[prev.length - k + i] !== lines[i]) { match = false; break; }
        }
        if (match) { overlap = k; break; }
      }
    }

    if (overlap > 0) {
      // Append only the new lines that scrolled into view
      const newLines = lines.slice(overlap);
      if (newLines.length > 0) {
        // Move cursor to the last row, then write new lines below
        term.write("\x1b[" + lines.length + ";1H");
        term.write("\r\n" + newLines.join("\r\n"));
      }
    } else {
      // No overlap — full redraw (e.g. switched session, cleared screen)
      term.clear();
      term.write("\x1b[H\x1b[2J" + lines.join("\r\n"));
    }
    prevLinesRef.current = lines;
  }, [lines]);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, minHeight: 0, background: "#0d1117" }}
    />
  );
}
