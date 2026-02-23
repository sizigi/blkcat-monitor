# Mobile Responsive UI Design

## Summary

Make the blkcat-monitor web dashboard usable on smartphones (and tablets) so users can monitor and control Claude Code sessions on the go. All mobile changes are behind a `@media (max-width: 768px)` breakpoint — desktop layout is unchanged.

## Approach: Hybrid (CSS + useIsMobile hook)

CSS media queries handle layout shifts (sidebar drawer, full-screen panels, touch targets). A `useIsMobile()` hook handles behavioral differences (auto-close drawer on session select, toggle state).

## Mobile Layout

```
┌─────────────────────────┐
│ [☰] Session Name  [⚡][🔔]│  Top bar: hamburger, active session, panel tabs
├─────────────────────────┤
│                         │
│     Terminal Output     │  Full-width, full-height
│     (xterm.js)          │
│                         │
├─────────────────────────┤
│ [textarea............]  │  Chat input
│ [Enter][Esc][Tab][^C]   │  44px touch buttons
└─────────────────────────┘
```

**Sidebar** — Slide-out drawer from left, overlays terminal with backdrop. Tapping backdrop or selecting a session closes it.

**Right panels** (Events, Notifications, Skills) — Full-screen overlays with a back/close button.

## Terminal Sizing

xterm.js FitAddon already recalculates cols/rows on container resize. When the terminal fits to phone width (~45-50 cols), the existing resize message updates the tmux pane dimensions so output reflows cleanly.

Trade-off: viewing the same session on desktop and phone simultaneously causes the phone's resize to affect desktop. Acceptable (tmux limitation — one pane size per session).

## Touch & Input

- Chat input key buttons: 44px min touch targets with more padding/gaps
- Scroll mode: existing clickable overlay buttons work for touch; vim keys are keyboard-only
- No swipe gestures for v1 — hamburger button is sufficient

## Code Changes

### New: `useIsMobile.ts` hook
- `matchMedia("(max-width: 768px)")` listener returning boolean
- Used in App.tsx, Sidebar, panel components

### New CSS in `index.css`
- `@media (max-width: 768px)` block with classes for:
  - `.sidebar` → off-screen left drawer, slide-in transition
  - `.sidebar-backdrop` → semi-transparent overlay
  - `.panel-overlay` → full-screen overlay for Events/Notifications/Skills
  - `.mobile-topbar` → top bar with hamburger + session name + panel tabs
  - `.chat-buttons` → larger touch targets

### Component changes
- **App.tsx** — Mobile top bar, hamburger toggle, auto-close drawer on session select
- **Sidebar.tsx** — Add `className="sidebar"` for CSS drawer positioning
- **EventFeed / NotificationList / SkillsMatrix** — Close/back button in overlay mode
- **ChatInput.tsx** — Class for larger touch targets
- **TerminalOutput.tsx** — No changes (FitAddon handles it)

### No changes to
- Server, agent, or shared packages
- WebSocket protocol
- Desktop layout
