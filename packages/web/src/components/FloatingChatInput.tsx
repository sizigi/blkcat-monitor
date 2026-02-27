import React, { useState, useCallback } from "react";
import { ChatInput, DPad, vibrate } from "./ChatInput";
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

  const handleDirection = useCallback((dir: "Up" | "Down" | "Left" | "Right") => {
    onSendKey(dir);
  }, [onSendKey]);

  if (!open) {
    return (
      <div className="floating-input-bar">
        <DPad onDirection={handleDirection} size={40} />
        <button
          onClick={() => { vibrate(10); onSendKey("Enter"); }}
          onMouseDown={(e) => e.preventDefault()}
          className="floating-input-bar-circle"
          title="Send Enter"
        >
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9,10 4,15 9,20" />
            <path d="M20,4 L20,11 C20,13.2 18.2,15 16,15 L4,15" />
          </svg>
        </button>
        <button
          onClick={() => setOpen(true)}
          className="floating-input-btn"
          title="Open input"
        >
          <TerminalSquare size={22} />
        </button>
      </div>
    );
  }

  return (
    <div className="floating-input-panel">
      <button
        onClick={() => setOpen(false)}
        className="floating-input-btn floating-input-btn-close"
        title="Close input"
      >
        <X size={14} />
      </button>
      <ChatInput
        key={inputKey}
        onSendText={onSendText}
        onSendKey={onSendKey}
        onSendData={onSendData}
        initialValue={initialValue}
        onInputChange={onInputChange}
      />
    </div>
  );
}
