# blkcat-monitor

A web dashboard for monitoring and interacting with Claude Code / tmux sessions across multiple machines via agent-push WebSocket architecture.

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

The agent auto-discovers local tmux sessions running Claude Code and begins streaming their output.

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

Open http://localhost:5173 — select a session from the sidebar to view terminal output and send commands. Use the "+" button next to a machine name to start a new Claude Code session with optional arguments.

## Dashboard Features

- **Terminal streaming** — live xterm.js terminal with scrollback history (5000 lines). Scroll up with mouse wheel to view previous output.
- **Session management** — start new Claude sessions with the "+" button. The start session modal lets you set a session name, browse and select a working directory, and toggle flags like `--resume` and `--dangerously-skip-permissions`. Close sessions with the "x" button, reload with the "↻" button (`claude --resume`).
- **Rename sessions & machines** — double-click any session or machine name in the sidebar to set a custom display name. Names are scoped per machine and persist in browser localStorage.
- **Input indicator** — a pulsing blue dot appears next to sessions that are waiting for user input (e.g. Claude prompting for a response).
- **Hook events & notifications** — the agent auto-installs Claude Code hooks to forward events (Stop, Notification, PermissionRequest) to the dashboard. View events in the Events panel and action-required notifications in the Notifications panel, accessible from the top-right tabs. Notification badges appear on sidebar sessions.
- **Outbound agent management** — add or remove reverse-connection agents from the dashboard UI.

## Packages

| Package | Description |
|---------|-------------|
| `@blkcat/shared` | Protocol message types and parsers |
| `@blkcat/server` | WebSocket hub with agent/dashboard routing and REST API |
| `@blkcat/agent` | tmux capture, Claude session discovery, server connection |
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

- `auto` — discover tmux sessions containing "claude"
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
| Dashboard → Server | `start_session` | Create a new Claude session (with optional name, cwd, args) |
| Dashboard → Server | `close_session` | Kill a tmux session |
| Dashboard → Server | `reload_session` | Reload session with `claude --resume` |
| Dashboard → Server | `resize` | Resize terminal dimensions |
| Dashboard → Server | `list_directory` | Browse directories on agent machine |

## Testing

```bash
# Backend tests (shared, server, agent)
bun test

# Web tests
cd packages/web && bunx vitest run
```

## License

MIT
