# Hook Event Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Capture Claude Code hook events and stream them through blkcat-monitor (hooks -> agent -> server -> dashboard event feed).

**Architecture:** Claude Code hooks fire a bundled shell script that POSTs event JSON to the blkcat agent's HTTP endpoint. The agent maps the event to a session, wraps it with machine metadata, and forwards it to the server via the existing WebSocket connection. The server stores events in a ring buffer and broadcasts to dashboards. The dashboard displays events in a collapsible right-side panel.

**Tech Stack:** Bun, TypeScript, React 19, WebSocket, shell script (bash)

---

### Task 1: Protocol — Add HookEventMessage Type

**Files:**
- Modify: `packages/shared/src/protocol.ts`
- Modify: `packages/shared/src/protocol.test.ts`

**Step 1: Write the failing test**

Add to `packages/shared/src/protocol.test.ts`:

```typescript
it("parses hook_event message", () => {
  const msg = parseAgentMessage(JSON.stringify({
    type: "hook_event",
    machineId: "m1",
    sessionId: "s1",
    hookEventName: "PostToolUse",
    matcher: "Bash",
    data: { tool_name: "Bash", tool_input: { command: "npm test" } },
    timestamp: Date.now(),
  }));
  expect(msg?.type).toBe("hook_event");
});

it("parses hook_event with null sessionId", () => {
  const msg = parseAgentMessage(JSON.stringify({
    type: "hook_event",
    machineId: "m1",
    sessionId: null,
    hookEventName: "SessionStart",
    matcher: null,
    data: {},
    timestamp: Date.now(),
  }));
  expect(msg?.type).toBe("hook_event");
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/jinyh/blkcat-monitor && bun test packages/shared/`
Expected: FAIL — `hook_event` is not in `AGENT_TYPES`

**Step 3: Write minimal implementation**

In `packages/shared/src/protocol.ts`:

1. Add the `HookEventMessage` interface after `AgentScrollbackMessage`:

```typescript
export interface HookEventMessage {
  type: "hook_event";
  machineId: string;
  sessionId: string | null;
  hookEventName: string;
  matcher: string | null;
  data: Record<string, unknown>;
  timestamp: number;
}
```

2. Add `HookEventMessage` to `AgentToServerMessage` union:

```typescript
export type AgentToServerMessage =
  | AgentRegisterMessage
  | AgentOutputMessage
  | AgentSessionsMessage
  | AgentScrollbackMessage
  | HookEventMessage;
```

3. Add `HookEventMessage` to `ServerToDashboardMessage` union (server relays it):

```typescript
export interface ServerHookEventMessage {
  type: "hook_event";
  machineId: string;
  sessionId: string | null;
  hookEventName: string;
  matcher: string | null;
  data: Record<string, unknown>;
  timestamp: number;
}

export type ServerToDashboardMessage =
  | ServerSnapshotMessage
  | ServerMachineUpdateMessage
  | ServerOutputMessage
  | ServerScrollbackMessage
  | ServerHookEventMessage;
```

4. Add `"hook_event"` to `AGENT_TYPES`:

```typescript
const AGENT_TYPES = new Set(["register", "output", "sessions", "scrollback", "hook_event"]);
```

5. Add `recentEvents` to `MachineSnapshot`:

```typescript
export interface MachineSnapshot {
  machineId: string;
  sessions: SessionInfo[];
  lastSeen: number;
  recentEvents?: HookEventMessage[];
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/jinyh/blkcat-monitor && bun test packages/shared/`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/protocol.ts packages/shared/src/protocol.test.ts
git commit -m "feat: add hook_event message type to shared protocol"
```

---

### Task 2: Server — Handle hook_event Messages with Ring Buffer

**Files:**
- Modify: `packages/server/src/server.ts`
- Modify: `packages/server/src/server.test.ts`

**Step 1: Write the failing test**

Add to `packages/server/src/server.test.ts` inside the first `describe("Server", ...)` block:

```typescript
it("broadcasts hook_event from agent to dashboard", async () => {
  const agent = new WebSocket(`ws://localhost:${port}/ws/agent`);
  await new Promise<void>((r) => agent.addEventListener("open", () => r()));

  agent.send(JSON.stringify({
    type: "register",
    machineId: "hook-test",
    sessions: [{ id: "s1", name: "dev", target: "local" }],
  }));
  await Bun.sleep(50);

  const dashMsgs: any[] = [];
  const dash = new WebSocket(`ws://localhost:${port}/ws/dashboard`);
  await new Promise<void>((r) => dash.addEventListener("open", () => r()));
  dash.addEventListener("message", (ev) => dashMsgs.push(JSON.parse(ev.data as string)));
  await Bun.sleep(50);

  agent.send(JSON.stringify({
    type: "hook_event",
    machineId: "hook-test",
    sessionId: "s1",
    hookEventName: "PostToolUse",
    matcher: "Bash",
    data: { tool_name: "Bash" },
    timestamp: Date.now(),
  }));
  await Bun.sleep(50);

  const hookMsg = dashMsgs.find((m) => m.type === "hook_event");
  expect(hookMsg).toBeDefined();
  expect(hookMsg.hookEventName).toBe("PostToolUse");
  expect(hookMsg.matcher).toBe("Bash");

  agent.close();
  dash.close();
});

