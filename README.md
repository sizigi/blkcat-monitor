# blkcat-monitor

A web dashboard for monitoring and interacting with Claude Code / tmux sessions across multiple machines via agent-push WebSocket architecture.

```
        Browser (React + xterm.js)
             | WS
        Central Server (Bun)
       /     |      \        WS (agents connect outbound)
    Agent   Agent   Agent
     |       |       |
    tmux    tmux    tmux (local + SSH targets)
```

Agents connect outbound to the server, solving NAT/firewall issues. The server relays tmux output to the dashboard and routes input back to sessions.

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

### 3. Open the dashboard

If using `BLKCAT_STATIC_DIR`, the dashboard is served at `http://your-server:3000`.

For development, run the Vite dev server:

```bash
cd packages/web && bunx vite
```

Open http://localhost:5173 — select a session from the sidebar to view terminal output and send commands. Use the "+" button next to a machine name to start a new Claude Code session with optional arguments.

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

### Agent

| Variable | Default | Description |
|----------|---------|-------------|
| `BLKCAT_SERVER_URL` | `ws://localhost:3000/ws/agent` | Server WebSocket URL |
| `BLKCAT_MACHINE_ID` | hostname | Machine identifier |
| `BLKCAT_POLL_INTERVAL` | `300` | Pane capture interval in ms |
| `BLKCAT_CONFIG` | — | Path to JSON config file |

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

## Testing

```bash
# Backend tests (shared, server, agent)
bun test

# Web tests
cd packages/web && bunx vitest run
```

## License

MIT
