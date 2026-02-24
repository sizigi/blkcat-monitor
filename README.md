# blkcat-monitor

A web dashboard for monitoring and interacting with Claude Code, Codex CLI, and Gemini CLI sessions via tmux across multiple machines, using an agent-push WebSocket architecture.

```
        Browser (React + xterm.js)
             | WS
        Central Server (Bun)
       /     |      \
    Agent   Agent   Agent
     |       |       |
    tmux    tmux    tmux (local + SSH targets)

  Connection modes:
    Agent -> Server   (default: agent connects outbound)
    Server -> Agent   (reverse: server dials agent listener)
```

Agents can connect outbound to the server (default), or the server can dial out to agents running in listener mode — useful when agents are behind NAT but the server can reach them. Both modes work simultaneously and use the same message protocol.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh/) runtime
- tmux

### Install

```bash
bun install
```

### 1. Start the server

```bash
bun packages/server/src/index.ts
```

The server listens on `0.0.0.0:3000` by default. Use `BLKCAT_HOST` and `BLKCAT_PORT` to change.

To serve the built dashboard as static files:

```bash
BLKCAT_STATIC_DIR=packages/web/dist bun packages/server/src/index.ts
```

### 2. Start an agent

On each machine you want to monitor:

```bash
BLKCAT_SERVER_URL=ws://your-server:3000/ws/agent \
bun packages/agent/src/index.ts
```

The agent auto-discovers local tmux sessions running Claude Code, Codex CLI, or Gemini CLI and begins streaming their output.

#### Reverse connection mode

When the agent machine is reachable from the server but can't connect outbound (e.g. NAT), run the agent in listener mode and have the server connect to it:

```bash
# On the agent machine — listen for incoming server connections
BLKCAT_LISTEN_PORT=4000 bun packages/agent/src/index.ts

# On the server — connect to the agent
BLKCAT_AGENTS=agent-host:4000 bun packages/server/src/index.ts
```

Multiple agents can be specified as a comma-separated list: `BLKCAT_AGENTS=host1:4000,host2:4000`. The server reconnects automatically with exponential backoff if the connection drops. Both inbound and outbound agents can be used at the same time.

### 3. Open the dashboard

If using `BLKCAT_STATIC_DIR`, the dashboard is served at `http://your-server:3000`.

For development, run the Vite dev server:

```bash
cd packages/web && bunx vite
```

Open http://localhost:5173 — select a session from the sidebar to view terminal output and send commands. Use the "+" button next to a machine name to start a new Claude Code, Codex, or Gemini session with optional arguments.

## Dashboard Features

- **Terminal streaming** — live xterm.js terminal with full tmux scrollback history. Enter scroll mode with `Ctrl+Shift+S`, the scroll button, or `Shift+PageUp`. Once in scroll mode, navigate with vim-style keys: `j`/`k` (line), `d`/`u` or `f`/`b` (page), `g`/`G` (top/bottom), `q` or `Esc` to exit.
- **Session management** — start new sessions with the "+" button. The start session modal lets you choose the CLI tool (Claude, Codex, or Gemini), set a session name, browse and select a working directory, and toggle tool-specific flags (`--dangerously-skip-permissions` for Claude, `--full-auto` for Codex, `--yolo` for Gemini). Close sessions with the "x" button, reload with the "↻" button. Reload uses tool-aware resume: `claude --resume` for Claude sessions, `codex resume <id>` for Codex sessions.
- **Multi-CLI support** — the agent auto-discovers `claude`, `codex`, and `gemini` tmux sessions. Codex sessions are labeled with `(codex)` and Gemini sessions are labeled with `(gemini)` in the sidebar. Since Codex and Gemini have no hooks system, session IDs are tracked by polling `~/.codex/sessions/` and `~/.gemini/tmp/` on the filesystem respectively. Hook events (Stop, Notification, PermissionRequest) are only available for Claude sessions.
- **Rename sessions & machines** — double-click any session or machine name in the sidebar to set a custom display name. Names are scoped per machine and persist in browser localStorage.
- **Input indicator** — a pulsing blue dot appears next to sessions that are waiting for user input (e.g. Claude prompting for a response).
- **Hook events & notifications** — the agent auto-installs Claude Code hooks to forward events (Stop, Notification, PermissionRequest) to the dashboard. View events in the Events panel and action-required notifications in the Notifications panel, accessible from the top-right tabs. Notification badges appear on sidebar sessions.
- **Outbound agent management** — add or remove reverse-connection agents from the dashboard UI.
- **Skills matrix** — a "Skills" tab in the right panel shows a matrix of available skills vs. connected machines. Deploy or remove standalone skills (`~/.claude/skills/<name>/`) on any agent with one click. Skills are auto-discovered by Claude Code — no plugin configuration needed.
- **Project settings** — click the gear icon on a session to edit `~/.claude/settings.json` on the remote agent (global or project-level). The `hooks` section is protected as read-only to prevent accidental removal of blkcat-monitor's hook integration.
- **Multi-client resize filtering** — when multiple dashboards (desktop, mobile, Playwright) view the same session, only the client that most recently sent user input can resize the tmux pane. This prevents resize wars between clients with different terminal sizes. The force fit button (⊞) always bypasses this check. Ownership expires after 10 seconds of inactivity.
- **Mobile responsive** — on screens ≤768px, the sidebar becomes a slide-out drawer (hamburger menu), panels open as full-screen overlays, and key buttons are touch-sized (44px). The terminal reflows to fit the narrower screen width.