it("includes recentEvents in snapshot for late-connecting dashboards", async () => {
  const agent = new WebSocket(`ws://localhost:${port}/ws/agent`);
  await new Promise<void>((r) => agent.addEventListener("open", () => r()));

  agent.send(JSON.stringify({
    type: "register",
    machineId: "hook-snap",
    sessions: [{ id: "s1", name: "dev", target: "local" }],
  }));
  await Bun.sleep(50);

  // Send hook event BEFORE dashboard connects
  agent.send(JSON.stringify({
    type: "hook_event",
    machineId: "hook-snap",
    sessionId: "s1",
    hookEventName: "SessionStart",
    matcher: null,
    data: {},
    timestamp: Date.now(),
  }));
  await Bun.sleep(50);

  // Now connect dashboard
  const dashMsgs: any[] = [];
  const dash = new WebSocket(`ws://localhost:${port}/ws/dashboard`);
  await new Promise<void>((r) => dash.addEventListener("open", () => r()));
  dash.addEventListener("message", (ev) => dashMsgs.push(JSON.parse(ev.data as string)));
  await Bun.sleep(50);

  const snapshot = dashMsgs.find((m) => m.type === "snapshot");
  expect(snapshot).toBeDefined();
  const machine = snapshot.machines.find((m: any) => m.machineId === "hook-snap");
  expect(machine).toBeDefined();
  expect(machine.recentEvents?.length).toBeGreaterThan(0);
  expect(machine.recentEvents[0].hookEventName).toBe("SessionStart");

  agent.close();
  dash.close();
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/jinyh/blkcat-monitor && bun test packages/server/`
Expected: FAIL — server ignores `hook_event` messages

**Step 3: Write minimal implementation**

In `packages/server/src/server.ts`:

1. Import `HookEventMessage` from `@blkcat/shared`:

```typescript
import {
  type AgentToServerMessage,
  type HookEventMessage,
  type MachineSnapshot,
  ...
} from "@blkcat/shared";
```

2. Add `hookEvents` ring buffer to `MachineState`:

```typescript
interface MachineState {
  agent: AgentSocket;
  sessions: SessionInfo[];
  lastSeen: number;
  lastOutputs: Map<string, AgentToServerMessage>;
  hookEvents: HookEventMessage[];
}
```

3. Add constant for ring buffer size at top of file:

```typescript
const MAX_HOOK_EVENTS = 100;
```

4. Initialize `hookEvents: []` in the register handler where `MachineState` is created:

```typescript
machines.set(msg.machineId, {
  agent, sessions: msg.sessions, lastSeen: Date.now(),
  lastOutputs: new Map(),
  hookEvents: [],
});
```

5. Add `hook_event` case to `handleAgentMessage()` after the `scrollback` case:

```typescript
} else if (msg.type === "hook_event") {
  const machine = machines.get(msg.machineId);
  if (machine) {
    machine.lastSeen = Date.now();
    machine.hookEvents.push(msg);
    if (machine.hookEvents.length > MAX_HOOK_EVENTS) {
      machine.hookEvents = machine.hookEvents.slice(-MAX_HOOK_EVENTS);
    }
  }
  broadcastToDashboards(msg);
}
```

6. Update `getSnapshot()` to include `recentEvents`:

```typescript
function getSnapshot(): MachineSnapshot[] {
  return Array.from(machines.entries()).map(([id, state]) => ({
    machineId: id,
    sessions: state.sessions,
    lastSeen: state.lastSeen,
    recentEvents: state.hookEvents.length > 0 ? state.hookEvents : undefined,
  }));
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/jinyh/blkcat-monitor && bun test packages/server/`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/server/src/server.ts packages/server/src/server.test.ts
git commit -m "feat: handle hook_event messages with ring buffer in server"
```

---

### Task 3: Agent — Hook HTTP Server Module

**Files:**
- Create: `packages/agent/src/hooks-server.ts`
- Create: `packages/agent/src/hooks-server.test.ts`

**Step 1: Write the failing test**

Create `packages/agent/src/hooks-server.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "bun:test";
import { HooksServer } from "./hooks-server";

describe("HooksServer", () => {
  let server: HooksServer;

  afterEach(() => {
    server?.stop();
  });

  it("receives hook event via POST /hooks and calls onHookEvent", async () => {
    const received: any[] = [];
    server = new HooksServer({
      port: 0,
      machineId: "test-machine",
      onHookEvent: (event) => received.push(event),
      resolvePaneId: () => "session-1",
    });

    const res = await fetch(`http://localhost:${server.port}/hooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hook_event_name: "PostToolUse",
        tool_name: "Bash",
        tool_input: { command: "npm test" },
        session_id: "abc123",
        tmux_pane: "%5",
      }),
    });

    expect(res.status).toBe(200);
    expect(received.length).toBe(1);
    expect(received[0].type).toBe("hook_event");
    expect(received[0].machineId).toBe("test-machine");
    expect(received[0].sessionId).toBe("session-1");
    expect(received[0].hookEventName).toBe("PostToolUse");
    expect(received[0].data.tool_name).toBe("Bash");
  });

  it("sets sessionId to null when pane is unknown", async () => {
    const received: any[] = [];
    server = new HooksServer({
      port: 0,
      machineId: "test-machine",
      onHookEvent: (event) => received.push(event),
      resolvePaneId: () => null,
    });

    const res = await fetch(`http://localhost:${server.port}/hooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hook_event_name: "SessionStart",
        session_id: "abc123",
      }),
    });

    expect(res.status).toBe(200);
    expect(received[0].sessionId).toBeNull();
  });

  it("rejects requests without hook_event_name", async () => {
    server = new HooksServer({
      port: 0,
      machineId: "test-machine",
      onHookEvent: () => {},
      resolvePaneId: () => null,
    });

    const res = await fetch(`http://localhost:${server.port}/hooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ some: "data" }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects non-POST requests", async () => {
    server = new HooksServer({
      port: 0,
      machineId: "test-machine",
      onHookEvent: () => {},
      resolvePaneId: () => null,
    });

    const res = await fetch(`http://localhost:${server.port}/hooks`);
    expect(res.status).toBe(405);
  });

  it("extracts matcher from tool_name in data", async () => {
    const received: any[] = [];
    server = new HooksServer({
      port: 0,
      machineId: "test-machine",
      onHookEvent: (event) => received.push(event),
      resolvePaneId: () => null,
    });

    await fetch(`http://localhost:${server.port}/hooks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        session_id: "abc",
      }),
    });

    expect(received[0].matcher).toBe("Edit");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/jinyh/blkcat-monitor && bun test packages/agent/src/hooks-server.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/agent/src/hooks-server.ts`:

```typescript
import type { HookEventMessage } from "@blkcat/shared";

interface HooksServerOptions {
  port: number;
  machineId: string;
  onHookEvent: (event: HookEventMessage) => void;
  resolvePaneId: (tmuxPane: string) => string | null;
}

export class HooksServer {
  private server: ReturnType<typeof Bun.serve>;

  constructor(private opts: HooksServerOptions) {
    this.server = Bun.serve({
      port: opts.port,
      fetch: async (req) => {
        const url = new URL(req.url);
        if (url.pathname !== "/hooks") {
          return new Response("Not found", { status: 404 });
        }
        if (req.method !== "POST") {
          return new Response("Method not allowed", { status: 405 });
        }

        try {
          const body = await req.json() as Record<string, unknown>;
          if (!body.hook_event_name || typeof body.hook_event_name !== "string") {
            return Response.json({ error: "hook_event_name is required" }, { status: 400 });
          }

          const tmuxPane = typeof body.tmux_pane === "string" ? body.tmux_pane : "";
          const sessionId = tmuxPane ? opts.resolvePaneId(tmuxPane) : null;

          // Extract matcher: tool_name for tool events, source for SessionStart, etc.
          const matcher = typeof body.tool_name === "string" ? body.tool_name
            : typeof body.source === "string" ? body.source
            : null;

          // Remove tmux_pane from data (it's agent-internal)
          const { tmux_pane: _, ...data } = body;

          const event: HookEventMessage = {
            type: "hook_event",
            machineId: opts.machineId,
            sessionId,
            hookEventName: body.hook_event_name as string,
            matcher,
            data: data as Record<string, unknown>,
            timestamp: Date.now(),
          };

          opts.onHookEvent(event);
          return Response.json({ ok: true });
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
      },
    });
  }

  get port() { return this.server.port; }

  stop() { this.server.stop(); }
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/jinyh/blkcat-monitor && bun test packages/agent/src/hooks-server.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/agent/src/hooks-server.ts packages/agent/src/hooks-server.test.ts
git commit -m "feat: add hooks HTTP server module for agent"
```

---

### Task 4: Agent — Hook Script

**Files:**
- Create: `packages/agent/blkcat-hook.sh`

**Step 1: Write the hook script**

Create `packages/agent/blkcat-hook.sh`:

```bash
#!/bin/bash
# blkcat-hook.sh — Claude Code hook script that forwards events to blkcat agent.
# Receives hook event JSON on stdin, adds $TMUX_PANE, POSTs to agent.
EVENT=$(cat)
PAYLOAD=$(echo "$EVENT" | jq -c --arg pane "${TMUX_PANE:-}" '. + {tmux_pane: $pane}')
curl -s -X POST "http://localhost:${BLKCAT_HOOKS_PORT:-3001}/hooks" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" >/dev/null 2>&1 &
```

**Step 2: Make it executable**

Run: `chmod +x /home/jinyh/blkcat-monitor/packages/agent/blkcat-hook.sh`

**Step 3: Test it manually (smoke test)**

Run a quick local test:
```bash
# Start a temporary HTTP listener to verify the script sends data
echo '{"hook_event_name":"test"}' | BLKCAT_HOOKS_PORT=19999 TMUX_PANE=%0 /home/jinyh/blkcat-monitor/packages/agent/blkcat-hook.sh
```
Expected: curl fires and fails silently (no listener). No errors printed.

**Step 4: Commit**

```bash
git add packages/agent/blkcat-hook.sh
git commit -m "feat: add blkcat-hook.sh script for Claude Code hooks"
```

---

### Task 5: Agent — Auto-Install Hooks Module

**Files:**
- Create: `packages/agent/src/hooks-install.ts`
- Create: `packages/agent/src/hooks-install.test.ts`

**Step 1: Write the failing test**

Create `packages/agent/src/hooks-install.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { installHooks, uninstallHooks } from "./hooks-install";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("installHooks", () => {
  let tempDir: string;
  let settingsPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "blkcat-hooks-test-"));
    settingsPath = join(tempDir, "settings.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("creates settings.json with hooks when file does not exist", async () => {
    await installHooks({ settingsPath, hooksPort: 3001, scriptPath: "/usr/bin/blkcat-hook.sh" });

    const settings = JSON.parse(await Bun.file(settingsPath).text());
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse).toBeDefined();
    expect(settings.hooks.SessionStart).toBeDefined();

    // Check hook structure
    const hook = settings.hooks.PreToolUse[0].hooks[0];
    expect(hook.type).toBe("command");
    expect(hook.command).toContain("blkcat-hook.sh");
    expect(hook.async).toBe(true);
  });

  it("preserves existing settings and hooks", async () => {
    await Bun.write(settingsPath, JSON.stringify({
      someOtherSetting: true,
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "echo existing" }] }
        ],
      },
    }));

    await installHooks({ settingsPath, hooksPort: 3001, scriptPath: "/usr/bin/blkcat-hook.sh" });

    const settings = JSON.parse(await Bun.file(settingsPath).text());
    expect(settings.someOtherSetting).toBe(true);
    // Existing hook preserved
    expect(settings.hooks.PreToolUse.length).toBe(2);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe("echo existing");
    // blkcat hook appended
    expect(settings.hooks.PreToolUse[1].hooks[0].command).toContain("blkcat-hook.sh");
  });

  it("is idempotent — does not duplicate hooks on second run", async () => {
    await installHooks({ settingsPath, hooksPort: 3001, scriptPath: "/usr/bin/blkcat-hook.sh" });
    await installHooks({ settingsPath, hooksPort: 3001, scriptPath: "/usr/bin/blkcat-hook.sh" });

    const settings = JSON.parse(await Bun.file(settingsPath).text());
    // Each event should have exactly one blkcat hook entry
    expect(settings.hooks.PreToolUse.length).toBe(1);
    expect(settings.hooks.SessionStart.length).toBe(1);
  });

  it("sets BLKCAT_HOOKS_PORT in hook command", async () => {
    await installHooks({ settingsPath, hooksPort: 4567, scriptPath: "/usr/bin/blkcat-hook.sh" });

    const settings = JSON.parse(await Bun.file(settingsPath).text());
    const hook = settings.hooks.PreToolUse[0].hooks[0];
    expect(hook.command).toContain("BLKCAT_HOOKS_PORT=4567");
  });
});

describe("uninstallHooks", () => {
  let tempDir: string;
  let settingsPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "blkcat-hooks-test-"));
    settingsPath = join(tempDir, "settings.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("removes blkcat hooks but preserves user hooks", async () => {
    await Bun.write(settingsPath, JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "echo user" }] },
          { matcher: "", hooks: [{ type: "command", command: "BLKCAT_HOOKS_PORT=3001 /usr/bin/blkcat-hook.sh" }] },
        ],
        SessionStart: [
          { matcher: "", hooks: [{ type: "command", command: "BLKCAT_HOOKS_PORT=3001 /usr/bin/blkcat-hook.sh" }] },
        ],
      },
    }));

    await uninstallHooks({ settingsPath, scriptPath: "/usr/bin/blkcat-hook.sh" });

    const settings = JSON.parse(await Bun.file(settingsPath).text());
    expect(settings.hooks.PreToolUse.length).toBe(1);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe("echo user");
    expect(settings.hooks.SessionStart).toBeUndefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/jinyh/blkcat-monitor && bun test packages/agent/src/hooks-install.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

Create `packages/agent/src/hooks-install.ts`:

```typescript
const HOOK_EVENTS = [
  "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
  "PostToolUseFailure", "Notification", "SubagentStart", "SubagentStop",
  "Stop", "SessionEnd", "PermissionRequest", "TeammateIdle",
  "TaskCompleted", "ConfigChange", "PreCompact",
];

interface InstallOptions {
  settingsPath: string;
  hooksPort: number;
  scriptPath: string;
}

interface UninstallOptions {
  settingsPath: string;
  scriptPath: string;
}

function isBlkcatHook(entry: any, scriptPath: string): boolean {
  if (!entry?.hooks || !Array.isArray(entry.hooks)) return false;
  return entry.hooks.some((h: any) => typeof h.command === "string" && h.command.includes(scriptPath));
}

export async function installHooks(opts: InstallOptions): Promise<void> {
  const { settingsPath, hooksPort, scriptPath } = opts;

  let settings: Record<string, any> = {};
  try {
    const file = Bun.file(settingsPath);
    if (await file.exists()) {
      settings = JSON.parse(await file.text());
    }
  } catch {}

  if (!settings.hooks) settings.hooks = {};

  const command = `BLKCAT_HOOKS_PORT=${hooksPort} ${scriptPath}`;

  for (const eventName of HOOK_EVENTS) {
    if (!settings.hooks[eventName]) {
      settings.hooks[eventName] = [];
    }

    const entries: any[] = settings.hooks[eventName];
    const existingIdx = entries.findIndex((e) => isBlkcatHook(e, scriptPath));

    const blkcatEntry = {
      matcher: "",
      hooks: [
        {
          type: "command",
          command,
          timeout: 10,
          async: true,
        },
      ],
    };

    if (existingIdx >= 0) {
      // Update existing entry in place
      entries[existingIdx] = blkcatEntry;
    } else {
      // Append new entry
      entries.push(blkcatEntry);
    }
  }

  await Bun.write(settingsPath, JSON.stringify(settings, null, 2));
}

export async function uninstallHooks(opts: UninstallOptions): Promise<void> {
  const { settingsPath, scriptPath } = opts;

  let settings: Record<string, any> = {};
  try {
    const file = Bun.file(settingsPath);
    if (await file.exists()) {
      settings = JSON.parse(await file.text());
    }
  } catch {
    return;
  }

  if (!settings.hooks) return;

  for (const eventName of Object.keys(settings.hooks)) {
    const entries: any[] = settings.hooks[eventName];
    if (!Array.isArray(entries)) continue;

    const filtered = entries.filter((e) => !isBlkcatHook(e, scriptPath));
    if (filtered.length > 0) {
      settings.hooks[eventName] = filtered;
    } else {
      delete settings.hooks[eventName];
    }
  }

  // Clean up empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  await Bun.write(settingsPath, JSON.stringify(settings, null, 2));
}
```

**Step 4: Run test to verify it passes**

Run: `cd /home/jinyh/blkcat-monitor && bun test packages/agent/src/hooks-install.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/agent/src/hooks-install.ts packages/agent/src/hooks-install.test.ts
git commit -m "feat: add auto-install/uninstall for Claude Code hooks"
```

---

### Task 6: Agent — Config Extension and Integration

**Files:**
- Modify: `packages/agent/src/config.ts`
- Modify: `packages/agent/src/index.ts`

**Step 1: Add `hooksPort` to AgentConfig**

In `packages/agent/src/config.ts`, add `hooksPort` to `AgentConfig`:

```typescript
export interface AgentConfig {
  serverUrl: string;
  machineId: string;
  pollInterval: number;
  targets: TargetConfig[];
  listenPort?: number;
  hooksPort: number;
}
```

And read it in `loadConfig()`:

```typescript
return {
  serverUrl: process.env.BLKCAT_SERVER_URL ?? "ws://localhost:3000/ws/agent",
  machineId: process.env.BLKCAT_MACHINE_ID ?? os.hostname(),
  pollInterval: parseInt(process.env.BLKCAT_POLL_INTERVAL ?? "150"),
  targets,
  listenPort,
  hooksPort: parseInt(process.env.BLKCAT_HOOKS_PORT ?? "3001"),
};
```

**Step 2: Wire HooksServer into agent index.ts**

In `packages/agent/src/index.ts`, after the connection is established and `conn` is assigned:

1. Import the new modules:

```typescript
import { HooksServer } from "./hooks-server";
import { installHooks } from "./hooks-install";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
```

2. After `conn` is set up (after the `if (config.listenPort) { ... } else { ... }` block and before the polling `setInterval`), add:

```typescript
// Start hooks HTTP server
const hooksServer = new HooksServer({
  port: config.hooksPort,
  machineId: config.machineId,
  onHookEvent: (event) => {
    const data = JSON.stringify(event);
    // Forward to server via the existing connection
    if (config.listenPort) {
      // In listener mode, broadcast to connected servers
      (conn as AgentListener).broadcast?.(event) ??
        conn.sendOutput; // fallback: we'll add a sendRaw method
    }
    // Use a generic send approach — add sendHookEvent to connection interface
    conn.sendHookEvent(event);
  },
  resolvePaneId: (tmuxPane) => {
    // Check if we're monitoring this pane
    return captures.has(tmuxPane) ? tmuxPane : null;
  },
});
console.log(`Hooks server listening on port ${hooksServer.port}`);

// Auto-install Claude Code hooks
const scriptPath = resolve(dirname(fileURLToPath(import.meta.url)), "../blkcat-hook.sh");
installHooks({
  settingsPath: resolve(process.env.HOME ?? "~", ".claude/settings.json"),
  hooksPort: config.hooksPort,
  scriptPath,
}).then(() => {
  console.log("Claude Code hooks installed");
}).catch((err) => {
  console.warn("Failed to install Claude Code hooks:", err);
});
```

**Step 3: Add `sendHookEvent` to AgentConnection and AgentListener**

In `packages/agent/src/connection.ts`, add to `AgentConnection`:

```typescript
sendHookEvent(event: HookEventMessage) {
  this.ws.send(JSON.stringify(event));
}
```

Add the import:
```typescript
import type { SessionInfo, ServerToAgentMessage, HookEventMessage } from "@blkcat/shared";
```

In `packages/agent/src/listener.ts`, add to `AgentListener`:

```typescript
sendHookEvent(event: HookEventMessage) {
  this.broadcast(event);
}
```

Add the import:
```typescript
import type { SessionInfo, ServerToAgentMessage, HookEventMessage } from "@blkcat/shared";
```

**Step 4: Update `conn` type in index.ts**

Update the `conn` type declaration in `packages/agent/src/index.ts` to include `sendHookEvent`:

```typescript
import type { HookEventMessage } from "@blkcat/shared";

let conn: {
  register(sessions: SessionInfo[]): void;
  sendOutput(sessionId: string, lines: string[], waitingForInput?: boolean): void;
  updateSessions(sessions: SessionInfo[]): void;
  sendScrollback(sessionId: string, lines: string[]): void;
  sendHookEvent(event: HookEventMessage): void;
  close(): void;
};
```

And simplify the `onHookEvent` callback in HooksServer to:

```typescript
onHookEvent: (event) => {
  conn.sendHookEvent(event);
},
```

**Step 5: Run all agent tests**

Run: `cd /home/jinyh/blkcat-monitor && bun test packages/agent/`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/agent/src/config.ts packages/agent/src/index.ts packages/agent/src/connection.ts packages/agent/src/listener.ts
git commit -m "feat: wire hooks server and auto-install into agent"
```

---

### Task 7: Dashboard — useSocket Hook Extension

**Files:**
- Modify: `packages/web/src/hooks/useSocket.ts`
- Modify: `packages/web/src/hooks/useSocket.test.ts`

**Step 1: Write the failing test**

Add to `packages/web/src/hooks/useSocket.test.ts`. Note: this file uses vitest + jsdom. Check the existing test patterns first and follow them. If there are no existing patterns for hook_event, add:

```typescript
it("stores hook_event messages and notifies subscribers", () => {
  // Test that hook_event messages are stored in hookEventsRef
  // and subscribers are notified
});
```

The exact test depends on the existing test patterns in this file. Read it first.

**Step 2: Implement changes to useSocket.ts**

In `packages/web/src/hooks/useSocket.ts`:

1. Import `HookEventMessage`:

```typescript
import type {
  MachineSnapshot,
  ServerToDashboardMessage,
  HookEventMessage,
} from "@blkcat/shared";
```

2. Add ref for hook events and subscription:

```typescript
const hookEventsRef = useRef<HookEventMessage[]>([]);
const hookEventSubsRef = useRef(new Set<(event: HookEventMessage) => void>());

const subscribeHookEvents = useCallback((cb: (event: HookEventMessage) => void) => {
  hookEventSubsRef.current.add(cb);
  return () => { hookEventSubsRef.current.delete(cb); };
}, []);
```

3. Handle `hook_event` in the message handler, after the `output` case:

```typescript
} else if (msg.type === "hook_event") {
  hookEventsRef.current.push(msg as HookEventMessage);
  // Keep bounded
  if (hookEventsRef.current.length > 1000) {
    hookEventsRef.current = hookEventsRef.current.slice(-1000);
  }
  for (const sub of hookEventSubsRef.current) sub(msg as HookEventMessage);
}
```

4. Handle `recentEvents` in snapshot handler — seed hook events from snapshot:

```typescript
if (msg.type === "snapshot") {
  setMachines(msg.machines);
  // Seed hook events from snapshot
  for (const machine of msg.machines) {
    if ((machine as any).recentEvents) {
      hookEventsRef.current.push(...(machine as any).recentEvents);
    }
  }
}
```

5. Add to return type and value:

```typescript
export interface UseSocketReturn {
  // ... existing fields ...
  hookEventsRef: React.RefObject<HookEventMessage[]>;
  subscribeHookEvents: (cb: (event: HookEventMessage) => void) => () => void;
}
```

Return: `{ ..., hookEventsRef, subscribeHookEvents }`

**Step 3: Run web tests**

Run: `cd /home/jinyh/blkcat-monitor/packages/web && bunx vitest run`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/web/src/hooks/useSocket.ts packages/web/src/hooks/useSocket.test.ts
git commit -m "feat: handle hook_event messages in useSocket hook"
```

---

### Task 8: Dashboard — EventFeed Component

**Files:**
- Create: `packages/web/src/components/EventFeed.tsx`

**Step 1: Create the EventFeed component**

Create `packages/web/src/components/EventFeed.tsx`:

```tsx
import React, { useState, useEffect, useRef } from "react";
import type { HookEventMessage } from "@blkcat/shared";

interface EventFeedProps {
  hookEventsRef: React.RefObject<HookEventMessage[]>;
  subscribeHookEvents: (cb: (event: HookEventMessage) => void) => () => void;
}

const EVENT_COLORS: Record<string, string> = {
  SessionStart: "#4caf50",
  SessionEnd: "#f44336",
  Stop: "#2196f3",
  PreToolUse: "#ff9800",
  PostToolUse: "#8bc34a",
  PostToolUseFailure: "#f44336",
  UserPromptSubmit: "#9c27b0",
  Notification: "#00bcd4",
  SubagentStart: "#673ab7",
  SubagentStop: "#795548",
  PermissionRequest: "#e91e63",
  TaskCompleted: "#009688",
  TeammateIdle: "#607d8b",
  ConfigChange: "#ffc107",
  PreCompact: "#9e9e9e",
};

function getEventColor(eventName: string): string {
  return EVENT_COLORS[eventName] ?? "#9e9e9e";
}

function getEventSummary(event: HookEventMessage): string {
  const data = event.data;
  switch (event.hookEventName) {
    case "PreToolUse":
    case "PostToolUse":
      if (data.tool_name === "Bash" && data.tool_input && typeof (data.tool_input as any).command === "string") {
        const cmd = (data.tool_input as any).command as string;
        return cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd;
      }
      if (data.tool_name === "Edit" || data.tool_name === "Write") {
        return (data.tool_input as any)?.file_path ?? String(data.tool_name);
      }
      return String(data.tool_name ?? event.matcher ?? "");
    case "PostToolUseFailure":
      return `${data.tool_name ?? event.matcher ?? ""}: ${data.error ?? "failed"}`;
    case "UserPromptSubmit": {
      const prompt = String(data.prompt ?? "");
      return prompt.length > 60 ? prompt.slice(0, 57) + "..." : prompt;
    }
    case "SessionStart":
      return data.source ? `source: ${data.source}` : "started";
    case "SessionEnd":
      return data.reason ? `reason: ${data.reason}` : "ended";
    case "Stop":
      return "response complete";
    default:
      return event.matcher ?? "";
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function EventFeed({ hookEventsRef, subscribeHookEvents }: EventFeedProps) {
  const [events, setEvents] = useState<HookEventMessage[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>("");
  const listRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    // Seed with existing events
    setEvents([...hookEventsRef.current]);

    return subscribeHookEvents((event) => {
      setEvents((prev) => [...prev, event]);
    });
  }, [hookEventsRef, subscribeHookEvents]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScrollRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events.length]);

  const handleScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
  };

  const filtered = filter
    ? events.filter((e) => e.hookEventName === filter)
    : events;

  const eventTypes = [...new Set(events.map((e) => e.hookEventName))].sort();

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--bg-secondary)",
      borderLeft: "1px solid var(--border)",
    }}>
      <div style={{
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Events</span>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            marginLeft: "auto",
            fontSize: 11,
            padding: "2px 4px",
            background: "var(--bg-primary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            borderRadius: 3,
          }}
        >
          <option value="">All</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {filtered.length}
        </span>
      </div>
      <div
        ref={listRef}
        onScroll={handleScroll}
        style={{
          flex: 1,
          overflowY: "auto",
          fontSize: 12,
        }}
      >
        {filtered.map((event, i) => {
          const globalIdx = events.indexOf(event);
          const isExpanded = expandedIdx === globalIdx;
          return (
            <div
              key={globalIdx}
              onClick={() => setExpandedIdx(isExpanded ? null : globalIdx)}
              style={{
                padding: "4px 12px",
                borderBottom: "1px solid var(--border)",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ color: "var(--text-muted)", fontSize: 10, flexShrink: 0 }}>
                  {formatTime(event.timestamp)}
                </span>
                <span style={{
                  background: getEventColor(event.hookEventName),
                  color: "#fff",
                  borderRadius: 3,
                  padding: "1px 5px",
                  fontSize: 10,
                  fontWeight: 600,
                  flexShrink: 0,
                }}>
                  {event.hookEventName}
                </span>
                <span style={{
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {getEventSummary(event)}
                </span>
              </div>
              {isExpanded && (
                <pre style={{
                  marginTop: 4,
                  padding: 8,
                  background: "var(--bg-primary)",
                  borderRadius: 4,
                  fontSize: 11,
                  overflow: "auto",
                  maxHeight: 200,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                }}>
                  {JSON.stringify(event.data, null, 2)}
                </pre>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{
            padding: 24,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 12,
          }}>
            No events yet
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Run web tests to make sure nothing is broken**

Run: `cd /home/jinyh/blkcat-monitor/packages/web && bunx vitest run`
Expected: PASS (new component not imported anywhere yet)

**Step 3: Commit**

```bash
git add packages/web/src/components/EventFeed.tsx
git commit -m "feat: add EventFeed component for hook events dashboard panel"
```

---

### Task 9: Dashboard — App Integration

**Files:**
- Modify: `packages/web/src/App.tsx`

**Step 1: Wire EventFeed into App layout**

In `packages/web/src/App.tsx`:

1. Import `EventFeed`:

```typescript
import { EventFeed } from "./components/EventFeed";
```

2. Destructure `hookEventsRef` and `subscribeHookEvents` from `useSocket`:

```typescript
const { connected, machines, waitingSessions, outputMapRef, logMapRef, scrollbackMapRef, subscribeOutput, subscribeScrollback, sendInput, startSession, closeSession, sendResize, requestScrollback, hookEventsRef, subscribeHookEvents } = useSocket(WS_URL);
```

3. Add state for event panel visibility and width:

```typescript
const [eventPanelOpen, setEventPanelOpen] = useState(false);
const DEFAULT_EVENT_PANEL_WIDTH = 300;
const [eventPanelWidth, setEventPanelWidth] = useState(DEFAULT_EVENT_PANEL_WIDTH);
```

4. Inside the `<main>` element, after `<SessionDetail>` or the empty state, add the event panel toggle button and panel:

After the closing `</main>` tag, add:

```tsx
{/* Event panel toggle */}
<button
  onClick={() => setEventPanelOpen((v) => !v)}
  title={eventPanelOpen ? "Hide events" : "Show events"}
  style={{
    position: "absolute",
    right: eventPanelOpen ? eventPanelWidth : 0,
    top: 8,
    zIndex: 10,
    background: "var(--bg-secondary)",
    border: "1px solid var(--border)",
    borderRight: eventPanelOpen ? "none" : "1px solid var(--border)",
    color: "var(--text-muted)",
    cursor: "pointer",
    fontSize: 12,
    padding: "4px 8px",
    borderRadius: eventPanelOpen ? "4px 0 0 4px" : 4,
  }}
>
  Events
</button>
{eventPanelOpen && (
  <div style={{ width: eventPanelWidth, flexShrink: 0 }}>
    <EventFeed
      hookEventsRef={hookEventsRef}
      subscribeHookEvents={subscribeHookEvents}
    />
  </div>
)}
```

Update the outer `<div>` to have `position: "relative"`:

```tsx
<div style={{ display: "flex", height: "100vh", position: "relative" }}>
```

**Step 2: Run web tests**

Run: `cd /home/jinyh/blkcat-monitor/packages/web && bunx vitest run`
Expected: PASS

**Step 3: Manually verify the layout**

Start dev servers:
```bash
cd /home/jinyh/blkcat-monitor && bun run dev:server
cd /home/jinyh/blkcat-monitor && bun run dev:web
```

Open browser, verify:
- "Events" toggle button visible at top-right
- Clicking it opens the right-side panel
- Panel shows "No events yet" initially
- Panel can be collapsed

**Step 4: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "feat: integrate EventFeed panel into dashboard layout"
```

---

### Task 10: End-to-End Verification

**Files:**
- No new files — integration test

**Step 1: Run all tests**

Run: `cd /home/jinyh/blkcat-monitor && bun test`
Expected: All backend tests pass

Run: `cd /home/jinyh/blkcat-monitor/packages/web && bunx vitest run`
Expected: All web tests pass

**Step 2: Manual end-to-end test**

1. Start the server: `bun run dev:server`
2. Start the agent: `BLKCAT_HOOKS_PORT=3001 bun run dev:agent` (or however agent is started)
3. Open dashboard in browser
4. Start a Claude Code session in a monitored tmux pane
5. Verify:
   - Agent logs "Hooks server listening on port 3001"
   - Agent logs "Claude Code hooks installed"
   - `~/.claude/settings.json` contains blkcat hook entries
   - When Claude Code uses tools, hook events appear in the dashboard event feed
   - Events show correct type badges, timestamps, and summaries
   - Clicking an event expands to show full JSON data
   - Filter dropdown filters events by type

**Step 3: Commit any fixes found during E2E testing**

```bash
git add -A && git commit -m "fix: address issues found during E2E testing"
```
