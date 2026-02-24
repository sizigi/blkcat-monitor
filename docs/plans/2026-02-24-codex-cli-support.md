# Codex CLI Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Codex CLI support so blkcat-monitor can discover, start, monitor, reload, and resume both Claude Code and Codex CLI sessions.

**Architecture:** Add a `cliTool` field to `SessionInfo` and a centralized `CLI_TOOLS` config in `@blkcat/shared`. Agent discovery matches both `claude` and `codex` process names in tmux. UI modals show tool-specific flags. Codex session ID tracking uses filesystem polling since Codex has no hooks system.

**Tech Stack:** TypeScript, Bun, React 19, WebSocket protocol

---

### Task 1: Add CLI_TOOLS config and cliTool to SessionInfo in shared protocol

**Files:**
- Modify: `packages/shared/src/protocol.ts:3-9` (SessionInfo)
- Modify: `packages/shared/src/protocol.ts:113-118` (ServerStartSessionMessage)
- Modify: `packages/shared/src/protocol.ts:285-291` (DashboardStartSessionMessage)
- Modify: `packages/shared/src/protocol.test.ts`

**Step 1: Write the failing test**

Add to `packages/shared/src/protocol.test.ts`:

```typescript
it("CLI_TOOLS has configs for claude and codex", () => {
  expect(CLI_TOOLS.claude.command).toBe("claude");
  expect(CLI_TOOLS.codex.command).toBe("codex");
  expect(CLI_TOOLS.claude.resumeFlag("abc")).toBe("--resume abc");
  expect(CLI_TOOLS.claude.resumeFlag()).toBe("--resume");
  expect(CLI_TOOLS.codex.resumeFlag("abc")).toBe("resume abc");
  expect(CLI_TOOLS.codex.resumeFlag()).toBe("resume --last");
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun test`
Expected: FAIL — `CLI_TOOLS` not exported

**Step 3: Add cliTool to SessionInfo and CLI_TOOLS config**

In `packages/shared/src/protocol.ts`, add `cliTool` to `SessionInfo`:

```typescript
export interface SessionInfo {
  id: string;
  name: string;
  target: "local" | "ssh";
  host?: string;
  args?: string;
  cliTool?: "claude" | "codex";
}
```

Add `cliTool` to `ServerStartSessionMessage`:

```typescript
export interface ServerStartSessionMessage {
  type: "start_session";
  args?: string;
  cwd?: string;
  name?: string;
  cliTool?: "claude" | "codex";
}
```

Add `cliTool` to `DashboardStartSessionMessage`:

```typescript
export interface DashboardStartSessionMessage {
  type: "start_session";
  machineId: string;
  args?: string;
  cwd?: string;
  name?: string;
  cliTool?: "claude" | "codex";
}
```

Add the `CliTool` type alias and `CLI_TOOLS` config object at the top of the file (after SessionInfo):

```typescript
export type CliTool = "claude" | "codex";

export const CLI_TOOLS: Record<CliTool, {
  command: string;
  resumeFlag: (id?: string) => string;
  flags: readonly { flag: string; color: string }[];
  configDir: string;
}> = {
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
};
```

**Step 4: Run test to verify it passes**

Run: `cd packages/shared && bun test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/protocol.ts packages/shared/src/protocol.test.ts
git commit -m "feat(shared): add CLI_TOOLS config and cliTool to SessionInfo"
```

---

### Task 2: Update agent discovery to detect both Claude and Codex

**Files:**
- Modify: `packages/agent/src/discovery.ts`
- Modify: `packages/agent/src/discovery.test.ts`

**Step 1: Write the failing test**

