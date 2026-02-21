# Start Session Modal — Design

## Overview

Improve the Claude session starting experience on the dashboard by replacing the inline sidebar form with a modal dialog featuring a live directory browser, toggle chips for common CLI flags, and a red sidebar indicator for sessions running with `--dangerously-skip-permissions`.

## Protocol Changes

### New messages: Directory Browsing

**Dashboard → Server → Agent:**

```typescript
export interface DashboardListDirectoryMessage {
  type: "list_directory";
  requestId: string;
  machineId: string;
  path: string;
}
```

**Agent → Server → Dashboard:**

```typescript
export interface AgentDirectoryListingMessage {
  type: "directory_listing";
  requestId: string;
  path: string;
  entries: { name: string; isDir: boolean }[];
  error?: string;
}
```

`requestId` allows the dashboard to match responses to requests when multiple are in-flight.

### Updated SessionInfo

```typescript
export interface SessionInfo {
  id: string;
  name: string;
  target: "local" | "ssh";
  host?: string;
  args?: string;  // NEW — raw args string passed at start
}
```

Adding `args` lets the dashboard detect `--dangerously-skip-permissions` and apply visual indicators.

## Agent-Side Directory Listing

When the agent receives a `list_directory` message:

1. Resolve `~` to the user's home directory
2. Run `ls -1 -p <path>` via `Bun.spawnSync`
   - `-p` appends `/` to directory names for easy detection
3. Parse output into `{ name, isDir }[]` entries
4. Return a `directory_listing` response (or error string if path doesn't exist / no permission)

Handler added to both `connection.ts` and `listener.ts` callback interfaces. The listing function lives as a utility (in `capture.ts` or standalone).

## Modal File Explorer Component

The "+" button on a machine opens a centered modal dialog.

### Layout

```
┌─────────────────────────────────────────────┐
│  Start Session on [machine-name]        [×] │
├─────────────────────────────────────────────┤
│                                             │
│  Working Directory                          │
│  ┌─────────────────────────────────────┐    │
│  │ ~/projects/myapp               [↑]  │    │
│  ├─────────────────────────────────────┤    │
│  │ 📁 src/                             │    │
│  │ 📁 packages/                        │    │
│  │ 📄 package.json                     │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  Flags                                      │
│  ┌──────────┐ ┌─────────────────────────┐   │
│  │ --resume  │ │ --dangerously-skip-perm │   │
│  └──────────┘ └─────────────────────────┘   │
│                                             │
│  Additional args                            │
│  ┌─────────────────────────────────────┐    │
│  │ e.g. --model sonnet                 │    │
│  └─────────────────────────────────────┘    │
│                                             │
│                              [ Start ]      │
└─────────────────────────────────────────────┘
```

### File Browser Behavior

- Opens at `~` by default
- Current path shown at top with an "up" button to navigate to parent
- Click a folder to navigate into it
- Files shown but grayed out (not clickable) — provides context for recognizing the right project folder
- Current directory (shown in path bar) is what gets selected as CWD
- Loading spinner while waiting for `directory_listing` response

### Toggle Chips

- `--resume` and `--dangerously-skip-permissions` as clickable pill toggles
- Unselected: outlined border, muted text color
- Selected: filled background with `var(--accent)`
- Exception: `--dangerously-skip-permissions` uses `var(--red)` when selected

### Additional Args

A text input field for anything not covered by presets (e.g. `--model sonnet`).

### Component

New file: `StartSessionModal.tsx`
- Props: `machineId`, `machineName`, `onStart`, `onClose`, `listDirectory`
- Manages internal state for current path, entries, selected flags, additional args

## Red Sidebar Indicator

When a session's `args` contains `--dangerously-skip-permissions`:

- Session name text color: `var(--red)` instead of `var(--text)` / `var(--accent)`
- Status dot: red instead of blue/gray

Detection in `Sidebar.tsx`:
```typescript
const isDangerous = session.args?.includes("--dangerously-skip-permissions");
```

Everything else (selection, renaming, notification badge) stays the same.

## Server Routing

The server routes `list_directory` messages the same way as `start_session`:
1. Receive from dashboard WebSocket
2. Look up agent by `machineId`
3. Forward to agent (stripping `machineId`)

For `directory_listing` responses from agents:
1. Receive from agent WebSocket
2. Broadcast to all dashboard connections (or route by `requestId` if we track requester)

## Styling

Follows existing conventions:
- Inline React styles with CSS custom properties
- GitHub dark theme (`var(--bg)`, `var(--border)`, `var(--text)`, etc.)
- Modal backdrop: semi-transparent dark overlay
- No new CSS files — all inline styles
