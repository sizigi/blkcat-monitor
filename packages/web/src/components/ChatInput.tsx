import React, { useState } from "react";

interface ChatInputProps {
  onSend: (text: string) => void;
}

export function ChatInput({ onSend }: ChatInputProps) {
  const [text, setText] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed + "\n");
    setText("");
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, padding: 8 }}>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type a command..."
        style={{
          flex: 1,
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: "6px 10px",
          color: "var(--text)",
          fontSize: 14,
        }}
      />
      <button
        type="submit"
        style={{
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          padding: "6px 16px",
          cursor: "pointer",
          fontSize: 14,
        }}
      >
        Send
      </button>
    </form>
  );
}