Replace the test file `packages/agent/src/discovery.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { discoverCliSessions } from "./discovery";
import type { ExecFn } from "./capture";

describe("discoverCliSessions", () => {
  it("finds panes running claude or codex", () => {
    const exec: ExecFn = (cmd) => {
      const joined = cmd.join(" ");
      if (joined.includes("list-panes")) {
        return {
          success: true,
          stdout: [
            "dev:0.0\tdev\tclaude",
            "dev:1.0\tdev\tvim",
            "build:0.0\tbuild\tnpm",
            "web:0.0\tweb\tclaude",
            "codex:0.0\tcodex\tcodex",
          ].join("\n") + "\n",
        };
      }
      return { success: false, stdout: "" };
    };

    const sessions = discoverCliSessions(exec);
    expect(sessions).toHaveLength(3);
    expect(sessions[0]).toEqual({ id: "dev:0.0", name: "dev", target: "local", cliTool: "claude" });
    expect(sessions[1]).toEqual({ id: "web:0.0", name: "web", target: "local", cliTool: "claude" });
    expect(sessions[2]).toEqual({ id: "codex:0.0", name: "codex", target: "local", cliTool: "codex" });
  });

  it("returns empty array when list-panes fails", () => {
    const exec: ExecFn = () => ({ success: false, stdout: "" });
    expect(discoverCliSessions(exec)).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/agent && bun test discovery.test.ts`
Expected: FAIL — `discoverCliSessions` not exported

**Step 3: Update discovery.ts**

Replace `packages/agent/src/discovery.ts`:

```typescript
import { type ExecFn, bunExec } from "./capture";
import type { SessionInfo } from "@blkcat/shared";

const CLI_COMMANDS = new Set(["claude", "codex"]);

export function discoverCliSessions(exec: ExecFn = bunExec): SessionInfo[] {
  const result = exec([
    "tmux", "list-panes", "-a",
    "-F", "#{session_name}:#{window_index}.#{pane_index}\t#{session_name}\t#{pane_current_command}",
  ]);
  if (!result.success) return [];

  const found: SessionInfo[] = [];
  for (const line of result.stdout.trim().split("\n")) {
    if (!line) continue;
    const [paneId, sessionName, cmd] = line.split("\t");
    if (CLI_COMMANDS.has(cmd)) {
      found.push({ id: paneId, name: sessionName, target: "local", cliTool: cmd as "claude" | "codex" });
    }
  }

  return found;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/agent && bun test discovery.test.ts`
Expected: PASS

**Step 5: Update all references from discoverClaudeSessions to discoverCliSessions**

In `packages/agent/src/index.ts`, update the import (line 5) and calls (lines 48, 328):

```typescript
import { discoverCliSessions } from "./discovery";
// Line 48: autoSessions = discoverCliSessions();
// Line 328: const fresh = discoverCliSessions();
```

**Step 6: Run full agent tests**

