# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
bun install                        # Install all dependencies

# Development (run in separate terminals)
bun run dev:server                 # Server with hot reload (port 3000)
bun run dev:web                    # Vite dev server (port 5173, proxies /ws and /api to :3000)

# Testing
bun test                           # Backend tests (shared, server, agent) via bun test
cd packages/web && bunx vitest run # Web tests via vitest + jsdom

# Production
cd packages/web && bunx vite build
BLKCAT_STATIC_DIR=packages/web/dist bun packages/server/src/index.ts
```

## Architecture

Bun monorepo managed by Turborepo with four packages under `packages/`:

```
Browser (React + xterm.js)        @blkcat/web
         | WS (/ws/dashboard)
Central Server (Bun)              @blkcat/server
       /     \
    Agent    Agent                @blkcat/agent
     |        |
    tmux     tmux
```

All packages depend on **`@blkcat/shared`** which defines the WebSocket message protocol (types + parsers). Internal deps use `workspace:*`.

- **shared** — Message types and `parseAgentMessage()`/`parseDashboardMessage()` parsers. No deps, no build step.
- **server** — Bun WebSocket hub routing messages between agents (`/ws/agent`) and dashboards (`/ws/dashboard`). REST endpoints at `/api/sessions` and `/api/agents`. Supports outbound connections to agents in listener mode.
- **agent** — Polls tmux panes (default 150ms), auto-discovers Claude sessions, streams output to server. Supports two connection modes: outbound (agent connects to server) and listener (server connects to agent). Auto-installs Claude Code hooks for event forwarding. Key modules: `capture.ts` (tmux wrapper), `discovery.ts` (session finder), `connection.ts` (outbound WS), `listener.ts` (inbound WS server), `hooks-server.ts` (hook event HTTP receiver), `hooks-install.ts` (auto-install hooks into Claude settings).
- **web** — React 19 + Vite. Uses xterm.js for terminal rendering with 5000-line scrollback. State managed via `useSocket` hook (WebSocket) and `useAgents` hook (REST). Vite dev server proxies `/ws` and `/api` to the backend.

## Testing

- Backend packages use `bun test` (Bun's built-in test runner)
- Web package uses Vitest with jsdom environment and Testing Library
- Test files live alongside source files (e.g., `server.test.ts` next to `server.ts`)

## Documentation

When adding new features, changing configuration options, or modifying the WebSocket protocol, update `README.md` accordingly (dashboard features, config tables, message types).

## Key Conventions

- Runtime is **Bun** everywhere (not Node) — use Bun APIs (`Bun.serve`, `Bun.spawnSync`, etc.)
- TypeScript strict mode, ESNext target/module, bundler module resolution
- Agent detects "waiting for input" by stripping ANSI codes then checking for prompt patterns
- Terminal output diffing strips ANSI for comparison but preserves raw output for display
- `Bun.spawnSync` does **not** expand `~` — always resolve tilde to `$HOME` before passing paths to external commands
- Display names in `useDisplayNames` are scoped by `machineId:sessionId` to prevent cross-machine collisions in localStorage
- Agent auto-installs Claude Code hooks on startup (`hooks-install.ts`) to forward hook events (Stop, Notification, PermissionRequest) to the dashboard
- **Agents must always run inside a tmux session**, never via `nohup &` or bare background processes. Use `tmux send-keys` to start/restart agents on remote machines. Agent config uses env vars (`BLKCAT_LISTEN_PORT`, `BLKCAT_HOOKS_PORT`), not CLI flags.
