# Hook Event Pipeline Design

## Overview

A pipeline that captures Claude Code hook events and streams them through blkcat-monitor: Claude Code hooks -> agent HTTP endpoint -> server -> dashboard event feed.

## Motivation

blkcat-monitor currently monitors Claude sessions by polling tmux terminal output. This misses structured lifecycle events (tool use, session start/stop, prompt submission, etc.) that Claude Code exposes via its hooks system. By tapping into hooks, blkcat gains:

- Real-time dashboard notifications of Claude activity
- Accurate session state tracking beyond terminal output parsing
- A foundation for server-side automation (future)

## Architecture

```
Claude Code hook fires
  -> blkcat-hook.sh reads stdin JSON, adds $TMUX_PANE
  -> POST http://localhost:HOOKS_PORT/hooks
  -> Agent maps tmux_pane to sessionId, wraps with machineId
  -> Sends hook_event message to server via WebSocket
  -> Server stores in ring buffer, broadcasts to dashboards
  -> Dashboard displays in event feed panel
```

## Components

### 1. Hook Script (blkcat-hook.sh)

Bundled with the agent package. A small shell script that:

- Reads Claude Code's JSON event from stdin
- Reads `$TMUX_PANE` to identify which pane the Claude session is in
- POSTs to `http://localhost:$BLKCAT_HOOKS_PORT/hooks` with the event JSON + pane ID
- Runs fire-and-forget (`&`) so it never blocks Claude Code

```bash
#!/bin/bash
EVENT=$(cat)
PAYLOAD=$(echo "$EVENT" | jq -c --arg pane "$TMUX_PANE" '. + {tmux_pane: $pane}')
curl -s -X POST "http://localhost:${BLKCAT_HOOKS_PORT:-3001}/hooks" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" >/dev/null 2>&1 &
```

### 2. Agent HTTP Endpoint

The agent starts a small HTTP server on `BLKCAT_HOOKS_PORT` (default 3001):

- In listener mode: add HTTP handling to the existing Bun.serve instance
- In outbound mode: start a new small Bun.serve for HTTP only

Endpoint: `POST /hooks`

- Validates the payload has a `hook_event_name` field
- Maps `tmux_pane` to blkcat `sessionId` using the agent's known pane mappings:
  - `$TMUX_PANE` uses tmux's internal `%N` format (e.g. `%0`, `%1`)
  - blkcat tracks panes in `session:window.pane` format (e.g. `dev:1.0`)
  - Resolution: runs `tmux display-message -p -t %N '#{session_name}:#{window_index}.#{pane_index}'` to convert, then checks against monitored captures
- Wraps with `machineId` and `timestamp`
- Forwards as a `hook_event` message to the server

### 3. Auto-Install Hooks in Claude Code Settings

On agent startup:

1. Read `~/.claude/settings.json` (create if missing)
2. Ensure `hooks` object exists
3. For each Claude Code event name, add a hook entry if not already present:
   ```json
   {
     "matcher": "",
     "hooks": [
       {
         "type": "command",
         "command": "/absolute/path/to/blkcat-hook.sh",
         "timeout": 10,
         "async": true
       }
     ]
   }
   ```
4. All hooks use `"async": true` so they never block Claude Code
5. Script path resolved to the absolute path of the bundled script
6. If user already has hooks for an event, append to the array (don't replace)
7. Agent identifies its own hooks by the script path for idempotent updates

Events to register: SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, Notification, SubagentStart, SubagentStop, Stop, SessionEnd, PermissionRequest, TeammateIdle, TaskCompleted, ConfigChange, PreCompact.

### 4. Protocol Extension

New message type in `@blkcat/shared`:

**Agent -> Server -> Dashboard: `hook_event`**

```typescript
interface HookEventMessage {
  type: "hook_event";
  machineId: string;
  sessionId: string | null;    // mapped from tmux_pane, null if unmapped
  hookEventName: string;       // e.g. "PreToolUse", "SessionStart", "Stop"
  matcher: string | null;      // what matched (e.g. tool name "Bash")
  data: Record<string, unknown>;  // full event JSON from Claude Code
  timestamp: number;
}
```

The `data` field carries the raw Claude Code event JSON untransformed. The `hookEventName` and `sessionId` are extracted to top level for easy filtering.

### 5. Server-Side Handling

Changes to the server:

- `handleAgentMessage()` gets a new case for `hook_event`:
  - Store event in per-machine ring buffer (configurable, default 100 events)
  - Broadcast to all connected dashboards
- `getSnapshot()` includes `recentEvents` in the machine snapshot
- Empty `handleHookEvent(event)` function as extension point for future server-side automation

```typescript
interface MachineSnapshot {
  machineId: string;
  sessions: SessionInfo[];
  lastSeen: number;
  recentEvents?: HookEventMessage[];  // from ring buffer
}
```

### 6. Dashboard Event Feed

New UI: a collapsible right-side panel.

- Event list: chronological, most recent at top
- Each event row: timestamp, color-coded event type badge, session name, summary
  - e.g. "Bash: `npm test`" for PostToolUse, "Session started" for SessionStart
- Filtering: by event type (dropdown/checkboxes) and machine
- Click to expand: shows full event JSON data
- Auto-scroll: new events appear at top, pauses when user scrolls up

## Key Decisions

- All hooks are `async: true` -- never block Claude Code
- Event data passes through untransformed (future-proof)
- Session correlation via `$TMUX_PANE` environment variable (resolved from `%N` format to `session:window.pane` via `tmux display-message`)
- Ring buffer is in-memory only, no persistence across server restarts
- Agent HTTP server on separate port from listener WebSocket (BLKCAT_HOOKS_PORT)

### 7. Session Reload

A "Reload" button in the session detail header kills the running Claude Code process and restarts it with `--resume` in the same tmux pane. This lets users reload skills, plugins, and hooks without losing session context.

Flow: Dashboard sends `reload_session` -> Server forwards to agent -> Agent calls `tmux respawn-pane -k -t <target> 'claude --resume'`.

The pane ID is preserved so the session stays in the captures map and continues to be monitored. Previous output lines are cleared so the fresh output is sent immediately.

## Future Extensions

- Server-side automation: register handlers in `handleHookEvent()` to trigger actions on specific events (webhooks, Slack notifications, scripts)
- Event persistence: store events to disk/database for historical analysis
- Event-driven session management: auto-restart sessions, auto-scale agents based on hook events