Run: `cd packages/agent && bun test`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/agent/src/discovery.ts packages/agent/src/discovery.test.ts packages/agent/src/index.ts
git commit -m "feat(agent): discover both claude and codex sessions in tmux"
```

---

### Task 3: Update capture.ts startSession to accept cliTool

**Files:**
- Modify: `packages/agent/src/capture.ts:104-121`
- Modify: `packages/agent/src/capture.test.ts`

**Step 1: Write the failing test**

Add to `packages/agent/src/capture.test.ts`:

```typescript
it("startSession uses codex command when cliTool is codex", () => {
  const cmds: string[][] = [];
  const exec: ExecFn = (cmd) => {
    cmds.push(cmd);
    if (cmd.includes("new-window")) {
      return { success: true, stdout: "test:0.0\n" };
    }
    return { success: true, stdout: "" };
  };
  const cap = new TmuxCapture(exec);
  cap.startSession("--full-auto", undefined, "codex");
  // The send-keys call should contain "codex --full-auto"
  const sendKeysCmd = cmds.find(c => c.includes("send-keys") && c.includes("-l"));
  expect(sendKeysCmd).toBeDefined();
  expect(sendKeysCmd!.join(" ")).toContain("codex --full-auto");
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/agent && bun test capture.test.ts`
Expected: FAIL — `startSession` doesn't accept 3rd parameter (or ignores it)

**Step 3: Update startSession signature**

In `packages/agent/src/capture.ts`, update `startSession` (line 104):

```typescript
startSession(args?: string, cwd?: string, cliTool: "claude" | "codex" = "claude"): string | null {
    const command = cliTool === "codex" ? "codex" : "claude";
    const fullCmd = args ? `${command} ${args}` : command;
    // Resolve ~ since Bun.spawnSync doesn't invoke a shell for tilde expansion
    const resolvedCwd = cwd?.startsWith("~")
      ? cwd.replace("~", process.env.HOME ?? "/root")
      : cwd;
    const cmd = [...this.sshPrefix, "tmux", "new-window", "-P", "-F", "#{session_name}:#{window_index}.#{pane_index}"];
    if (resolvedCwd) cmd.push("-c", resolvedCwd);
    const result = this.exec(cmd);
    if (!result.success) return null;
    const target = result.stdout.trim();
    this.sendText(target, fullCmd);
    this.sendKey(target, "Enter");
    return target;
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/agent && bun test capture.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/agent/src/capture.ts packages/agent/src/capture.test.ts
git commit -m "feat(agent): startSession accepts cliTool parameter"
```

---

### Task 4: Update agent index.ts for tool-aware start and reload

**Files:**
- Modify: `packages/agent/src/index.ts:19` (rename claudeSessionIds → sessionIds)
- Modify: `packages/agent/src/index.ts:97-114` (handleReloadSession)
- Modify: `packages/agent/src/index.ts:116-130` (handleStartSession)

**Step 1: Import CLI_TOOLS from shared**

At the top of `packages/agent/src/index.ts`, add:

```typescript
import { CLI_TOOLS } from "@blkcat/shared";
```

**Step 2: Rename claudeSessionIds to sessionIds**

Line 19: `const sessionIds = new Map<string, string>();`

Update all references throughout the file:
- Line 71: `sessionIds.delete(sessionId);`
- Line 100: `const toolSessionId = sessionIds.get(sessionId);`
- Line 263-264: `onClaudeSessionId: (paneId, claudeId) => { sessionIds.set(paneId, claudeId); }`

**Step 3: Update handleStartSession to accept and pass cliTool**

```typescript
function handleStartSession(args?: string, cwd?: string, name?: string, cliTool?: "claude" | "codex") {
    const tool = cliTool ?? "claude";
    const localCap = new TmuxCapture(bunExec);
    const paneId = localCap.startSession(args, cwd, tool);
    if (!paneId) {
      console.error("Failed to start new session");
      return;
    }
    captures.set(paneId, localCap);
    const sessionName = name || `${tool}${args ? ` ${args}` : ""}`;
    const session: SessionInfo = { id: paneId, name: sessionName, target: "local", args: args || undefined, cliTool: tool };
    manualSessions.push(session);
    const all = [...autoSessions, ...manualSessions];
    conn.updateSessions(all);
    console.log(`Started new ${tool} session: ${paneId}`);
}
```

**Step 4: Update handleReloadSession to be tool-aware**

```typescript
function handleReloadSession(sessionId: string, args?: string, resume?: boolean) {
    const cap = captures.get(sessionId);
    if (!cap) return;
    const allSessions = [...autoSessions, ...manualSessions];
    const session = allSessions.find((s) => s.id === sessionId);
    const tool = CLI_TOOLS[session?.cliTool ?? "claude"];
    const toolSessionId = sessionIds.get(sessionId);
    const shouldResume = resume !== false;
    let cmd = tool.command;
    if (shouldResume) {
      cmd += " " + tool.resumeFlag(toolSessionId);
    }
    if (args) cmd += ` ${args}`;
    cap.respawnPane(sessionId, cmd);
    prevLines.delete(sessionId);
    if (session) session.args = args || undefined;
    console.log(`Reloaded ${tool.command} session: ${sessionId}${shouldResume && toolSessionId ? ` (session: ${toolSessionId})` : ""}${args ? ` (args: ${args})` : ""}${!shouldResume ? " (fresh)" : ""}`);
}
```

**Step 5: Update handler wiring for onStartSession**

In both the `AgentListener` and `AgentConnection` constructor calls (lines 217 and 239), update `onStartSession`:

```typescript
onStartSession: (args, cwd, name, cliTool) => handleStartSession(args, cwd, name, cliTool),
```

**Step 6: Run agent tests**

Run: `cd packages/agent && bun test`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/agent/src/index.ts
git commit -m "feat(agent): tool-aware session start and reload using CLI_TOOLS"
```

---

### Task 5: Update agent connection.ts and listener.ts for cliTool in start_session

**Files:**
- Modify: `packages/agent/src/connection.ts:7` (onStartSession signature)
- Modify: `packages/agent/src/connection.ts:43-44` (dispatch)
- Modify: `packages/agent/src/listener.ts:7` (onStartSession signature)
- Modify: `packages/agent/src/listener.ts:55-56` (dispatch)

**Step 1: Update connection.ts**

Change `onStartSession` in `AgentConnectionOptions` (line 7):

```typescript
onStartSession?: (args?: string, cwd?: string, name?: string, cliTool?: "claude" | "codex") => void;
```

Update dispatch (line 43-44):

```typescript
} else if (msg.type === "start_session") {
  opts.onStartSession?.(msg.args, msg.cwd, msg.name, (msg as any).cliTool);
}
```

**Step 2: Update listener.ts**

Change `onStartSession` in `AgentListenerOptions` (line 7):

```typescript
onStartSession?: (args?: string, cwd?: string, name?: string, cliTool?: "claude" | "codex") => void;
```

Update dispatch (line 55-56):

```typescript
} else if (msg.type === "start_session") {
  this.opts.onStartSession?.(msg.args, msg.cwd, msg.name, (msg as any).cliTool);
}
```

**Step 3: Run agent tests**

Run: `cd packages/agent && bun test`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/agent/src/connection.ts packages/agent/src/listener.ts
git commit -m "feat(agent): forward cliTool in start_session to handlers"
```

---

### Task 6: Update server to forward cliTool in start_session

**Files:**
- Modify: `packages/server/src/server.ts:407-415`

**Step 1: Update start_session forwarding**

In `packages/server/src/server.ts`, in the `start_session` handler (around line 410):

```typescript
} else if (msg.type === "start_session") {
  const machine = machines.get(msg.machineId);
  if (machine) {
    const fwd: Record<string, any> = { type: "start_session" };
    if (msg.args) fwd.args = msg.args;
    if (msg.cwd) fwd.cwd = msg.cwd;
    if (msg.name) fwd.name = msg.name;
    if ((msg as any).cliTool) fwd.cliTool = (msg as any).cliTool;
    machine.agent.send(JSON.stringify(fwd));
  }
}
```

**Step 2: Run server tests**

Run: `cd packages/server && bun test`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/server/src/server.ts
git commit -m "feat(server): forward cliTool in start_session to agent"
```

---

### Task 7: Update useSocket to pass cliTool in startSession

**Files:**
- Modify: `packages/web/src/hooks/useSocket.ts:71` (type)
- Modify: `packages/web/src/hooks/useSocket.ts:413-425` (implementation)

**Step 1: Update startSession type**

In `UseSocketReturn` (line 71):

```typescript
startSession: (machineId: string, args?: string, cwd?: string, name?: string, cliTool?: "claude" | "codex") => void;
```

**Step 2: Update implementation**

```typescript
const startSession = useCallback(
  (machineId: string, args?: string, cwd?: string, name?: string, cliTool?: "claude" | "codex") => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const msg: Record<string, any> = { type: "start_session", machineId };
      if (args) msg.args = args;
      if (cwd) msg.cwd = cwd;
      if (name) msg.name = name;
      if (cliTool) msg.cliTool = cliTool;
      ws.send(JSON.stringify(msg));
    }
  },
  [],
);
```

**Step 3: Run web tests**

Run: `cd packages/web && bunx vitest run`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/web/src/hooks/useSocket.ts
git commit -m "feat(web): pass cliTool in startSession WebSocket message"
```

---

### Task 8: Update StartSessionModal with tool selector and dynamic flags

**Files:**
- Modify: `packages/web/src/components/StartSessionModal.tsx`
- Modify: `packages/web/src/components/StartSessionModal.test.tsx`

**Step 1: Write failing test**

Add to `packages/web/src/components/StartSessionModal.test.tsx`:

```typescript
it("shows tool selector with Claude and Codex", async () => {
  render(
    <StartSessionModal
      machineId="m1"
      machineName="m1"
      onStart={vi.fn()}
      onClose={vi.fn()}
      listDirectory={mockListDir}
    />,
  );
  expect(screen.getByText("Claude")).toBeInTheDocument();
  expect(screen.getByText("Codex")).toBeInTheDocument();
});

it("shows --full-auto flag when Codex is selected", async () => {
  render(
    <StartSessionModal
      machineId="m1"
      machineName="m1"
      onStart={vi.fn()}
      onClose={vi.fn()}
      listDirectory={mockListDir}
    />,
  );
  // Initially shows Claude flags
  expect(screen.getByText("--dangerously-skip-permissions")).toBeInTheDocument();
  expect(screen.queryByText("--full-auto")).not.toBeInTheDocument();

  // Switch to Codex
  fireEvent.click(screen.getByText("Codex"));
  expect(screen.getByText("--full-auto")).toBeInTheDocument();
  expect(screen.queryByText("--dangerously-skip-permissions")).not.toBeInTheDocument();
});

it("passes cliTool to onStart", async () => {
  const onStart = vi.fn();
  render(
    <StartSessionModal
      machineId="m1"
      machineName="m1"
      onStart={onStart}
      onClose={vi.fn()}
      listDirectory={mockListDir}
    />,
  );
  fireEvent.click(screen.getByText("Codex"));
  fireEvent.click(screen.getByText("Start"));
  expect(onStart).toHaveBeenCalledWith("m1", undefined, "~", undefined, "codex");
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/web && bunx vitest run StartSessionModal`
Expected: FAIL

**Step 3: Update StartSessionModal**

Update the `onStart` prop type in `StartSessionModalProps`:

```typescript
onStart: (machineId: string, args?: string, cwd?: string, name?: string, cliTool?: "claude" | "codex") => void;
```

Import `CLI_TOOLS` from `@blkcat/shared`:

```typescript
import { CLI_TOOLS } from "@blkcat/shared";
import type { CliTool } from "@blkcat/shared";
```

Remove the hardcoded `FLAG_OPTIONS` constant. Replace with dynamic lookup.

Add state for selected tool:

```typescript
const [selectedTool, setSelectedTool] = useState<CliTool>("claude");
```

Derive flag options from `CLI_TOOLS[selectedTool].flags`. Add a resume flag entry at the beginning:

```typescript
const flagOptions = [
  { flag: selectedTool === "claude" ? "--resume" : "resume", color: "var(--accent)" },
  ...CLI_TOOLS[selectedTool].flags,
];
```

Add tool selector UI before Flags section — two pill buttons:

```tsx
{/* CLI Tool */}
<div>
  <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
    CLI Tool
  </label>
  <div style={{ display: "flex", gap: 8 }}>
    {(["claude", "codex"] as const).map((tool) => {
      const isSelected = selectedTool === tool;
      return (
        <button
          key={tool}
          type="button"
          onClick={() => { setSelectedTool(tool); setSelectedFlags(new Set()); }}
          style={{
            background: isSelected ? "var(--accent)" : "transparent",
            color: isSelected ? "#fff" : "var(--text-muted)",
            border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
            borderRadius: 16,
            padding: "4px 16px",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            lineHeight: 1.4,
            textTransform: "capitalize",
          }}
        >
          {tool.charAt(0).toUpperCase() + tool.slice(1)}
        </button>
      );
    })}
  </div>
</div>
```

Update `handleStart` to pass `selectedTool`:

```typescript
function handleStart() {
  const parts: string[] = [];
  for (const { flag } of flagOptions) {
    if (selectedFlags.has(flag)) {
      parts.push(flag);
    }
  }
  const trimmed = extraArgs.trim();
  if (trimmed) parts.push(trimmed);
  const combinedArgs = parts.length > 0 ? parts.join(" ") : undefined;
  const finalName = sessionName.trim() || undefined;
  onStart(machineId, combinedArgs, currentPath, finalName, selectedTool);
  onClose();
}
```

Update the Flags section to use `flagOptions` instead of `FLAG_OPTIONS`.

**Step 4: Run test to verify it passes**

Run: `cd packages/web && bunx vitest run StartSessionModal`
Expected: PASS

**Step 5: Fix existing test that checks onStart args**

The test `"calls onStart with combined args"` now needs to expect a 5th argument. Update:

```typescript
expect(onStart).toHaveBeenCalledWith("m1", "--resume", "~", undefined, "claude");
```

**Step 6: Run all web tests**

Run: `cd packages/web && bunx vitest run`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/web/src/components/StartSessionModal.tsx packages/web/src/components/StartSessionModal.test.tsx
git commit -m "feat(web): add CLI tool selector to Start Session modal"
```

---

### Task 9: Update ReloadSessionModal to be tool-aware

**Files:**
- Modify: `packages/web/src/components/ReloadSessionModal.tsx`

**Step 1: Update props to include cliTool**

```typescript
import { CLI_TOOLS } from "@blkcat/shared";
import type { CliTool } from "@blkcat/shared";

interface ReloadSessionModalProps {
  sessionName: string;
  currentArgs?: string;
  cliTool?: CliTool;
  onReload: (args?: string, resume?: boolean) => void;
  onClose: () => void;
}
```

**Step 2: Replace hardcoded FLAG_OPTIONS with dynamic lookup**

Remove the static `FLAG_OPTIONS` constant. Inside the component:

```typescript
const tool = cliTool ?? "claude";
const resumeFlag = tool === "claude" ? "--resume" : "resume";
const FLAG_OPTIONS = [
  { flag: resumeFlag, color: "var(--accent)" },
  ...CLI_TOOLS[tool].flags,
];
```

**Step 3: Update initial flags and args stripping**

Update the initialFlags logic to use the dynamic `resumeFlag`:

```typescript
const initialFlags = new Set<string>([resumeFlag]);
for (const { flag } of FLAG_OPTIONS) {
  if (flag === resumeFlag) continue;
  if (currentArgs?.includes(flag)) {
    initialFlags.add(flag);
  }
}
```

Update the extraArgs stripping to handle both tools:

```typescript
const [extraArgs, setExtraArgs] = useState(() => {
  if (!currentArgs) return "";
  let remainder = currentArgs;
  for (const { flag } of FLAG_OPTIONS) {
    remainder = remainder.replace(flag, "");
  }
  // Strip --resume/resume values if present
  remainder = remainder.replace(/--resume\s+\S+/, "").replace(/--resume/, "");
  remainder = remainder.replace(/resume\s+\S+/, "").replace(/\bresume\b/, "");
  return remainder.trim();
});
```

**Step 4: Run web tests**

Run: `cd packages/web && bunx vitest run`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/web/src/components/ReloadSessionModal.tsx
git commit -m "feat(web): make ReloadSessionModal tool-aware for Claude/Codex"
```

---

### Task 10: Update Sidebar with (codex) label and adaptive tooltip

**Files:**
- Modify: `packages/web/src/components/Sidebar.tsx:276-280` (add codex label)
- Modify: `packages/web/src/components/Sidebar.tsx:334` (adaptive tooltip)
- Modify: `packages/web/src/components/Sidebar.tsx:398-409` (pass cliTool to ReloadSessionModal)
- Modify: `packages/web/src/components/Sidebar.test.tsx`

**Step 1: Write failing test**

Add to `packages/web/src/components/Sidebar.test.tsx`:

```typescript
it("shows (codex) label for codex sessions", () => {
  const codexMachines: MachineSnapshot[] = [
    {
      machineId: "m1",
      sessions: [
        { id: "s1", name: "dev", target: "local", cliTool: "codex" },
      ],
      lastSeen: Date.now(),
    },
  ];
  render(<Sidebar machines={codexMachines} onSelectSession={() => {}} />);
  expect(screen.getByText("(codex)")).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/web && bunx vitest run Sidebar`
Expected: FAIL

**Step 3: Add (codex) label in Sidebar**

After the existing `(ssh)` label (around line 276-280), add:

```tsx
{session.cliTool === "codex" && (
  <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>
    (codex)
  </span>
)}
```

**Step 4: Update reload button tooltip**

Change line 334 from:

```typescript
title="Reload session (claude --resume)"
```

to:

```typescript
title={`Reload session (${session.cliTool === "codex" ? "codex resume" : "claude --resume"})`}
```

**Step 5: Pass cliTool to ReloadSessionModal**

In the ReloadSessionModal rendering (around line 399), add the `cliTool` prop:

```tsx
<ReloadSessionModal
  sessionName={...}
  currentArgs={reloadTarget.session.args}
  cliTool={reloadTarget.session.cliTool}
  onReload={(args, resume) => { ... }}
  onClose={() => setReloadTarget(null)}
/>
```

**Step 6: Update Sidebar onStart callback to pass cliTool**

In the StartSessionModal rendering (around line 390), update the `onStart` callback:

```tsx
onStart={(mid, args, cwd, name, cliTool) => {
  onStartSession(mid, args, cwd, name, cliTool);
  setModalMachineId(null);
}}
```

Update the `onStartSession` prop type in `SidebarProps`:

```typescript
onStartSession?: (machineId: string, args?: string, cwd?: string, name?: string, cliTool?: "claude" | "codex") => void;
```

**Step 7: Run test to verify it passes**

Run: `cd packages/web && bunx vitest run Sidebar`
Expected: PASS

**Step 8: Commit**

```bash
git add packages/web/src/components/Sidebar.tsx packages/web/src/components/Sidebar.test.tsx
git commit -m "feat(web): add (codex) label and tool-aware reload in Sidebar"
```

---

### Task 11: Wire cliTool through App.tsx / Dashboard component

**Files:**
- Modify: the component that passes `onStartSession` to Sidebar (likely `App.tsx` or equivalent)

**Step 1: Find where onStartSession is wired**

Search for where `onStartSession` is passed to `<Sidebar>` in the app. Update it to accept and forward the `cliTool` parameter to `useSocket.startSession`.

The call should change from:

```typescript
onStartSession={(machineId, args, cwd, name) => startSession(machineId, args, cwd, name)}
```

to:

```typescript
onStartSession={(machineId, args, cwd, name, cliTool) => startSession(machineId, args, cwd, name, cliTool)}
```

**Step 2: Run full web tests**

Run: `cd packages/web && bunx vitest run`
Expected: PASS

**Step 3: Commit**

```bash
git add packages/web/src/App.tsx  # or wherever the wiring is
git commit -m "feat(web): wire cliTool through to startSession WebSocket call"
```

---

### Task 12: Create codex-sessions.ts for session ID polling

**Files:**
- Create: `packages/agent/src/codex-sessions.ts`
- Create: `packages/agent/src/codex-sessions.test.ts`

**Step 1: Write the failing test**

Create `packages/agent/src/codex-sessions.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { findLatestCodexSessionId } from "./codex-sessions";

describe("findLatestCodexSessionId", () => {
  it("returns null when sessions dir does not exist", () => {
    const result = findLatestCodexSessionId("/nonexistent/path");
    expect(result).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/agent && bun test codex-sessions.test.ts`
Expected: FAIL — module not found

**Step 3: Implement codex-sessions.ts**

Create `packages/agent/src/codex-sessions.ts`:

```typescript
import { readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Scans ~/.codex/sessions/YYYY/MM/DD/ directories to find the most recent
 * Codex session ID. Returns the session ID string or null if none found.
 */
export function findLatestCodexSessionId(sessionsDir: string): string | null {
  try {
    // Walk YYYY/MM/DD structure to find the most recent session file
    const years = readdirSync(sessionsDir).filter(d => /^\d{4}$/.test(d)).sort().reverse();
    for (const year of years) {
      const yearPath = join(sessionsDir, year);
      const months = readdirSync(yearPath).filter(d => /^\d{2}$/.test(d)).sort().reverse();
      for (const month of months) {
        const monthPath = join(yearPath, month);
        const days = readdirSync(monthPath).filter(d => /^\d{2}$/.test(d)).sort().reverse();
        for (const day of days) {
          const dayPath = join(monthPath, day);
          const files = readdirSync(dayPath).sort().reverse();
          if (files.length > 0) {
            // Session ID is the filename without extension
            return files[0].replace(/\.[^.]+$/, "");
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/agent && bun test codex-sessions.test.ts`
Expected: PASS

**Step 5: Wire into agent index.ts**

In `packages/agent/src/index.ts`, import and set up periodic polling for Codex sessions:

```typescript
import { findLatestCodexSessionId } from "./codex-sessions";
import { resolve } from "path";

// Inside main(), after the hooks server setup, add:
// Poll for Codex session IDs (no hooks system available)
const codexSessionsDir = resolve(process.env.HOME ?? "/root", ".codex/sessions");
setInterval(() => {
  // Find active codex panes and try to correlate with session files
  for (const [paneId] of captures) {
    const allSessions = [...autoSessions, ...manualSessions];
    const session = allSessions.find((s) => s.id === paneId);
    if (session?.cliTool === "codex" && !sessionIds.has(paneId)) {
      const latest = findLatestCodexSessionId(codexSessionsDir);
      if (latest) {
        sessionIds.set(paneId, latest);
      }
    }
  }
}, 5000);
```

**Step 6: Run all agent tests**

Run: `cd packages/agent && bun test`
Expected: PASS

**Step 7: Commit**

```bash
git add packages/agent/src/codex-sessions.ts packages/agent/src/codex-sessions.test.ts packages/agent/src/index.ts
git commit -m "feat(agent): poll codex session files for session ID tracking"
```

---

### Task 13: Run full test suite and build

**Step 1: Run all backend tests**

Run: `bun test`
Expected: All pass

**Step 2: Run all web tests**

Run: `cd packages/web && bunx vitest run`
Expected: All pass

**Step 3: Build production web bundle**

Run: `cd packages/web && bunx vite build`
Expected: Build succeeds

**Step 4: Commit any remaining fixes**

If any tests fail, fix and commit with descriptive message.

---

### Task 14: Update README documentation

**Files:**
- Modify: `README.md`

**Step 1: Add Codex CLI section**

Document:
- Codex CLI support (auto-discovery + manual start)
- Tool selector in Start Session modal
- Tool-aware reload with Codex-specific flags (`--full-auto`)
- `(codex)` label in sidebar
- Limitation: no hooks support for Codex (terminal-based detection only)
- Codex session ID tracking via `~/.codex/sessions/` polling

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document Codex CLI support"
```
