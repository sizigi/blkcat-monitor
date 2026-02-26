import React, { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { ChevronsUp, ChevronsDown, X, Maximize, ArrowUpDown } from "./Icons";

interface TerminalOutputProps {
  sessionKey?: string;
  lines: string[];
  cursor?: { x: number; y: number };
  logMapRef?: React.RefObject<Map<string, string[]>>;
  scrollbackMapRef?: React.RefObject<Map<string, string[]>>;
  subscribeScrollback?: (cb: (key: string) => void) => () => void;
  onRequestScrollback?: () => void;
  onData?: (data: string) => void;
  onResize?: (cols: number, rows: number, force?: boolean) => void;
}

export function TerminalOutput({ sessionKey, lines, cursor, logMapRef, scrollbackMapRef, subscribeScrollback, onRequestScrollback, onData, onResize }: TerminalOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const prevLinesRef = useRef<string[]>([]);
  const pendingLinesRef = useRef<string[] | null>(null);
  const scrollModeRef = useRef(false);
  const [scrollMode, setScrollMode] = useState(false);
  const [scrollInfo, setScrollInfo] = useState("");
  const [scrollbackLoading, setScrollbackLoading] = useState(false);

  // Stable refs for callbacks that change frequently
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  const onResizeRef = useRef(onResize);
  onResizeRef.current = onResize;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;
  const sessionKeyRef = useRef(sessionKey);
  sessionKeyRef.current = sessionKey;
  const logMapRefRef = useRef(logMapRef);
  logMapRefRef.current = logMapRef;
  const scrollbackMapRefRef = useRef(scrollbackMapRef);
  scrollbackMapRefRef.current = scrollbackMapRef;
  const onRequestScrollbackRef = useRef(onRequestScrollback);
  onRequestScrollbackRef.current = onRequestScrollback;

  // Scroll state: offset=0 → bottom (most recent), positive → scrolled up N lines.
  const scrollOffsetRef = useRef(0);
  const scrollAllRef = useRef<string[]>([]);
  const lastRenderedOffsetRef = useRef(-1);
  const lastRenderedStartRef = useRef(-1);
  const scrollInfoTimerRef = useRef(0);
  const scrollRafRef = useRef(0);

  /** Render the visible window of the scroll buffer. Uses differential rendering
   *  for small scrolls (1-5 lines) and full rewrite for large jumps. */
  const renderScrollView = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    const offset = scrollOffsetRef.current;
    if (offset === lastRenderedOffsetRef.current) return;

    const all = scrollAllRef.current;
    const rows = term.rows;
    const end = all.length - offset;
    const start = Math.max(0, end - rows);
    const prevStart = lastRenderedStartRef.current;
    const prevOffset = lastRenderedOffsetRef.current;
    lastRenderedOffsetRef.current = offset;
    lastRenderedStartRef.current = start;

    const delta = start - prevStart;

    if (prevOffset >= 0 && delta !== 0 && Math.abs(delta) <= 5 && Math.abs(delta) < rows) {
      // Differential: shift existing content, write only new lines
      let buf = "";
      if (delta < 0) {
        const n = -delta;
        buf += `\x1b[${n}T`; // scroll down: new lines at top
        for (let i = 0; i < n; i++) {
          buf += `\x1b[${i + 1};1H`;
          if (start + i < all.length) buf += all[start + i];
          buf += "\x1b[K";
        }
      } else {
        const n = delta;
        buf += `\x1b[${n}S`; // scroll up: new lines at bottom
        for (let i = 0; i < n; i++) {
          const row = rows - n + i;
          buf += `\x1b[${row + 1};1H`;
          if (start + row < end) buf += all[start + row];
          buf += "\x1b[K";
        }
      }
      term.write(buf);
    } else {
      // Full render
      let buf = "";
      for (let i = 0; i < rows; i++) {
        buf += `\x1b[${i + 1};1H`;
        if (start + i < end) buf += all[start + i];
        buf += "\x1b[K";
      }
      term.write(buf);
    }

    // Throttle position indicator updates (max every 100ms)
    if (!scrollInfoTimerRef.current) {
      scrollInfoTimerRef.current = window.setTimeout(() => {
        scrollInfoTimerRef.current = 0;
        const total = scrollAllRef.current.length;
        const t = termRef.current;
        if (!t) return;
        const e2 = total - scrollOffsetRef.current;
        const s2 = Math.max(0, e2 - t.rows);
        const p = total > 0 ? Math.max(1, s2 + 1) : 0;
        const ep = Math.min(total, e2);
        setScrollInfo(total > 0 ? `${p}-${ep} / ${total}` : "empty");
      }, 100);
    }
  }, []);

  /** Schedule a render on the next animation frame (coalesces multiple calls). */
  const scheduleRender = useCallback(() => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0;
      renderScrollView();
    });
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
    lastRenderedOffsetRef.current = -1;
    lastRenderedStartRef.current = -1;
    if (scrollInfoTimerRef.current) { clearTimeout(scrollInfoTimerRef.current); scrollInfoTimerRef.current = 0; }
    if (scrollRafRef.current) { cancelAnimationFrame(scrollRafRef.current); scrollRafRef.current = 0; }
    const latest = pendingLinesRef.current || prevLinesRef.current;
    pendingLinesRef.current = null;
    term.write("\x1b[H\x1b[2J" + latest.join("\r\n"));
    term.focus();
  }, []);

  /** Adjust scroll offset by `delta` lines (positive = up) and schedule render.
   *  Auto-exits scroll mode when scrolling down reaches the bottom (offset 0). */
  const scrollBy = useCallback((delta: number) => {
    if (!scrollModeRef.current) return;
    const rows = termRef.current?.rows ?? 24;
    const maxOffset = Math.max(0, scrollAllRef.current.length - rows);
    scrollOffsetRef.current = Math.max(0, Math.min(maxOffset, scrollOffsetRef.current + delta));
    if (delta < 0 && scrollOffsetRef.current === 0) {
      exitScrollMode();
      return;
    }
    scheduleRender();
  }, [scheduleRender, exitScrollMode]);

  /** Named scroll actions — delegates to scrollBy. */
  const scrollNav = useCallback((action: "pageUp" | "pageDown" | "top" | "bottom" | "lineUp" | "lineDown") => {
    const rows = termRef.current?.rows ?? 24;
    switch (action) {
      case "lineUp":   scrollBy(1); break;
      case "lineDown": scrollBy(-1); break;
      case "pageUp":   scrollBy(rows); break;
      case "pageDown": scrollBy(-rows); break;
      case "top":      scrollBy(Infinity); break;   // clamped to maxOffset
      case "bottom":   scrollBy(-Infinity); break;  // clamped to 0
    }
  }, [scrollBy]);

  const enterScrollMode = useCallback(() => {
    const term = termRef.current;
    if (!term || scrollModeRef.current) return;
    scrollModeRef.current = true;
    setScrollMode(true);

    // Use preloaded scrollback if available, otherwise fall back to client-side log
    const cached = scrollbackMapRefRef.current?.current?.get(sessionKeyRef.current ?? "");
    if (cached && cached.length > 0) {
      scrollAllRef.current = cached;
    } else {
      const log = logMapRefRef.current?.current?.get(sessionKeyRef.current ?? "") || [];
      scrollAllRef.current = [...log, ...prevLinesRef.current];
      setScrollbackLoading(true);
    }
    scrollOffsetRef.current = 0;
    renderScrollView();
    // Always request fresh scrollback
    onRequestScrollbackRef.current?.();
  }, [renderScrollView]);

  // --- Main terminal setup effect ---
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      disableStdin: !onData,
      convertEol: true,
      cursorBlink: !!onData,
      scrollback: 0,
      theme: (() => {
        const s = getComputedStyle(document.documentElement);
        return {
          background: s.getPropertyValue("--bg").trim() || "#0d1117",
          foreground: s.getPropertyValue("--text").trim() || "#c9d1d9",
          cursor: s.getPropertyValue("--text").trim() || "#c9d1d9",
        };
      })(),
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', monospace",
    });

    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    fit.fit();
    onResizeRef.current?.(term.cols, term.rows);

    const themeObserver = new MutationObserver(() => {
      const s = getComputedStyle(document.documentElement);
      term.options.theme = {
        background: s.getPropertyValue("--bg").trim() || "#0d1117",
        foreground: s.getPropertyValue("--text").trim() || "#c9d1d9",
        cursor: s.getPropertyValue("--text").trim() || "#c9d1d9",
      };
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });


    termRef.current = term;
    fitRef.current = fit;

    // On mobile, prevent the soft keyboard from appearing when xterm's hidden
    // textarea gets focus (e.g. exitScrollMode, session switch). inputMode="none"
    // suppresses the virtual keyboard while still allowing hardware key events.
    if ("ontouchstart" in window) {
      const xtermTextarea = containerRef.current.querySelector(".xterm-helper-textarea") as HTMLElement;
      if (xtermTextarea) xtermTextarea.setAttribute("inputmode", "none");
    }

    const dataDisposable = term.onData((data) => { if (!scrollModeRef.current) onDataRef.current?.(data); });

    const selDisposable = term.onSelectionChange(() => {
      if (!term.hasSelection() && !scrollModeRef.current && pendingLinesRef.current) {
        const deferred = pendingLinesRef.current;
        pendingLinesRef.current = null;
        prevLinesRef.current = deferred;
        term.write("\x1b[H\x1b[2J" + deferred.join("\r\n"));
      }
    });

    // Suppress xterm's internal wheel→arrow-key conversion (scrollback:0 triggers it)
    (term as any).attachCustomWheelEventHandler(() => false);

    term.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;

      // Ctrl+C / Cmd+C: copy selected text if there's a selection,
      // otherwise let it through as terminal interrupt (SIGINT)
      if ((event.ctrlKey || event.metaKey) && event.key === "c") {
        if (term.hasSelection()) {
          navigator.clipboard.writeText(term.getSelection()).catch(() => {});
          term.clearSelection();
          return false;
        }
        return true; // no selection → send ^C to terminal
      }

      // Intercept Ctrl+V / Cmd+V: read clipboard ourselves and send as data.
      // Without this, xterm sends raw \x16 which Claude Code interprets as
      // "paste image" rather than receiving the actual clipboard text.
      if ((event.ctrlKey || event.metaKey) && event.key === "v") {
        navigator.clipboard.readText().then((text) => {
          if (text) onDataRef.current?.(text);
        }).catch(() => {});
        return false;
      }

      // Enter scroll mode via keyboard
      if (!scrollModeRef.current) {
        if (event.shiftKey && event.key === "PageUp") {
          enterScrollMode();
          scrollNav("pageUp");
          return false;
        }
        if (event.ctrlKey && event.shiftKey && event.key === "S") {
          enterScrollMode();
          return false;
        }
        return true;
      }

      // Scroll mode keyboard navigation
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
    });

    // --- Mouse wheel ---
    const container = containerRef.current;
    const onWheel = (e: WheelEvent) => {
      if (!scrollModeRef.current) {
        if (e.deltaY < 0) {
          e.preventDefault();
          enterScrollMode();
          scrollBy(3);
        }
        return;
      }
      e.preventDefault();
      const n = Math.max(1, Math.round(Math.abs(e.deltaY) / 20));
      scrollBy(e.deltaY < 0 ? n : -n);
    };
    container.addEventListener("wheel", onWheel, { passive: false });

    // --- Touch scrolling ---
    let touchStartY = 0;
    let touchLastY = 0;
    let touchLastTime = 0;
    let touchAccum = 0;
    let touchEntryAccum = 0;
    let touchVelocity = 0;
    let momentumRaf = 0;
    const LINE_PX = 12;
    const ENTRY_THRESHOLD = 40;

    const stopMomentum = () => { if (momentumRaf) { cancelAnimationFrame(momentumRaf); momentumRaf = 0; } };

    const onTouchStart = (e: TouchEvent) => {
      stopMomentum();
      touchStartY = touchLastY = e.touches[0].clientY;
      touchLastTime = Date.now();
      touchAccum = touchEntryAccum = touchVelocity = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault(); // always block page scroll / pull-to-refresh

      const y = e.touches[0].clientY;
      const dy = y - touchLastY;
      const now = Date.now();
      const dt = now - touchLastTime;
      if (dt > 0) touchVelocity = dy / dt;
      touchLastY = y;
      touchLastTime = now;

      if (!scrollModeRef.current) {
        if (dy > 0) touchEntryAccum += dy;
        else touchEntryAccum = 0;
        if (touchEntryAccum > ENTRY_THRESHOLD) {
          enterScrollMode();
          scrollBy(termRef.current?.rows ?? 24); // start one page up
        }
        return;
      }
      touchAccum += dy;
      const n = Math.floor(Math.abs(touchAccum) / LINE_PX);
      if (n > 0) {
        scrollBy(touchAccum > 0 ? n : -n);
        touchAccum %= LINE_PX;
      }
    };

    const onTouchEnd = () => {
      if (!scrollModeRef.current) return;
      // Tap to exit (minimal movement)
      if (Math.abs(touchLastY - touchStartY) < 10) { exitScrollMode(); return; }
      // Momentum
      const v = touchVelocity;
      if (Math.abs(v) < 0.3) return;
      let remaining = v * 300;
      const step = () => {
        if (!scrollModeRef.current || Math.abs(remaining) < LINE_PX) { momentumRaf = 0; return; }
        const n = Math.max(1, Math.floor(Math.abs(remaining) / LINE_PX / 8));
        scrollBy(remaining > 0 ? n : -n);
        remaining *= 0.92;
        momentumRaf = requestAnimationFrame(step);
      };
      momentumRaf = requestAnimationFrame(step);
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });

    // Double-click to exit scroll mode (desktop)
    const onDblClick = () => {
      if (scrollModeRef.current) exitScrollMode();
    };
    container.addEventListener("dblclick", onDblClick);

    // --- Resize handling (debounced to avoid keyboard open/close thrashing) ---
    let fitTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const doFit = () => {
      clearTimeout(fitTimer);
      fitTimer = setTimeout(() => {
        fit.fit();
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => onResizeRef.current?.(term.cols, term.rows), 300);
      }, 100);
    };
    const resizeObserver = new ResizeObserver(doFit);
    resizeObserver.observe(containerRef.current);
    window.addEventListener("resize", doFit);

    return () => {
      clearTimeout(fitTimer);
      clearTimeout(resizeTimer);
      resizeObserver.disconnect();
      window.removeEventListener("resize", doFit);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("dblclick", onDblClick);
      stopMomentum();
      if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current);
      dataDisposable.dispose();
      selDisposable.dispose();
      themeObserver.disconnect();
      term.dispose();
    };
  }, []);

  // Cache scrollback responses; update live scroll buffer if in scroll mode.
  useEffect(() => {
    if (!subscribeScrollback) return;
    return subscribeScrollback((key) => {
      if (key !== sessionKeyRef.current) return;
      const data = scrollbackMapRefRef.current?.current?.get(key);
      if (!data) return;
      if (scrollModeRef.current) {
        scrollAllRef.current = data;
        const term = termRef.current;
        if (term) {
          const maxOffset = Math.max(0, data.length - term.rows);
          scrollOffsetRef.current = Math.min(scrollOffsetRef.current, maxOffset);
        }
        lastRenderedOffsetRef.current = -1; // force re-render
        setScrollbackLoading(false);
        renderScrollView();
      }
    });
  }, [subscribeScrollback, renderScrollView]);

  // Reset on session switch.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    prevLinesRef.current = [];
    pendingLinesRef.current = null;
    scrollModeRef.current = false;
    scrollOffsetRef.current = 0;
    scrollAllRef.current = [];
    lastRenderedOffsetRef.current = -1;
    lastRenderedStartRef.current = -1;
    setScrollMode(false);
    setScrollInfo("");
    setScrollbackLoading(false);
    term.clear();
    term.write("\x1b[H\x1b[2J");
    term.focus();
    onResizeRef.current?.(term.cols, term.rows);
  }, [sessionKey]);

  // Preload scrollback for the current session; refresh every 30s.
  useEffect(() => {
    if (!sessionKey) return;
    const t = setTimeout(() => onRequestScrollbackRef.current?.(), 2000);
    const i = setInterval(() => {
      if (!scrollModeRef.current && document.visibilityState === "visible")
        onRequestScrollbackRef.current?.();
    }, 30000);
    return () => { clearTimeout(t); clearInterval(i); };
  }, [sessionKey]);

  // Write live terminal output — only update changed lines to avoid flicker.
  // After writing, move the cursor to match tmux's cursor position.
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    // Cursor-only update: if lines haven't changed, just reposition cursor
    if (lines === prevLinesRef.current) {
      const cur = cursorRef.current;
      if (cur && !scrollModeRef.current) term.write(`\x1b[${cur.y + 1};${cur.x + 1}H`);
      return;
    }
    const prev = prevLinesRef.current;
    prevLinesRef.current = lines;
    if (scrollModeRef.current || term.hasSelection()) {
      pendingLinesRef.current = lines;
      return;
    }
    // Cursor positioning escape: \x1b[row;colH (1-based)
    const cur = cursorRef.current;
    const cursorSeq = cur ? `\x1b[${cur.y + 1};${cur.x + 1}H` : "";
    // If previous was empty, do full write
    if (prev.length === 0) {
      term.write("\x1b[H\x1b[2J" + lines.join("\r\n") + cursorSeq);
      return;
    }
    // Differential update: only rewrite rows that changed
    let buf = "";
    const maxRows = Math.max(lines.length, prev.length);
    for (let i = 0; i < maxRows; i++) {
      if (i < lines.length) {
        if (prev[i] !== lines[i]) {
          buf += `\x1b[${i + 1};1H${lines[i]}\x1b[K`;
        }
      } else {
        buf += `\x1b[${i + 1};1H\x1b[K`;
      }
    }
    // Always append cursor positioning (even if no lines changed, cursor may have moved)
    buf += cursorSeq;
    if (buf) term.write(buf);
  }, [lines, cursor]);

  const forceFit = useCallback(() => {
    const fit = fitRef.current;
    const term = termRef.current;
    if (!fit || !term) return;
    fit.fit();
    term.write("\x1b[H\x1b[2J");
    prevLinesRef.current = [];
    onResizeRef.current?.(term.cols, term.rows, true);
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

  const floatBtn = "terminal-float-btn";

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0, minWidth: 0 }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", overflow: "hidden", background: "var(--bg)", touchAction: "none" }}
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
          <button onMouseDown={pd} onClick={() => scrollNav("top")} style={btnBase} title="Top (Home)"><ChevronsUp size={12} /></button>
          <button onMouseDown={pd} onClick={() => scrollNav("bottom")} style={btnBase} title="Bottom (End)"><ChevronsDown size={12} /></button>
          <button onMouseDown={pd} onClick={exitScrollMode} style={{ ...btnBase, fontWeight: 700 }} title="Exit (Esc)"><X size={12} /></button>
        </div>
      ) : (
        <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 6, zIndex: 10 }}>
          <button onMouseDown={pd} onClick={forceFit} title="Force resize terminal" className={floatBtn}>
            <Maximize size={14} />
          </button>
          {(hasLog || lines.length > 0) && (
            <button onMouseDown={pd} onClick={enterScrollMode} title="Scroll history (Ctrl+Shift+S)" className={floatBtn}>
              <ArrowUpDown size={14} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
