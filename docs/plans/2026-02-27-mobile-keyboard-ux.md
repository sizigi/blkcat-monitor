# Mobile Keyboard UX Fix — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop the terminal from resizing when the mobile keyboard opens; instead, float the input bar above the keyboard and shift the terminal canvas up so the last line stays visible.

**Architecture:** Change viewport meta to `overlays-content` so the keyboard overlays rather than resizes the layout. FloatingChatInput tracks keyboard height via `visualViewport` and positions itself above the keyboard. A new `useKeyboardOffset` hook provides the total obscured height (keyboard + panel) which TerminalOutput uses as a CSS `translateY` to keep the last lines visible. The resize observer skips height-only changes on mobile to prevent refit thrashing.

**Tech Stack:** React 19, xterm.js, CSS transforms, `visualViewport` API

---

### Task 1: Create `useKeyboardOffset` hook

**Files:**
- Create: `packages/web/src/hooks/useKeyboardOffset.ts`

**Step 1: Write the hook**

```typescript
import { useState, useEffect } from "react";

/**
 * Tracks the height of the virtual keyboard on mobile using the visualViewport API.
 * Returns the pixel offset from the bottom of the window to the top of the keyboard.
 * Returns 0 on desktop or when no keyboard is visible.
 */
export function useKeyboardOffset(): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const kb = window.innerHeight - vv.height - vv.offsetTop;
      setOffset(Math.max(0, Math.round(kb)));
    };

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return offset;
}
```

**Step 2: Commit**

```bash
git add packages/web/src/hooks/useKeyboardOffset.ts
git commit -m "feat(web): add useKeyboardOffset hook for mobile keyboard tracking"
```

---

### Task 2: Stop layout from resizing on keyboard open

**Files:**
- Modify: `packages/web/index.html:5` — change viewport meta tag
- Modify: `packages/web/src/main.tsx:6-15` — remove visualViewport → `--app-height` listener
- Modify: `packages/web/src/index.css:568-573` — remove `--app-height` usage

**Step 1: Change viewport meta tag**

In `packages/web/index.html`, line 5, change:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, interactive-widget=resizes-content" />
```
to:
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, interactive-widget=overlays-content" />
```

**Step 2: Remove visualViewport listener from main.tsx**

Replace `packages/web/src/main.tsx` with:
```typescript
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>
);
```

**Step 3: Update mobile CSS**

In `packages/web/src/index.css`, replace lines 568-573:
```css
@media (max-width: 768px) {
  /* Use --app-height (set by visualViewport listener in main.tsx)
     so the layout shrinks when the soft keyboard opens. */
  html, body, #root {
    height: var(--app-height, 100dvh);
  }
```
with:
```css
@media (max-width: 768px) {
  /* Fixed height — keyboard overlays content instead of resizing layout
     (interactive-widget=overlays-content in index.html). */
  html, body, #root {
    height: 100dvh;
  }
```

**Step 4: Commit**

```bash
git add packages/web/index.html packages/web/src/main.tsx packages/web/src/index.css
git commit -m "fix(web): stop layout from resizing on mobile keyboard open

Switch to interactive-widget=overlays-content and remove the
visualViewport → --app-height resize listener."
```

---

### Task 3: Float ChatInput above keyboard

**Files:**
- Modify: `packages/web/src/components/FloatingChatInput.tsx` — add keyboard offset positioning

**Step 1: Update FloatingChatInput to accept and apply keyboard offset**

Replace `packages/web/src/components/FloatingChatInput.tsx` with:
```tsx
import React, { useState, useRef, useEffect, useCallback } from "react";
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

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="floating-input-btn"
          style={keyboardOffset > 0 ? { bottom: keyboardOffset + 16 } : undefined}
          title="Open input"
        >
          <TerminalSquare size={22} />
        </button>
      )}
      {open && (
        <div
          ref={panelRef}
          className="floating-input-panel"
          style={keyboardOffset > 0 ? { bottom: keyboardOffset } : undefined}
        >
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
```

**Step 2: Commit**

```bash
git add packages/web/src/components/FloatingChatInput.tsx
git commit -m "feat(web): position FloatingChatInput above mobile keyboard

Accept keyboardOffset prop and report total obscured height via callback."
```

---

### Task 4: Apply CSS transform to terminal and guard height-only resizes

**Files:**
- Modify: `packages/web/src/components/TerminalOutput.tsx:7-18` — add `inputObscuredHeight` prop
- Modify: `packages/web/src/components/TerminalOutput.tsx:419-432` — guard resize handler against height-only changes on mobile
- Modify: `packages/web/src/components/TerminalOutput.tsx:587-592` — apply translateY transform

**Step 1: Add `inputObscuredHeight` to TerminalOutputProps**

In `packages/web/src/components/TerminalOutput.tsx`, add the new prop to the interface (line 17, before `hideFloatingButtons`):
```typescript
  /** Height in px obscured by floating input + keyboard — terminal shifts up by this amount */
  inputObscuredHeight?: number;
```

And destructure it in the component signature (line 24), adding `inputObscuredHeight` to the destructured props.

**Step 2: Guard resize handler against height-only changes**

Replace the resize handling block at lines 419-432 with:
```typescript
    // --- Resize handling (skip height-only changes on mobile to avoid keyboard thrashing) ---
    let fitTimer: ReturnType<typeof setTimeout> | undefined;
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    let lastWidth = containerRef.current.offsetWidth;

    const doFit = () => {
      const currentWidth = containerRef.current?.offsetWidth ?? lastWidth;
      // On mobile (touch device), ignore height-only changes (keyboard open/close)
      if ("ontouchstart" in window && currentWidth === lastWidth) return;
      lastWidth = currentWidth;

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
```

