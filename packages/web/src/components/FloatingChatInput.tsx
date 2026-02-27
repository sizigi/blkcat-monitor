import React, { useState, useCallback, useRef, useEffect } from "react";
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
  /** Keyboard height in px (0 when keyboard is closed) */
  keyboardOffset?: number;
  /** Reports the total height obscured by this component (panel height + keyboard) */
  onObscuredHeight?: (height: number) => void;
}

export function FloatingChatInput({
  onSendText,
  onSendKey,
  onSendData,
  inputKey,
  initialValue,
  onInputChange,
  keyboardOffset = 0,
  onObscuredHeight,
}: FloatingChatInputProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Report total obscured height whenever panel size or keyboard changes
  useEffect(() => {
    if (!onObscuredHeight) return;
    if (!open) {
      onObscuredHeight(0);
      return;
    }
    const panel = panelRef.current;
    if (!panel) return;

    const report = () => onObscuredHeight(panel.offsetHeight + keyboardOffset);

    // Observe panel size changes (e.g. textarea grows)
    const ro = new ResizeObserver(report);
    ro.observe(panel);
    report();
    return () => ro.disconnect();
  }, [open, keyboardOffset, onObscuredHeight]);

  const handleDirection = useCallback((dir: "Up" | "Down" | "Left" | "Right") => {
    onSendKey(dir);
  }, [onSendKey]);

  if (!open) {
    return (
      <div className="floating-input-bar" style={keyboardOffset > 0 ? { bottom: keyboardOffset + 16 } : undefined}>
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
    <div ref={panelRef} className="floating-input-panel" style={keyboardOffset > 0 ? { bottom: keyboardOffset } : undefined}>
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
