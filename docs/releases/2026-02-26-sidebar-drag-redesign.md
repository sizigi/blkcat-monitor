# Release Notes — 2026-02-26: Sidebar & Drag Redesign

**Range:** `14c9add..3935d0b` (18 commits)
**Date:** 2026-02-26
**Scope:** 28 files changed, +2255 / −995 lines

---

## Highlights

This release overhauls the sidebar layout, drag-and-drop interactions, and mobile input experience. The old tmux-based join/break pane protocol is replaced by client-side **Views** (multi-pane layouts) and **terminal attachment** concepts. Sessions are now grouped by project directory (CWD) instead of CLI/terminal split.

---

## New Features

### Sidebar CWD-Based Project Grouping
- Sessions grouped by working directory — CLI session cwds become anchor roots, terminals in matching directories are grouped under them
- Collapsible group headers with inline rename and localStorage persistence
- Drag-to-reorder CWD groups within a machine (`useCwdGroupOrder` hook)
- Drag-to-reorder machines across the sidebar (`useMachineOrder` hook)

### Drag-and-Drop Redesign
- **Drag session → session (center):** creates a cross-machine split View
- **Drag session → session (edge, same group):** reorder via tmux swap-pane/swap-window, with thick accent line indicator
- **Shift + drag terminal → CLI session:** attach terminal as child under CLI
- **Drag attached terminal out:** detach from parent CLI
- **Drag session → View tab:** add pane to existing View
- Edge zone detection (top/bottom 8px) distinguishes reorder from split view intent

### Terminal Management
- Attached terminals render indented under parent CLI with collapse chevron
- Hide/show individual terminals via `>_` dropdown menu
- Global hide all terminals toggle; dropdown lists all hidden terminals for selective restore
- Terminal badge styling (bordered pill with `>_`)

### Floating Chat Input
- Shared `FloatingChatInput` component replaces inline ChatInput on both mobile and desktop
- `>_` FAB button opens slide-up panel with text input and function key buttons
- Function key buttons (Tab, Esc, Ctrl, Shift, Enter) always visible in floating panel
- Mobile split view uses floating keyboard button overlay

### Sidebar Visual Polish
- Section headers with accent borders and icons
- Hover-reveal action buttons (settings, reload, close)
- Hide action button (−) before close (×) for terminal sessions
- Machine row drag cursor (`grab`)
- Drop target indicators: highlight background (center), accent line (edge)

### Views Enhancements
- Views section moved below machines (bottom-aligned in scroll area)
- Auto-delete views when last pane is removed
- Double-click session to open individually (bypass grid)
- Keyboard navigation: `~` as alternate nav prefix, `j`/`k` to cycle panes in grid
- Pane focus highlight: accent header background + border
- AgentManager collapsed into panel tab with Plug icon

### DPad Improvements (Mobile)
- Larger touch target (32px → 44px), lower swipe threshold
- Tap-to-press quadrant fallback for old iOS
- CSS pulse animation as haptic feedback substitute
- `preventDefault` on touchMove to fix old iOS scroll interception

---

## Bug Fixes

- **Drag-to-reorder sessions restored** — edge zone detection (top/bottom 8px) triggers reorder, center triggers split view creation (`3935d0b`)
- **Hidden terminals dropdown** — now lists all non-CLI non-attached terminals when globally hidden, not just individually hidden ones (`ebe35f9`)
- **Terminal hide button logic** — `>_` button behavior depends on hidden state; attached terminals excluded from global hide (`55d8ed1`)
- **Split view focus** — sidebar click reliably focuses correct xterm via sequence counter, preventing stale focus (`fbccbc0`, `ddb1459`)
- **Tmux Shift+key combos** — Shift+Tab now correctly sends `BTab` instead of `S-Tab` (`7c241a0`)
- **Drag lag** — transparent drag image, ref-based drop target, pointer-events isolation during drag (`6e42eea`)
- **Mobile viewport height** — floating buttons and layout respect dynamic viewport height (`4be85b2`)

---

## Refactoring

- **Removed join/break pane protocol** — `ServerJoinPaneMessage`, `ServerBreakPaneMessage` and corresponding dashboard messages removed from shared types, server handlers, and agent code. `SplitView.tsx` component deleted. Replaced by client-side Views and terminal attachment. (`5800a41`)
- **Removed window sub-grouping** — flat session list under CWD groups instead of nested window groups
- **Removed session numbering badges** — machine badges retained

---

## New Hooks

| Hook | Purpose |
|------|---------|
| `useAttachedTerminals` | localStorage-backed terminal-to-CLI attachment and hide/show |
| `useCwdGroupOrder` | localStorage-backed per-machine CWD group ordering |
| `useMachineOrder` | localStorage-backed machine ordering across sidebar |
| `useGroupNames` | localStorage-backed custom names for CWD groups |

---

## Files Changed

- **Sidebar.tsx** — major rewrite (+840/−305 lines): CWD grouping, drag zones, attached terminals, machine reorder
- **App.tsx** — wiring for new hooks and View/attach/drag callbacks
- **CrossMachineSplitView.tsx** — focus sync, floating input
- **SplitView.tsx** — deleted (replaced by Views)
- **protocol.ts** — removed join/break messages
- **server.ts** — removed join/break handlers
- **index.css** — drop indicators, floating input, terminal badge styles
- **4 new hooks**, **2 new components** (FloatingChatInput, Icons additions)
