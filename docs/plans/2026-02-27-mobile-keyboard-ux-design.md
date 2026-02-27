# Mobile Keyboard UX Fix

## Problem

On smartphones, the current `interactive-widget=resizes-content` approach causes two issues:

1. **Floating input bar covers the last terminal lines** — the most recent output is hidden behind ChatInput
2. **Terminal resize thrashing** — the layout constantly resizes as the keyboard animates open/close, causing visual jitter and excessive `fit.fit()` + server resize messages

## Approach: Overlay keyboard, reposition ChatInput, transform terminal

Stop resizing the layout when the keyboard opens. Instead, let the keyboard overlay the viewport. Reposition the floating input bar above the keyboard, and shift the terminal canvas up via CSS transform so the last lines are visible.

## Design

### 1. Viewport & Layout (stop resizing)

- **`index.html`**: Change `interactive-widget=resizes-content` to `interactive-widget=overlays-content`
- **`main.tsx`**: Remove the `visualViewport` → `--app-height` listener entirely
- **`index.css`**: Replace `height: var(--app-height, 100dvh)` with `height: 100dvh` in mobile media query
- **`TerminalOutput.tsx`**: On mobile, skip `fit.fit()` when the resize is height-only (keyboard open/close). Width changes still trigger refit (orientation change).

### 2. ChatInput positioning above keyboard

- **`FloatingChatInput.tsx`**: Add a `visualViewport` listener that tracks keyboard height
- Calculate: `keyboardHeight = window.innerHeight - visualViewport.height - visualViewport.offsetTop`
- Set `bottom: keyboardHeight` on `.floating-input-panel` and `.floating-input-btn` when keyboard is open
- On desktop, `visualViewport.height === window.innerHeight`, so `bottom` stays 0 — no behavior change

### 3. Terminal visibility via CSS transform

- Apply `transform: translateY(-offset)` on the xterm container where `offset` = panel height + keyboard height
- Terminal keeps its exact rows/cols — canvas shifts up so last lines are visible above the panel
- Top lines shift off-screen (latest output is what matters)
- When panel closes or keyboard closes, transform returns to 0
- Terminal container gets `overflow: hidden` to clip shifted content at the top
- Communication: FloatingChatInput exposes the total obscured offset via CSS variable or callback; TerminalOutput reads it and applies transform
- No transition during keyboard animation (instant). Optional quick transition (100ms) when toggling panel.

### 4. Edge cases

- **Desktop**: No effect — keyboardHeight is always 0
- **Panel closed + keyboard open**: No transform needed. xterm textarea has `inputmode="none"` on mobile
- **Orientation change**: Width change triggers legitimate refit; height-only guard allows this
- **iOS PWA mode**: `overlays-content` may not be respected in older standalone PWA mode. `visualViewport` listener still correctly reports keyboard height, so transform approach works regardless

### 5. Cleanup

- Remove `--app-height` CSS variable and all references
- Remove `visualViewport` → `--app-height` listener from `main.tsx`

## Files touched

1. `packages/web/index.html` — viewport meta tag
2. `packages/web/src/main.tsx` — remove visualViewport listener
3. `packages/web/src/index.css` — remove `--app-height`, use `100dvh`
4. `packages/web/src/components/FloatingChatInput.tsx` — keyboard height tracking + position offset
5. `packages/web/src/components/TerminalOutput.tsx` — accept offset prop, apply transform, height-only resize guard
6. `packages/web/src/components/SessionDetail.tsx` — wire offset between FloatingChatInput and TerminalOutput
