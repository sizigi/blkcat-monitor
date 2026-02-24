# Reload Session Fixes Design

## Problem

The reload session feature has four issues:

1. **Silent `respawnPane` failure** — `handleReloadSession` ignores the return value of `cap.respawnPane()`, giving zero feedback when tmux fails.
2. **Auto-discovery race condition** — After `respawnPane`, `pane_current_command` briefly shows `bash` (from `bash -ic "claude --resume"`). If the 30s auto-discovery fires during this window, the session is removed from tracking.
3. **Session already gone** — If the CLI process exited before reload is clicked, `captures.get(sessionId)` returns `undefined` and the reload silently does nothing.
4. **Stale sessionIds** — After reload, the old Claude session UUID stays in `sessionIds` until the hooks server receives a new event.

## Design

### Auto-Discovery Grace Period

Add `reloadGracePanes: Map<string, number>` in `index.ts`. On reload, record `paneId -> Date.now()`. In the auto-discovery interval, skip removing sessions in the grace map that are less than 10s old. Clean expired entries each cycle.

### Error Checking & Response Message

Check `respawnPane` return value. Send a `reload_session_result` message back through the server to the dashboard with `success: boolean` and optional `error: string`.

New protocol messages follow the existing `deploy_result` / `settings_result` pattern:

- Agent -> Server: `{ type: "reload_session_result", sessionId, success, error? }`
- Server -> Dashboard: `{ type: "reload_session_result", machineId, sessionId, success, error? }`

### Dashboard Feedback

`useSocket` exposes a `reloadResults` map. `Sidebar` shows a brief inline icon (checkmark or error) next to the session that auto-clears after 3 seconds.

### Clear Stale sessionIds

Delete the old `sessionIds` entry on successful reload so the hooks server repopulates it from the new session.

### Connection Interface

Add `sendReloadResult(sessionId, success, error?)` to the `conn` interface, implemented in both `AgentConnection` and `AgentListener`.

## Files

| File | Change |
|------|--------|
| `packages/shared/src/protocol.ts` | New message types + parser updates |
| `packages/agent/src/index.ts` | Grace period, error checking, send result, clear sessionIds |
| `packages/agent/src/connection.ts` | `sendReloadResult` method |
| `packages/agent/src/listener.ts` | `sendReloadResult` method |
| `packages/server/src/server.ts` | Route result to dashboards |
| `packages/web/src/hooks/useSocket.ts` | Handle result, expose state |
| `packages/web/src/components/Sidebar.tsx` | Inline reload feedback |