**Step 3: Apply transform to the outer wrapper div**

Replace the return statement's outer div (line 588) from:
```tsx
    <div style={{ position: "relative", flex: 1, minHeight: 0, minWidth: 0 }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", overflow: "hidden", background: "var(--bg)", touchAction: "none" }}
      />
```
to:
```tsx
    <div style={{ position: "relative", flex: 1, minHeight: 0, minWidth: 0, overflow: "hidden" }}>
      <div
        ref={containerRef}
        style={{
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "var(--bg)",
          touchAction: "none",
          transform: inputObscuredHeight ? `translateY(-${inputObscuredHeight}px)` : undefined,
        }}
      />
```

Note: `overflow: hidden` on the outer wrapper clips the terminal content that shifts above the top edge.

**Step 4: Commit**

```bash
git add packages/web/src/components/TerminalOutput.tsx
git commit -m "feat(web): shift terminal up by input obscured height on mobile

Apply CSS translateY to keep last lines visible above floating input.
Guard resize observer against height-only changes to prevent keyboard thrashing."
```

---

### Task 5: Wire everything together in SessionDetail

**Files:**
- Modify: `packages/web/src/components/SessionDetail.tsx`

**Step 1: Wire hook and props**

Replace `packages/web/src/components/SessionDetail.tsx` with:
```tsx
import React, { useState, useCallback } from "react";
import { TerminalOutput } from "./TerminalOutput";
import { FloatingChatInput } from "./FloatingChatInput";
import { Folder } from "./Icons";
import { useKeyboardOffset } from "../hooks/useKeyboardOffset";

interface SessionDetailProps {
  machineId: string;
  sessionId: string;
  sessionName: string;
  cwd?: string;
  lines: string[];
  cursor?: { x: number; y: number };
  logMapRef?: React.RefObject<Map<string, string[]>>;
  scrollbackMapRef?: React.RefObject<Map<string, string[]>>;
  subscribeScrollback?: (cb: (key: string) => void) => () => void;
  onRequestScrollback?: () => void;
  onSendText: (text: string) => void;
  onSendKey: (key: string) => void;
  onSendData: (data: string) => void;
  onResize?: (cols: number, rows: number, force?: boolean) => void;
}

export function SessionDetail({
  machineId,
  sessionId,
  sessionName,
  cwd,
  lines,
  cursor,
  logMapRef,
  scrollbackMapRef,
  subscribeScrollback,
  onRequestScrollback,
  onSendText,
  onSendKey,
  onSendData,
  onResize,
}: SessionDetailProps) {
  const displayCwd = cwd?.replace(/^\/home\/[^/]+/, "~")?.replace(/^\/root/, "~");
  const keyboardOffset = useKeyboardOffset();
  const [obscuredHeight, setObscuredHeight] = useState(0);
  const onObscuredHeight = useCallback((h: number) => setObscuredHeight(h), []);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, position: "relative" }}>
      <div
        style={{
          padding: "8px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-secondary)",
          display: "flex",
          alignItems: "center",
          gap: 8,
          overflow: "hidden",
          fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
        }}
      >
        <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{sessionName}</span>
        <span style={{ color: "var(--text-muted)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {machineId} / {sessionId}
        </span>
        {displayCwd && (
          <>
            <span style={{ color: "var(--border)", fontSize: 12 }}>|</span>
            <span style={{ color: "var(--text-muted)", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
              <Folder size={12} />
              {displayCwd}
            </span>
          </>
        )}
      </div>
      <TerminalOutput
        sessionKey={`${machineId}:${sessionId}`}
        lines={lines}
        cursor={cursor}
        logMapRef={logMapRef}
        scrollbackMapRef={scrollbackMapRef}
        subscribeScrollback={subscribeScrollback}
        onRequestScrollback={onRequestScrollback}
        onData={onSendData}
        onResize={onResize}
        inputObscuredHeight={obscuredHeight}
      />
      <FloatingChatInput
        inputKey={`${machineId}:${sessionId}`}
        onSendText={onSendText}
        onSendKey={onSendKey}
        onSendData={onSendData}
        keyboardOffset={keyboardOffset}
        onObscuredHeight={onObscuredHeight}
      />
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/web/src/components/SessionDetail.tsx
git commit -m "feat(web): wire keyboard offset and obscured height in SessionDetail"
```

---

### Task 6: Verify build and manual test

**Step 1: Run build**

```bash
cd packages/web && bunx vite build
```
Expected: Build succeeds with no type errors.

**Step 2: Run web tests**

```bash
cd packages/web && bunx vitest run
```
Expected: All existing tests pass.

**Step 3: Manual test on mobile**

Open the dev server on a phone (or Chrome DevTools device emulation with touch enabled):

1. Open a session, tap the floating input button
2. Tap the textarea — keyboard should open
3. Verify: terminal does NOT resize/thrash
4. Verify: input bar floats above keyboard
5. Verify: terminal shifts up so last line is visible above the input bar
6. Close keyboard — verify terminal snaps back to normal position
7. Rotate device — verify terminal refits correctly (width change)

**Step 4: Final commit if any adjustments needed**

```bash
git add -u && git commit -m "fix(web): adjust mobile keyboard UX after manual testing"
```