## Packages

| Package | Description |
|---------|-------------|
| `@blkcat/shared` | Protocol message types and parsers |
| `@blkcat/server` | WebSocket hub with agent/dashboard routing and REST API |
| `@blkcat/agent` | tmux capture, Claude/Codex/Gemini session discovery, server connection |
| `@blkcat/web` | React dashboard with xterm.js terminal and chat input |

## Configuration

### Server

| Variable | Default | Description |
|----------|---------|-------------|
| `BLKCAT_PORT` | `3000` | Server listen port |
| `BLKCAT_HOST` | `0.0.0.0` | Server bind address |
| `BLKCAT_STATIC_DIR` | — | Serve static files from this directory |
| `BLKCAT_AGENTS` | — | Comma-separated `host:port` list of agents in listener mode to connect to |
| `BLKCAT_NOTIFY_CMD` | — | Shell command to run when Claude is waiting for input (triggered by Stop, Notification, PermissionRequest hook events) |
| `BLKCAT_SKILLS_DIR` | — | Directory containing skill subdirectories to make available for deployment to agents |

Server options can also be set in `~/.blkcat/server.json` (environment variables take precedence):

```json
{
  "port": 3000,
  "hostname": "0.0.0.0",
  "staticDir": "packages/web/dist",
  "agents": ["host1:4000", "host2:4000"],
  "skillsDir": "/path/to/skills"
}
```

### Agent

| Variable | Default | Description |
|----------|---------|-------------|
| `BLKCAT_SERVER_URL` | `ws://localhost:3000/ws/agent` | Server WebSocket URL (outbound mode) |
| `BLKCAT_MACHINE_ID` | hostname | Machine identifier |
| `BLKCAT_POLL_INTERVAL` | `150` | Pane capture interval in ms |
| `BLKCAT_CONFIG` | — | Path to JSON config file |
| `BLKCAT_LISTEN_PORT` | — | Port to listen on for incoming server connections (listener mode) |
| `BLKCAT_HOOKS_PORT` | `3001` | HTTP port for Claude Code hooks server |

#### Config file

```json
{
  "targets": [
    { "type": "auto" },
    { "type": "local", "session": "my-session" },
    { "type": "ssh", "host": "remote-server", "session": "dev", "key": "~/.ssh/id_ed25519" }
  ]
}
```

- `auto` — discover tmux sessions containing "claude", "codex", or "gemini"
- `local` — monitor a specific local tmux session
- `ssh` — monitor a tmux session on a remote host via SSH

### Dashboard

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_WS_URL` | auto-detected | WebSocket URL for server |

## REST API

`GET /api/sessions` — returns current machine/session state:

```json
{
  "machines": [
    {
      "machineId": "dev-server",
      "sessions": [
        { "id": "claude:0.0", "name": "claude", "target": "local" }
      ],
      "lastSeen": 1234567890
    }
  ]
}
```

`GET /api/skills` — returns available skills from the configured `BLKCAT_SKILLS_DIR`. Each skill is a subdirectory containing files that can be deployed to agents:

```json
{
  "skills": [
    {
      "name": "my-skill",
      "files": [
        { "path": "my-skill.md", "content": "..." }
      ]
    }
  ]
}
```

Returns `{"skills":[]}` if no skills directory is configured.

### WebSocket Messages

The dashboard communicates with the server over WebSocket (`/ws/dashboard`). Key message types:

| Direction | Type | Description |
|-----------|------|-------------|
| Server → Dashboard | `snapshot` | Initial state with all machines/sessions |
| Server → Dashboard | `machine_update` | Session list changed for a machine |
| Server → Dashboard | `output` | Terminal output update (includes `waitingForInput` flag) |
| Dashboard → Server | `input` | Send text/key/data to a session |
| Server → Dashboard | `hook_event` | Claude Code hook event (Stop, Notification, PermissionRequest) |
| Server → Dashboard | `directory_listing` | Response to directory listing request |
| Dashboard → Server | `start_session` | Create a new session (with optional name, cwd, args, cliTool) |
| Dashboard → Server | `close_session` | Kill a tmux session |
| Dashboard → Server | `reload_session` | Reload session with tool-aware resume (Claude, Codex, or Gemini) |
| Dashboard → Server | `resize` | Resize terminal dimensions (supports `force` flag) |
| Dashboard → Server | `list_directory` | Browse directories on agent machine |
| Dashboard → Server | `deploy_skills` | Deploy skill files to an agent's `~/.claude/skills/` |
| Dashboard → Server | `remove_skills` | Remove deployed skills from an agent |
| Dashboard → Server | `get_settings` | Request an agent's `settings.json` (global or project scope) |
| Dashboard → Server | `update_settings` | Write updated `settings.json` to an agent |
| Server → Dashboard | `deploy_result` | Result of a skill deploy/remove (success/error) |
| Server → Dashboard | `settings_snapshot` | Agent's current settings and deployed skills list |
| Server → Dashboard | `settings_result` | Result of a settings update (success/error) |

## Testing

```bash
# Backend tests (shared, server, agent)
bun test

# Web tests
cd packages/web && bunx vitest run
```

## License

MIT
