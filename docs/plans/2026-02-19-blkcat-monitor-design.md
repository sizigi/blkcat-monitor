# blkcat-monitor Design

A centralized web dashboard for monitoring and interacting with multiple Claude Code CLI sessions (and arbitrary tmux sessions) running across 20+ machines with mixed networking.

## Architecture

Agent-push via WebSocket. Three components:

1. **Agent** — lightweight Bun process on each machine, connects outbound to the central server, captures tmux output, relays input
2. **Central Server** — Bun WebSocket hub between agents and browser clients
3. **Web UI** — React SPA showing all sessions with chat-style interaction

```
        Browser (React)
             │ WS
        Central Server (Bun)
       /     │      \        WS (agents connect outbound)
    Agent   Agent   Agent
     │       │       │
    tmux    tmux    tmux (local + SSH targets)
```

Agents connect outbound to the server, solving NAT/firewall issues.

## Agent

Runs on each machine alongside tmux sessions.

### Responsibilities

- Auto-discover local tmux sessions running Claude Code
- Support custom targets: specific local tmux sessions and remote tmux sessions via SSH
- Poll tmux panes every 300ms via `tmux capture-pane -p`
- Send diffs (only changed lines) to reduce bandwidth
- Receive chat messages and inject via `tmux send-keys`
- Auto-reconnect with exponential backoff
- Detect new/ended sessions and update the server

### Configuration

Environment variables:
- `BLKCAT_SERVER_URL` — central server WebSocket URL
- `BLKCAT_SECRET` — shared authentication token
- `BLKCAT_MACHINE_ID` — optional, defaults to hostname
- `BLKCAT_POLL_INTERVAL` — defaults to 300ms

Config file (`blkcat-agent.config.json`):
```jsonc
{
  "targets": [
    { "type": "auto" },
    { "type": "local", "session": "my-build-job" },
    { "type": "ssh", "host": "gpu-server", "session": "training-run" },
    { "type": "ssh", "host": "user@10.0.1.50", "session": "deploy", "key": "~/.ssh/id_ed25519" }
  ]
}
```

SSH targets use `ControlMaster` for persistent connections.

### Protocol (agent -> server)

```
{ type: "register", machineId, sessions: [...] }
{ type: "output",   machineId, sessionId, lines, timestamp }
{ type: "sessions", machineId, sessions: [...] }
```

### Protocol (server -> agent)

```
{ type: "input", sessionId, text }
```

## Central Server

Bun WebSocket server acting as the hub.

### Endpoints

- `/ws/agent` — agents connect here
- `/ws/dashboard` — browser clients connect here
- `GET /api/sessions` — snapshot of all machines and sessions (for initial page load)

### In-memory State

- `machines: Map<machineId, { ws, sessions[], lastSeen }>`
- `dashboards: Set<WebSocket>`

### Responsibilities

- Accept agent registrations, track sessions
- Fan-out agent output to all connected dashboards
- Route dashboard chat input to the correct agent
- Health tracking: stale after 10s silence, removed after 30s
- Serve static web UI files

### Protocol (server -> dashboard)

```
{ type: "snapshot",       machines: [...] }
{ type: "machine_update", machineId, sessions: [...] }
{ type: "output",         machineId, sessionId, lines, timestamp }
```

### Protocol (dashboard -> server)

```
{ type: "input", machineId, sessionId, text }
```

No database. All state is ephemeral. Server restart triggers agent re-registration.

## Web UI

React SPA (Vite + React), dark theme.

### Layout

- **Sidebar:** Machines grouped with their sessions. Status indicators (active/stale/idle). Search/filter. Click to select.
- **Session Detail:** Scrollable terminal output (xterm.js, monospace), auto-scroll with scroll-lock toggle, chat input at bottom.
- **Header:** Connection status, total session count.

SSH targets display as `host:session` in the sidebar.

### Tech

- Vite + React
- xterm.js for terminal rendering
- No heavy UI framework

## Project Structure

```
blkcat-monitor/
├── packages/
│   ├── agent/
│   │   └── src/
│   │       ├── index.ts        # Entry, config loading
│   │       ├── discovery.ts    # Auto-discover Claude Code sessions
│   │       ├── capture.ts      # tmux capture-pane polling (local + SSH)
│   │       ├── connection.ts   # WebSocket client to server
│   │       └── ssh.ts          # SSH ControlMaster management
│   ├── server/
│   │   └── src/
│   │       ├── index.ts        # Entry, HTTP + WS server
│   │       ├── agents.ts       # Agent connection management
│   │       ├── dashboards.ts   # Dashboard connection management
│   │       └── router.ts       # REST endpoints
│   ├── web/
│   │   └── src/
│   │       ├── App.tsx
│   │       ├── components/
│   │       │   ├── Sidebar.tsx
│   │       │   ├── SessionDetail.tsx
│   │       │   ├── TerminalOutput.tsx
│   │       │   └── ChatInput.tsx
│   │       └── hooks/
│   │           └── useSocket.ts
│   └── shared/
│       └── src/
│           └── protocol.ts     # Shared message type definitions
├── package.json                # Workspace root
└── turbo.json                  # Monorepo task runner
```

## Security

- **Shared secret:** `BLKCAT_SECRET` env var. Agents and dashboards must provide it to connect.
- **No auth UI.** Single operator tool.
- **HTTPS/WSS:** Recommended but not enforced. Fine over encrypted tunnels.

## Deployment

- **Agent:** `BLKCAT_SERVER_URL=wss://server:3000/ws/agent BLKCAT_SECRET=token bun run packages/agent/src/index.ts`
- **Server:** `bun run packages/server/src/index.ts` (serves API + static web build)
- Can be managed as systemd services or run in tmux.

No Docker, no Kubernetes, no CI/CD.
