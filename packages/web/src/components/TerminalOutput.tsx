import React, { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalOutputProps {
  lines: string[];
}

export function TerminalOutput({ lines }: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const prevLinesRef = useRef<string[]>([]);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      disableStdin: true,
      convertEol: true,
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
    if (!term) return;
    if (lines !== prevLinesRef.current) {
      term.clear();
      for (const line of lines) {
        term.writeln(line);
      }
      prevLinesRef.current = lines;
    }
  }, [lines]);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, minHeight: 0, background: "#0d1117" }}
    />
  );
}
