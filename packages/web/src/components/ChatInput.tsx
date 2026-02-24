import React, { useState, useRef, useCallback } from "react";

interface ChatInputProps {
  onSendText: (text: string) => void;
  onSendKey: (key: string) => void;
  onSendData?: (data: string) => void;
}

const KEY_BUTTONS: { label: string; keys: string[] }[] = [
  { label: "Tab", keys: ["Tab"] },
  { label: "Esc", keys: ["Escape"] },
];

const keyBtnStyle: React.CSSProperties = {
  background: "var(--bg-tertiary)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: "4px 10px",
  cursor: "pointer",
  fontSize: 12,
  fontFamily: "monospace",
  lineHeight: 1,
};

const modifierActiveStyle: React.CSSProperties = {
  ...keyBtnStyle,
  background: "var(--accent)",
  color: "#fff",
  borderColor: "var(--accent)",
};

// --- Haptic feedback helper ---
function vibrate(ms = 10) {
  try { navigator?.vibrate?.(ms); } catch {}
}

// --- D-Pad component: swipe-based directional pad with repeat and haptics ---

const DPAD_SIZE = 32;
const SWIPE_THRESHOLD = 12;
const REPEAT_DELAY = 400; // ms before repeat starts
const REPEAT_INTERVAL = 80; // ms between repeats

function DPad({ onDirection }: { onDirection: (dir: "Up" | "Down" | "Left" | "Right") => void }) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [activeDir, setActiveDir] = useState<string | null>(null);
  const activeDirRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRepeat = useCallback(() => {
    if (repeatTimerRef.current) { clearTimeout(repeatTimerRef.current); repeatTimerRef.current = null; }
    if (repeatIntervalRef.current) { clearInterval(repeatIntervalRef.current); repeatIntervalRef.current = null; }
  }, []);

  const startRepeat = useCallback((dir: "Up" | "Down" | "Left" | "Right") => {
    stopRepeat();
    repeatTimerRef.current = setTimeout(() => {
      repeatIntervalRef.current = setInterval(() => {
        onDirection(dir);
        vibrate(8);
      }, REPEAT_INTERVAL);
    }, REPEAT_DELAY);
  }, [onDirection, stopRepeat]);

  const fireDirection = useCallback((dir: "Up" | "Down" | "Left" | "Right") => {
    setActiveDir(dir);
    activeDirRef.current = dir;
    onDirection(dir);
    vibrate(10);
    startRepeat(dir);
  }, [onDirection, startRepeat]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
    setActiveDir(null);
    activeDirRef.current = null;
    stopRepeat();
  }, [stopRepeat]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!startRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) return;

    let dir: "Up" | "Down" | "Left" | "Right";
    if (absDx > absDy) {
      dir = dx > 0 ? "Right" : "Left";
    } else {
      dir = dy > 0 ? "Down" : "Up";
    }

    if (dir !== activeDirRef.current) {
      fireDirection(dir);
      startRef.current = { x: t.clientX, y: t.clientY };
    }
  }, [fireDirection]);

  const handleTouchEnd = useCallback(() => {
    startRef.current = null;
    stopRepeat();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { setActiveDir(null); activeDirRef.current = null; }, 150);
  }, [stopRepeat]);

  // Also support mouse drag for desktop
  const mouseDownRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    mouseDownRef.current = true;
    startRef.current = { x: e.clientX, y: e.clientY };
    setActiveDir(null);
    activeDirRef.current = null;
    stopRepeat();
  }, [stopRepeat]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!mouseDownRef.current || !startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < SWIPE_THRESHOLD && absDy < SWIPE_THRESHOLD) return;

    let dir: "Up" | "Down" | "Left" | "Right";
    if (absDx > absDy) {
      dir = dx > 0 ? "Right" : "Left";
    } else {
      dir = dy > 0 ? "Down" : "Up";
    }

    if (dir !== activeDirRef.current) {
      fireDirection(dir);
      startRef.current = { x: e.clientX, y: e.clientY };
    }
  }, [fireDirection]);

  const handleMouseUp = useCallback(() => {
    mouseDownRef.current = false;
    startRef.current = null;
    stopRepeat();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { setActiveDir(null); activeDirRef.current = null; }, 150);
  }, [stopRepeat]);

  // Arrow indicator colors based on active direction
  const arrowColor = (dir: string) => activeDir === dir ? "var(--accent)" : "currentColor";

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        width: DPAD_SIZE,
        height: DPAD_SIZE,
        borderRadius: "50%",
        background: activeDir ? "var(--bg-tertiary)" : "var(--bg-tertiary)",
        border: `1px solid ${activeDir ? "var(--accent)" : "var(--border)"}`,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none",
        touchAction: "none",
        flexShrink: 0,
        transition: "border-color 0.1s",
      }}
      title="Swipe for arrow keys"
    >
      {/* Cross-arrow icon */}
      <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {/* Up */}
        <polyline points="9,2 9,7" stroke={arrowColor("Up")} />
        <polyline points="7,4 9,2 11,4" stroke={arrowColor("Up")} />
        {/* Down */}
        <polyline points="9,11 9,16" stroke={arrowColor("Down")} />
        <polyline points="7,14 9,16 11,14" stroke={arrowColor("Down")} />
        {/* Left */}
        <polyline points="2,9 7,9" stroke={arrowColor("Left")} />
        <polyline points="4,7 2,9 4,11" stroke={arrowColor("Left")} />
        {/* Right */}
        <polyline points="11,9 16,9" stroke={arrowColor("Right")} />
        <polyline points="14,7 16,9 14,11" stroke={arrowColor("Right")} />
      </svg>
    </div>
  );
}

