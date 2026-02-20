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

    // Check if new lines are an append-only extension of previous content.
    // This preserves scrollback history for the common case of Claude streaming output.
    let isAppend = prev.length > 0 && lines.length > prev.length;
    if (isAppend) {
      for (let i = 0; i < prev.length; i++) {
        if (prev[i] !== lines[i]) { isAppend = false; break; }
      }
    }

    if (isAppend) {
      // Only write the newly appended lines
      const newLines = lines.slice(prev.length);
      term.write("\r\n" + newLines.join("\r\n"));
    } else {
      // Full redraw — content changed significantly
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
