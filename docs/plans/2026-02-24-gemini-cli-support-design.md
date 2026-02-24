# Gemini CLI Support Design

**Date:** 2026-02-24
**Status:** Approved

## Goal

Add Google Gemini CLI support to blkcat-monitor as a third CLI tool alongside Claude Code and Codex CLI, using the existing extensible `CLI_TOOLS` architecture.

## Key Decisions

- **Session ID tracking:** Poll `~/.gemini/tmp/*/chats/` filesystem (same approach as Codex, one extra directory level for project hash).
- **Flags:** Expose `--yolo` only (equivalent to Claude's `--dangerously-skip-permissions`). Defer `--approval-mode` granular control to v2.
- **Visual distinction:** `(gemini)` label in sidebar, same style as `(codex)` and `(ssh)`.
- **Hooks/extensions:** Deferred to v2. Discovery, start, monitor, reload, resume only.
- **Resume syntax:** `--resume <id>` (same flag syntax as Claude, unlike Codex's subcommand).

## Data Model

### CliTool type

Widen the union:

```typescript
export type CliTool = "claude" | "codex" | "gemini";
```

### CLI_TOOLS entry

```typescript
gemini: {
  command: "gemini",
  resumeFlag: (id?: string) => id ? `--resume ${id}` : "--resume",
  flags: [{ flag: "--yolo", color: "var(--red)" }],
  configDir: "~/.gemini",
},
```

All existing protocol messages (`SessionInfo.cliTool`, `DashboardStartSessionMessage.cliTool`, etc.) already accept the union type — extending it propagates everywhere automatically.

## Agent Changes

### Discovery (`discovery.ts`)

Add `"gemini"` to the `CLI_COMMANDS` set. Sessions with `pane_current_command === "gemini"` get tagged `cliTool: "gemini"`.

### Session Start (`capture.ts`)

No changes needed — `startSession(args, cwd, cliTool)` already uses `CLI_TOOLS[cliTool].command`.

### Reload (`index.ts`)

No changes needed — `handleReloadSession` already uses `CLI_TOOLS[session.cliTool].resumeFlag(id)`.

### Gemini Session ID Polling (new: `gemini-sessions.ts`)

- Scans `~/.gemini/tmp/*/chats/` for session files
- Walks project hash directories, finds newest session by mtime
- Returns session ID or null
- Polls on same 5-second interval alongside Codex polling

### Connection/Listener

No changes — already generic over `CliTool`.

## Server Changes

No changes — already forwards `cliTool` generically.

## Web UI Changes

### Start Session Modal

- Add "Gemini" as third pill button in tool selector
- Flag options switch to `--yolo` when Gemini is selected

### Reload Session Modal

No changes — already reads from `CLI_TOOLS[tool]`.

### Sidebar

- `(gemini)` label for Gemini sessions
- Reload tooltip: `"Reload session (gemini --resume)"`

### useSocket

No changes — already passes `cliTool` generically.

## Deferred to v2

- Gemini hooks/extensions integration
- Gemini settings management (`~/.gemini/settings.json`)
- `--approval-mode` granular control (auto_edit, yolo, default)

## Files Changed

| File | Change |
|---|---|
| `packages/shared/src/protocol.ts` | Widen `CliTool` type, add `gemini` entry to `CLI_TOOLS` |
| `packages/shared/src/protocol.test.ts` | Add Gemini to CLI_TOOLS test |
| `packages/agent/src/discovery.ts` | Add `"gemini"` to `CLI_COMMANDS` set |
| `packages/agent/src/discovery.test.ts` | Add Gemini discovery test |
| `packages/agent/src/gemini-sessions.ts` | New: polls `~/.gemini/tmp/*/chats/` for session IDs |
| `packages/agent/src/gemini-sessions.test.ts` | New: test for Gemini session polling |
| `packages/agent/src/index.ts` | Wire Gemini session polling interval |
| `packages/web/src/components/StartSessionModal.tsx` | Add Gemini pill button |
| `packages/web/src/components/StartSessionModal.test.tsx` | Test Gemini tool selection |
| `packages/web/src/components/Sidebar.tsx` | `(gemini)` label |
| `packages/web/src/components/Sidebar.test.tsx` | Test `(gemini)` label |
| `README.md` | Document Gemini CLI support |
