import React, { useState, useRef, useCallback } from "react";

interface ChatInputProps {
  onSendText: (text: string) => void;
  onSendKey: (key: string) => void;
  onSendData?: (data: string) => void;
}

const KEY_BUTTONS: { label: string; keys: string[] }[] = [
  { label: "Enter", keys: ["Enter"] },
  { label: "Esc", keys: ["Escape"] },
  { label: "Esc Esc", keys: ["Escape", "Escape"] },
  { label: "Up", keys: ["Up"] },
  { label: "Down", keys: ["Down"] },
  { label: "Left", keys: ["Left"] },
  { label: "Right", keys: ["Right"] },
  { label: "Home", keys: ["Home"] },
  { label: "End", keys: ["End"] },
  { label: "Tab", keys: ["Tab"] },
  { label: "Ctrl+C", keys: ["C-c"] },
  { label: "Ctrl+O", keys: ["C-o"] },
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

export function ChatInput({ onSendText, onSendKey, onSendData }: ChatInputProps) {
  const [text, setText] = useState("");
  const [liveMode, setLiveMode] = useState(false);
  const composingRef = useRef(false);

  function handleSend() {
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
    // Place cursor at end (after the sentinel space)
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) el.setSelectionRange(SENTINEL.length, SENTINEL.length);
    });
  }, []);

  const handleLiveChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (!onSendData) return;

    if (composingRef.current) {
      // During IME composition: show the composing text, don't send yet
      setText(newValue);
      return;
    }

    if (newValue.length > SENTINEL.length) {
      // Characters added — send the new part (after the sentinel)
      const added = newValue.slice(SENTINEL.length);
      if (added) onSendData(added);
      resetLiveInput();
    } else if (newValue.length < SENTINEL.length) {
      // Sentinel was deleted → user pressed Backspace
      onSendKey("BSpace");
      resetLiveInput();
    } else {
      setText(newValue);
    }
  }, [onSendData, onSendKey, resetLiveInput]);

  const handleCompositionEnd = useCallback((e: React.CompositionEvent<HTMLTextAreaElement>) => {
    composingRef.current = false;
    if (!onSendData) return;
    const committed = e.data;
    if (committed) onSendData(committed);
    resetLiveInput();
  }, [onSendData, resetLiveInput]);

  const handleLiveKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.isComposing || composingRef.current) return;
    if (!onSendData) return;

    // Special keys: intercept and send as terminal keys
    const keyMap: Record<string, string> = {
      Enter: "Enter", Tab: "Tab", Escape: "Escape",
      ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
      Home: "Home", End: "End",
    };
    // Backspace is handled via onChange (sentinel deletion) for mobile compatibility,
    // but also catch it here for desktop where keydown is reliable
    const mapped = keyMap[e.key];
    if (mapped) {
      e.preventDefault();
      onSendKey(mapped);
      return;
    }
    // Ctrl+C / Ctrl+O
    if (e.ctrlKey && e.key === "c") { e.preventDefault(); onSendKey("C-c"); return; }
    if (e.ctrlKey && e.key === "o") { e.preventDefault(); onSendKey("C-o"); return; }
  }, [onSendData, onSendKey]);

  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      {/* Mobile: full-width LIVE toggle (hidden on desktop via CSS) */}
      {onSendData && (
        <button
          type="button"
          onClick={() => { setLiveMode((v) => { if (!v) { setText(SENTINEL); } else { setText(""); } return !v; }); }}
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
            onClick={() => { setLiveMode((v) => { if (!v) { setText(SENTINEL); } else { setText(""); } return !v; }); }}
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
            onClick={() => btn.keys.forEach((k) => onSendKey(k))}
            style={keyBtnStyle}
          >
            {btn.label}
          </button>
        ))}
      </div>
      <div className="chat-buttons" style={{ display: "flex", gap: 8 }}>
        {liveMode ? (
          <div className="live-border-wrap">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleLiveChange}
              onCompositionStart={() => { composingRef.current = true; }}
              onCompositionEnd={handleCompositionEnd}
              onKeyDown={handleLiveKeyDown}
              placeholder=""
              rows={1}
              style={{
                width: "100%",
                background: "var(--bg-tertiary)",
                border: "2px solid transparent",
                borderRadius: 4,
                padding: "6px 10px",
                color: "var(--text)",
                fontSize: 14,
                resize: "none",
                fontFamily: "inherit",
                boxSizing: "border-box",
              }}
            />
          </div>
        ) : (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message... (Ctrl+Enter to submit)"
            rows={2}
            style={{
              flex: 1,
              background: "var(--bg-tertiary)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "6px 10px",
              color: "var(--text)",
              fontSize: 14,
              resize: "vertical",
              fontFamily: "inherit",
            }}
          />
        )}
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
    </div>
  );
}
