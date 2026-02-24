# Codex CLI Support Design

**Date:** 2026-02-24
**Status:** Approved

## Goal

Add OpenAI Codex CLI support to blkcat-monitor so it can discover, start, monitor, reload, and resume both Claude Code and Codex CLI sessions.

## Key Decisions

- **Hooks gap:** Codex has no hooks system. Session ID tracking uses filesystem polling of `~/.codex/sessions/`.
- **Tool detection:** Auto-detect from tmux `pane_current_command` + explicit tool selector in Start Session modal.
- **Reload UX:** Tool-aware modal — shows appropriate flags per tool (Claude: `--dangerously-skip-permissions`, Codex: `--full-auto`).
- **Visual distinction:** Subtle `(codex)` label in sidebar, similar to existing `(ssh)` tag. Claude sessions have no label (default).
- **Settings/skills:** Deferred to v2. Settings panel stays Claude-only.

## Data Model

### SessionInfo (shared protocol)

Add `cliTool` field:

```typescript
export interface SessionInfo {
  id: string;
  name: string;
  target: "local" | "ssh";
  host?: string;
  args?: string;
  cliTool?: "claude" | "codex";  // undefined = "claude" for backwards compat
}
```

### CLI Tool Config

Centralized lookup in `@blkcat/shared` providing per-tool constants:

```typescript
export const CLI_TOOLS = {
  claude: {
    command: "claude",
    resumeFlag: (id?: string) => id ? `--resume ${id}` : "--resume",
    flags: [
      { flag: "--dangerously-skip-permissions", color: "var(--red)" },
    ],
    configDir: "~/.claude",
  },
  codex: {
    command: "codex",
    resumeFlag: (id?: string) => id ? `resume ${id}` : "resume --last",
    flags: [
      { flag: "--full-auto", color: "var(--red)" },
    ],
    configDir: "~/.codex",
  },
} as const;
```

## Agent Changes

### Discovery (`discovery.ts`)

- Rename `discoverClaudeSessions` → `discoverCliSessions`
- Match both `"claude"` and `"codex"` in `pane_current_command`
- Tag each discovered session with `cliTool`

### Session Start (`capture.ts`, `index.ts`)

- `startSession` receives `cliTool` parameter, uses `CLI_TOOLS[cliTool].command`
- `handleStartSession` receives `cliTool` from dashboard protocol message
- Default session name uses tool name: `codex --full-auto` or `claude --resume`

### Codex Session ID Polling (new: `codex-sessions.ts`)

- Periodically scans `~/.codex/sessions/YYYY/MM/DD/` for session files
- Correlates with active Codex tmux panes by timestamp proximity
- Writes to shared `sessionIds` map (renamed from `claudeSessionIds`)
- Runs alongside existing hooks-based tracking for Claude

### Reload (`index.ts`)

- Looks up `cliTool` from session, uses `CLI_TOOLS` config to build command
- Claude: `claude --resume <id> [args]`
- Codex: `codex resume <id> [args]`

### Hooks

- Claude Code hooks continue as-is (`hooks-install.ts`, `hooks-server.ts`)
- No hooks installation for Codex (not supported by Codex CLI)
- Both systems feed into the same `sessionIds` map

## Protocol Changes

### `DashboardStartSessionMessage`

Add `cliTool?: "claude" | "codex"`.

### Server Routing

Forward `cliTool` in `start_session` messages to agents.

## Web UI Changes

### Start Session Modal

- Tool selector: two pill buttons (Claude / Codex) at the top
- Flag options update dynamically based on selected tool
- Selected tool sent via `start_session` message

### Reload Session Modal

- Reads `cliTool` from the session being reloaded (new prop)
- Shows tool-appropriate flags (Claude: `--dangerously-skip-permissions`, Codex: `--full-auto`)
- Resume toggle adapts: `--resume` flag vs `resume` subcommand

### Sidebar

- `(codex)` label next to Codex session names, styled like existing `(ssh)` label
- Reload tooltip adapts: `"Reload session (codex resume)"` vs `"Reload session (claude --resume)"`

## Deferred to v2

- Codex config/settings management (`~/.codex/` settings panel)
- Codex hooks system (if OpenAI adds one)
- Skills deployment for Codex
- Additional CLI tools (design is extensible via `CLI_TOOLS` map)

## Files Changed

| File | Change |
|---|---|
| `packages/shared/src/protocol.ts` | Add `cliTool` to `SessionInfo`, `DashboardStartSessionMessage`; add `CLI_TOOLS` config |
| `packages/agent/src/discovery.ts` | Rename function, match both tools, tag `cliTool` |
| `packages/agent/src/discovery.test.ts` | Update tests for both tools |
| `packages/agent/src/capture.ts` | `startSession` accepts `cliTool` param |
| `packages/agent/src/index.ts` | Generic `sessionIds`, tool-aware reload/start, Codex session polling |
| `packages/agent/src/codex-sessions.ts` | New: polls `~/.codex/sessions/` for session IDs |
| `packages/server/src/server.ts` | Forward `cliTool` in start_session routing |
| `packages/web/src/components/StartSessionModal.tsx` | Tool selector, dynamic flag options |
| `packages/web/src/components/ReloadSessionModal.tsx` | Tool-aware flags and resume behavior |
| `packages/web/src/components/Sidebar.tsx` | `(codex)` label, adaptive tooltip |
| `packages/web/src/hooks/useSocket.ts` | Pass `cliTool` in start_session |
