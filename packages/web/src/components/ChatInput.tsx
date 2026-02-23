import React, { useState } from "react";

interface ChatInputProps {
  onSendText: (text: string) => void;
  onSendKey: (key: string) => void;
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

export function ChatInput({ onSendText, onSendKey }: ChatInputProps) {
  const [text, setText] = useState("");

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSendText(trimmed);
    onSendKey("Enter");
    setText("");
  }

  return (
    <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      <div className="chat-buttons" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
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
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message... (click Send or Ctrl+Enter to submit)"
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
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
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
      </div>
    </div>
  );
}