export function ChatInput({ onSendText, onSendKey, onSendData }: ChatInputProps) {
  const [text, setText] = useState("");
  const [liveMode, setLiveMode] = useState(false);
  const liveModeRef = useRef(false);
  liveModeRef.current = liveMode;
  const composingRef = useRef(false);
  const justComposedRef = useRef(false);

  // Modifier toggle state
  const [ctrlActive, setCtrlActive] = useState(false);
  const [shiftActive, setShiftActive] = useState(false);
  const ctrlRef = useRef(false);
  const shiftRef = useRef(false);
  // Keep refs in sync for use in callbacks without stale closures
  ctrlRef.current = ctrlActive;
  shiftRef.current = shiftActive;

  const clearModifiers = useCallback(() => {
    setCtrlActive(false);
    setShiftActive(false);
  }, []);

  // Wrap onSendKey to apply modifier prefixes
  const sendKeyWithModifiers = useCallback((key: string) => {
    const ctrl = ctrlRef.current;
    const shift = shiftRef.current;
    let finalKey = key;

    if (ctrl && shift) {
      finalKey = `C-S-${key}`;
    } else if (ctrl) {
      finalKey = `C-${key}`;
    } else if (shift) {
      finalKey = `S-${key}`;
    }

    onSendKey(finalKey);
    if (ctrl || shift) clearModifiers();
  }, [onSendKey, clearModifiers]);

  // Wrap onSendData to handle modifier + character input
  const sendDataWithModifiers = useCallback((data: string) => {
    if (!onSendData) return;
    const ctrl = ctrlRef.current;
    const shift = shiftRef.current;

    if (ctrl && data.length === 1) {
      // Ctrl + single char: send as tmux key name C-<char>
      const key = shift ? `C-S-${data.toLowerCase()}` : `C-${data.toLowerCase()}`;
      onSendKey(key);
      clearModifiers();
    } else if (shift && data.length === 1) {
      // Shift + single char: just send uppercase
      onSendData(data.toUpperCase());
      clearModifiers();
    } else {
      onSendData(data);
    }
  }, [onSendData, onSendKey, clearModifiers]);

  function handleSend() {
    vibrate(10);
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    onSendKey("Enter");
    setText("");
  }

  // Live mode: transparent passthrough. Textarea keeps a sentinel space character
  // so that Backspace always has something to delete (mobile browsers may not fire
  // keydown for Backspace on an empty textarea). After each send, reset to sentinel.
  const SENTINEL = " ";
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resetLiveInput = useCallback(() => {
    setText(SENTINEL);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        try { el.setSelectionRange(SENTINEL.length, SENTINEL.length); } catch {}
      }
    });
  }, []);

  const handleLiveChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (!onSendData) return;

    // Some IMEs auto-commit text without firing compositionEnd. Detect this by
    // checking the native InputEvent.isComposing — if the browser says composition
    // is over but our ref still says composing, the IME silently committed.
    if (composingRef.current) {
      const nativeIsComposing = (e.nativeEvent as InputEvent).isComposing;
      if (nativeIsComposing !== false) {
        // Still genuinely composing — just show the composing text
        setText(newValue);
        return;
      }
      // IME silently committed without firing compositionEnd
      composingRef.current = false;
      const committed = newValue.slice(SENTINEL.length);
      if (committed) sendDataWithModifiers(committed);
      resetLiveInput();
      return;
    }
    if (justComposedRef.current) {
      justComposedRef.current = false;
      return;
    }

    if (newValue.length > SENTINEL.length) {
      // Characters added — send the new part (after the sentinel)
      const added = newValue.slice(SENTINEL.length);
      if (added) sendDataWithModifiers(added);
      resetLiveInput();
    } else if (newValue.length < SENTINEL.length) {
      // Sentinel was deleted → user pressed Backspace
      sendKeyWithModifiers("BSpace");
      resetLiveInput();
    } else {
      setText(newValue);
    }
  }, [onSendData, sendKeyWithModifiers, sendDataWithModifiers, resetLiveInput]);

  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLTextAreaElement>) => {
    composingRef.current = false;
    // In non-live mode, just clear the composing flag — don't send or reset
    if (!liveModeRef.current) return;
    justComposedRef.current = true; // prevent the following onChange from double-sending
    if (!onSendData) return;
    const committed = e.data;
    if (committed) sendDataWithModifiers(committed);
    resetLiveInput();
  }, [onSendData, sendDataWithModifiers, resetLiveInput]);

  const handleLiveKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.isComposing || composingRef.current) return;
    if (!onSendData) return;

    // Special keys: intercept and send as terminal keys
    const keyMap: Record<string, string> = {
      Enter: "Enter", Tab: "Tab", Escape: "Escape",
      ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
      Home: "Home", End: "End",
    };
    const mapped = keyMap[e.key];
    if (mapped) {
      e.preventDefault();
      sendKeyWithModifiers(mapped);
      return;
    }
    // Ctrl+key from physical keyboard (desktop)
    if (e.ctrlKey && e.key.length === 1) {
      e.preventDefault();
      onSendKey(`C-${e.key.toLowerCase()}`);
      return;
    }
  }, [onSendData, sendKeyWithModifiers, onSendKey]);

  const handleDpadDirection = useCallback((dir: "Up" | "Down" | "Left" | "Right") => {
    sendKeyWithModifiers(dir);
  }, [sendKeyWithModifiers]);

  return (
    <div className="chat-input-container" style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Textarea: desktop=top, mobile=bottom (via CSS order) so it sits above the keyboard */}
      <div className="chat-input-textarea chat-buttons" style={{ display: "flex", gap: 8 }}>
        <div className={liveMode ? "live-border-wrap" : undefined} style={liveMode ? undefined : { flex: 1 }}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={liveMode ? handleLiveChange : (e) => setText(e.target.value)}
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={handleCompositionEnd}
            onKeyDown={liveMode ? handleLiveKeyDown : (e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={liveMode ? "" : "Type a message... (Ctrl+Enter to submit)"}
            rows={liveMode ? 1 : 2}
            style={{
              width: "100%",
              background: "var(--bg-tertiary)",
              border: liveMode ? "2px solid transparent" : "1px solid var(--border)",
              borderRadius: 4,
              padding: "6px 10px",
              color: "var(--text)",
              fontSize: 14,
              resize: liveMode ? "none" : "vertical",
              fontFamily: "inherit",
              boxSizing: "border-box",
            }}
          />
        </div>
        {!liveMode && (
          <button
            type="button"
            onClick={handleSend}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              padding: "6px 16px",
              cursor: "pointer",
              fontSize: 14,
              alignSelf: "flex-end",
            }}
          >
            Send
          </button>
        )}
      </div>
      {/* Mobile: full-width LIVE toggle (hidden on desktop via CSS) */}
      {onSendData && (
        <button
          type="button"
          onClick={() => { vibrate(15); setLiveMode((v) => { if (!v) { setText(SENTINEL); } else { setText(""); } return !v; }); }}
          className={`live-toggle-mobile ${liveMode ? "live-toggle-on" : ""}`}
        >
          <span className="live-toggle-label">LIVE</span>
          <span className="live-toggle-hint">{liveMode ? "tap to disable" : "tap to enable real-time input"}</span>
        </button>
      )}
      <div className="chat-buttons" style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
        {/* Desktop: compact LIVE button inline with key buttons (hidden on mobile via CSS) */}
        {onSendData && (
          <button
            type="button"
            onClick={() => { vibrate(15); setLiveMode((v) => { if (!v) { setText(SENTINEL); } else { setText(""); } return !v; }); }}
            className={`live-toggle-desktop ${liveMode ? "live-toggle-on" : ""}`}
            style={keyBtnStyle}
          >
            LIVE
          </button>
        )}
        {KEY_BUTTONS.map((btn) => (
          <button
            key={btn.label}
            type="button"
            onClick={() => { vibrate(10); btn.keys.forEach((k) => sendKeyWithModifiers(k)); }}
            style={keyBtnStyle}
          >
            {btn.label}
          </button>
        ))}
        {/* Modifier toggle buttons */}
        <button
          type="button"
          onClick={() => { vibrate(10); setCtrlActive((v) => !v); }}
          style={ctrlActive ? modifierActiveStyle : keyBtnStyle}
          title="Toggle Ctrl modifier for next key"
        >
          Ctrl
        </button>
        <button
          type="button"
          onClick={() => { vibrate(10); setShiftActive((v) => !v); }}
          style={shiftActive ? modifierActiveStyle : keyBtnStyle}
          title="Toggle Shift modifier for next key"
        >
          Shift
        </button>
        {/* Paste: read clipboard and send as data */}
        {onSendData && (
          <button
            type="button"
            onClick={async () => {
              vibrate(10);
              try {
                const text = await navigator.clipboard.readText();
                if (text) onSendData(text);
              } catch {
                // Fallback: prompt user
                const text = prompt("Paste text:");
                if (text) onSendData(text);
              }
            }}
            style={keyBtnStyle}
            title="Paste clipboard"
          >
            Paste
          </button>
        )}
        {/* D-Pad: swipe for arrow keys */}
        <DPad onDirection={handleDpadDirection} />
      </div>
    </div>
  );
}
