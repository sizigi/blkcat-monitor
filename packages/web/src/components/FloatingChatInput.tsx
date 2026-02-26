import React, { useState } from "react";
import { ChatInput } from "./ChatInput";
import { TerminalSquare, X } from "./Icons";

interface FloatingChatInputProps {
  onSendText: (text: string) => void;
  onSendKey: (key: string) => void;
  onSendData: (data: string) => void;
  /** Unique key to reset ChatInput when active session changes */
  inputKey?: string;
  initialValue?: string;
  onInputChange?: (value: string) => void;
}

export function FloatingChatInput({
  onSendText,
  onSendKey,
  onSendData,
  inputKey,
  initialValue,
  onInputChange,
}: FloatingChatInputProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="floating-input-btn"
          title="Open input"
        >
          <TerminalSquare size={22} />
        </button>
      )}
      {open && (
        <div className="floating-input-panel">
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 8px 0" }}>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                lineHeight: 1,
                padding: "2px 4px",
              }}
            >
              <X size={14} />
            </button>
          </div>
          <ChatInput
            key={inputKey}
            onSendText={onSendText}
            onSendKey={onSendKey}
            onSendData={onSendData}
            initialValue={initialValue}
            onInputChange={onInputChange}
          />
        </div>
      )}
    </>
  );
}
