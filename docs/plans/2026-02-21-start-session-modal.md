# Start Session Modal — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the inline sidebar form with a modal file explorer + toggle chips for starting Claude sessions, and show red sidebar indicators for dangerous sessions.

**Architecture:** New `list_directory`/`directory_listing` WebSocket message pair for live directory browsing. New `StartSessionModal` component with file browser, flag toggle chips, and args input. `SessionInfo.args` field propagated through the full stack so the sidebar can detect `--dangerously-skip-permissions`.

**Tech Stack:** TypeScript, React 19, Bun, WebSocket protocol (existing patterns)

---

### Task 1: Add `args` to `SessionInfo` and new directory message types (shared)

**Files:**
- Modify: `packages/shared/src/protocol.ts:3-8` (SessionInfo)
- Modify: `packages/shared/src/protocol.ts:57-62` (AgentToServerMessage union)
- Modify: `packages/shared/src/protocol.ts:102` (ServerToAgentMessage union)
- Modify: `packages/shared/src/protocol.ts:144-149` (ServerToDashboardMessage union)
- Modify: `packages/shared/src/protocol.ts:195` (DashboardToServerMessage union)
- Modify: `packages/shared/src/protocol.ts:210-211` (parser type sets)
- Test: `packages/shared/src/protocol.test.ts`

**Step 1: Write failing tests for new message types**

Add to `packages/shared/src/protocol.test.ts`:

```typescript
it("parses list_directory message", () => {
  const msg = parseDashboardMessage(JSON.stringify({
    type: "list_directory",
    machineId: "m1",
    requestId: "req-1",
    path: "/home/user",
  }));
  expect(msg?.type).toBe("list_directory");
});

it("parses directory_listing from agent", () => {
  const msg = parseAgentMessage(JSON.stringify({
    type: "directory_listing",
    machineId: "m1",
    requestId: "req-1",
    path: "/home/user",
    entries: [{ name: "src", isDir: true }, { name: "README.md", isDir: false }],
  }));
  expect(msg?.type).toBe("directory_listing");
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/shared && bun test`
Expected: FAIL — `list_directory` and `directory_listing` not in parser type sets

**Step 3: Add types and update parsers**

In `packages/shared/src/protocol.ts`:

1. Add `args?: string` to `SessionInfo` (line 7):
```typescript
export interface SessionInfo {
  id: string;
  name: string;
  target: "local" | "ssh";
  host?: string;
  args?: string;
}
```

2. Add new agent message type after `AgentHookEventMessage`:
```typescript
export interface AgentDirectoryListingMessage {
  type: "directory_listing";
  machineId: string;
  requestId: string;
  path: string;
  entries: { name: string; isDir: boolean }[];
  error?: string;
}
```

3. Add to `AgentToServerMessage` union:
```typescript
export type AgentToServerMessage =
  | AgentRegisterMessage
  | AgentOutputMessage
  | AgentSessionsMessage
  | AgentScrollbackMessage
  | AgentHookEventMessage
  | AgentDirectoryListingMessage;
```

4. Add new server→agent message type after `ServerReloadSessionMessage`:
```typescript
export interface ServerListDirectoryMessage {
  type: "list_directory";
  requestId: string;
  path: string;
}
```

5. Add to `ServerToAgentMessage` union:
```typescript
export type ServerToAgentMessage = ServerInputMessage | ServerStartSessionMessage | ServerCloseSessionMessage | ServerResizeMessage | ServerRequestScrollbackMessage | ServerReloadSessionMessage | ServerListDirectoryMessage;
```

6. Add new server→dashboard message type after `ServerHookEventMessage`:
```typescript
export interface ServerDirectoryListingMessage {
  type: "directory_listing";
  machineId: string;
  requestId: string;
  path: string;
  entries: { name: string; isDir: boolean }[];
  error?: string;
}
```

7. Add to `ServerToDashboardMessage` union:
```typescript
export type ServerToDashboardMessage =
  | ServerSnapshotMessage
  | ServerMachineUpdateMessage
  | ServerOutputMessage
  | ServerScrollbackMessage
  | ServerHookEventMessage
  | ServerDirectoryListingMessage;
```

8. Add new dashboard→server message type after `DashboardReloadSessionMessage`:
```typescript
export interface DashboardListDirectoryMessage {
  type: "list_directory";
  machineId: string;
  requestId: string;
  path: string;
}
```

9. Add to `DashboardToServerMessage` union:
```typescript
export type DashboardToServerMessage = DashboardInputMessage | DashboardStartSessionMessage | DashboardCloseSessionMessage | DashboardResizeMessage | DashboardRequestScrollbackMessage | DashboardReloadSessionMessage | DashboardListDirectoryMessage;
```

10. Update parser type sets:
```typescript
const AGENT_TYPES = new Set(["register", "output", "sessions", "scrollback", "hook_event", "directory_listing"]);
const DASHBOARD_TYPES = new Set(["input", "start_session", "close_session", "resize", "request_scrollback", "reload_session", "list_directory"]);
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/shared && bun test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/shared/src/protocol.ts packages/shared/src/protocol.test.ts
git commit -m "feat(shared): add args to SessionInfo, add directory listing message types"
```

---

### Task 2: Add `listDirectory` to agent and wire up handlers

**Files:**
- Modify: `packages/agent/src/capture.ts:95` (add listDirectory method)
- Modify: `packages/agent/src/connection.ts:7-12` (add onListDirectory callback)
- Modify: `packages/agent/src/connection.ts:33-50` (handle list_directory message)
- Modify: `packages/agent/src/connection.ts:55-61` (add sendDirectoryListing method)
- Modify: `packages/agent/src/listener.ts:7-12` (add onListDirectory callback)
- Modify: `packages/agent/src/listener.ts:44-61` (handle list_directory message)
- Modify: `packages/agent/src/listener.ts:80-100` (add sendDirectoryListing method)
- Modify: `packages/agent/src/index.ts:100-113` (add handleListDirectory, pass args to SessionInfo)
- Test: `packages/agent/src/capture.test.ts`

**Step 1: Write failing test for listDirectory**

Add to `packages/agent/src/capture.test.ts`:

```typescript
it("lists directory entries", () => {
  const exec = mockExec({
    "ls -1 -p /home/user/projects": {
      success: true,
      stdout: "src/\npackages/\nREADME.md\npackage.json\n",
    },
  });
  const capture = new TmuxCapture(exec);
  const result = capture.listDirectory("/home/user/projects");
  expect(result).toEqual({
    entries: [
      { name: "src", isDir: true },
      { name: "packages", isDir: true },
      { name: "README.md", isDir: false },
      { name: "package.json", isDir: false },
    ],
  });
});

it("returns error when directory does not exist", () => {
  const exec = mockExec({});
  const capture = new TmuxCapture(exec);
  const result = capture.listDirectory("/nonexistent");
  expect(result).toEqual({ error: "Failed to list directory" });
});

it("resolves ~ in directory path", () => {
  const calls: string[][] = [];
  const exec: ExecFn = (cmd) => {
    calls.push(cmd);
    return { success: true, stdout: "file.txt\n" };
  };
  const capture = new TmuxCapture(exec);
  capture.listDirectory("~/projects");
  // Should resolve ~ to home directory
  expect(calls[0][2]).not.toContain("~");
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/agent && bun test`
Expected: FAIL — `listDirectory` method doesn't exist

**Step 3: Implement listDirectory in capture.ts**

Add to `TmuxCapture` class in `packages/agent/src/capture.ts` after `startSession`:

```typescript
listDirectory(path: string): { entries: { name: string; isDir: boolean }[] } | { error: string } {
  const resolved = path.startsWith("~")
    ? path.replace("~", process.env.HOME ?? "/root")
    : path;
  const cmd = [...this.sshPrefix, "ls", "-1", "-p", resolved];
  const result = this.exec(cmd);
  if (!result.success) return { error: "Failed to list directory" };
  const entries = result.stdout.split("\n").filter(Boolean).map((entry) => {
    const isDir = entry.endsWith("/");
    return { name: isDir ? entry.slice(0, -1) : entry, isDir };
  });
  return { entries };
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/agent && bun test`
Expected: PASS

**Step 5: Wire up connection.ts**

In `packages/agent/src/connection.ts`:

1. Add to `AgentConnectionOptions` interface:
```typescript
onListDirectory?: (requestId: string, path: string) => void;
```

2. Add handler in message listener (after `reload_session` handler):
```typescript
} else if (msg.type === "list_directory") {
  opts.onListDirectory?.(msg.requestId, msg.path);
}
```

3. Add method to `AgentConnection` class:
```typescript
sendDirectoryListing(machineId: string, requestId: string, path: string, entries: { name: string; isDir: boolean }[], error?: string) {
  const msg: Record<string, any> = {
    type: "directory_listing",
    machineId,
    requestId,
    path,
    entries,
  };
  if (error) msg.error = error;
  this.ws.send(JSON.stringify(msg));
}
```

**Step 6: Wire up listener.ts**

Same pattern as connection.ts:

1. Add `onListDirectory` to `AgentListenerOptions`
2. Add handler in message handler
3. Add `sendDirectoryListing` method (broadcasts to all clients)

**Step 7: Wire up index.ts**

1. Add `handleListDirectory` function:
```typescript
function handleListDirectory(requestId: string, path: string) {
  const localCap = new TmuxCapture(bunExec);
  const result = localCap.listDirectory(path);
  if ("error" in result) {
    conn.sendDirectoryListing(config.machineId, requestId, path, [], result.error);
  } else {
    conn.sendDirectoryListing(config.machineId, requestId, path, result.entries);
  }
}
```

2. Pass `onListDirectory: handleListDirectory` to both `AgentConnection` and `AgentListener` constructors.

3. Update `handleStartSession` to include `args` in `SessionInfo`:
```typescript
const session: SessionInfo = {
  id: paneId,
  name: `claude${args ? ` ${args}` : ""}`,
  target: "local",
  args: args || undefined,
};
```

4. Add `sendDirectoryListing` to the `conn` interface type.

**Step 8: Run all backend tests**

Run: `bun test`
Expected: PASS

**Step 9: Commit**

```bash
git add packages/agent/src/capture.ts packages/agent/src/capture.test.ts packages/agent/src/connection.ts packages/agent/src/listener.ts packages/agent/src/index.ts
git commit -m "feat(agent): add directory listing and pass args in SessionInfo"
```

---

### Task 3: Route directory messages through server

**Files:**
- Modify: `packages/server/src/server.ts:75-136` (handleAgentMessage — add directory_listing)
- Modify: `packages/server/src/server.ts:318-377` (dashboard message handler — add list_directory)

**Step 1: Add server routing for list_directory (dashboard → agent)**

In `packages/server/src/server.ts`, in the dashboard message handler (after `reload_session` block around line 376):

```typescript
} else if (msg.type === "list_directory") {
  const machine = machines.get(msg.machineId);
  if (machine) {
    machine.agent.send(JSON.stringify({
      type: "list_directory",
      requestId: msg.requestId,
      path: msg.path,
    }));
  }
}
```

**Step 2: Add server routing for directory_listing (agent → dashboard)**

In `handleAgentMessage`, after the `hook_event` block (around line 135):

```typescript
} else if (msg.type === "directory_listing") {
  broadcastToDashboards(msg);
}
```

**Step 3: Update parsers — already done in Task 1**

The parser type sets already include `list_directory` and `directory_listing`.

**Step 4: Run all tests**

Run: `bun test`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/server/src/server.ts
git commit -m "feat(server): route directory listing messages between dashboard and agent"
```

---

### Task 4: Add `listDirectory` and `directory_listing` handler to useSocket

**Files:**
- Modify: `packages/web/src/hooks/useSocket.ts:55-74` (UseSocketReturn interface)
- Modify: `packages/web/src/hooks/useSocket.ts:125-236` (WebSocket message handler)
- Modify: `packages/web/src/hooks/useSocket.ts:255-266` (add listDirectory function)
- Modify: `packages/web/src/hooks/useSocket.ts:308` (return value)

**Step 1: Add listDirectory to useSocket**

1. Add a `directoryListingSubsRef` for callbacks keyed by `requestId`:
```typescript
const directoryListingSubsRef = useRef(new Map<string, (msg: { path: string; entries: { name: string; isDir: boolean }[]; error?: string }) => void>());
```

2. Add handler in message listener (after `hook_event`):
```typescript
} else if (msg.type === "directory_listing") {
  const cb = directoryListingSubsRef.current.get(msg.requestId);
  if (cb) {
    directoryListingSubsRef.current.delete(msg.requestId);
    cb({ path: msg.path, entries: msg.entries ?? [], error: msg.error });
  }
}
```

3. Add `listDirectory` function:
```typescript
const listDirectory = useCallback(
  (machineId: string, path: string): Promise<{ path: string; entries: { name: string; isDir: boolean }[]; error?: string }> => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ path, entries: [], error: "Not connected" });
    }
    const requestId = crypto.randomUUID();
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        directoryListingSubsRef.current.delete(requestId);
        resolve({ path, entries: [], error: "Timeout" });
      }, 5000);
      directoryListingSubsRef.current.set(requestId, (result) => {
        clearTimeout(timeout);
        resolve(result);
      });
      ws.send(JSON.stringify({ type: "list_directory", machineId, requestId, path }));
    });
  },
  [],
);
```

4. Add `listDirectory` to the `UseSocketReturn` interface and return value.

**Step 2: Run web tests**

Run: `cd packages/web && bunx vitest run`
Expected: PASS (existing tests still work)

**Step 3: Commit**

```bash
git add packages/web/src/hooks/useSocket.ts
git commit -m "feat(web): add listDirectory to useSocket hook"
```

---

### Task 5: Create StartSessionModal component

**Files:**
- Create: `packages/web/src/components/StartSessionModal.tsx`
- Test: `packages/web/src/components/StartSessionModal.test.tsx`

**Step 1: Write tests for StartSessionModal**

Create `packages/web/src/components/StartSessionModal.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StartSessionModal } from "./StartSessionModal";

const mockListDir = vi.fn().mockResolvedValue({
  path: "/home/user",
  entries: [
    { name: "projects", isDir: true },
    { name: "docs", isDir: true },
    { name: ".bashrc", isDir: false },
  ],
});

describe("StartSessionModal", () => {
  it("renders modal with machine name", () => {
    render(
      <StartSessionModal
        machineId="m1"
        machineName="My Machine"
        onStart={vi.fn()}
        onClose={vi.fn()}
        listDirectory={mockListDir}
      />,
    );
    expect(screen.getByText(/My Machine/)).toBeInTheDocument();
  });

  it("loads directory listing on mount", async () => {
    render(
      <StartSessionModal
        machineId="m1"
        machineName="My Machine"
        onStart={vi.fn()}
        onClose={vi.fn()}
        listDirectory={mockListDir}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("projects")).toBeInTheDocument();
    });
  });

  it("navigates into a folder on click", async () => {
    const listDir = vi.fn()
      .mockResolvedValueOnce({
        path: "~",
        entries: [{ name: "projects", isDir: true }],
      })
      .mockResolvedValueOnce({
        path: "/home/user/projects",
        entries: [{ name: "myapp", isDir: true }],
      });

    render(
      <StartSessionModal
        machineId="m1"
        machineName="m1"
        onStart={vi.fn()}
        onClose={vi.fn()}
        listDirectory={listDir}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("projects")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("projects"));
    await waitFor(() => {
      expect(screen.getByText("myapp")).toBeInTheDocument();
    });
  });

  it("toggles flag chips", () => {
    render(
      <StartSessionModal
        machineId="m1"
        machineName="m1"
        onStart={vi.fn()}
        onClose={vi.fn()}
        listDirectory={mockListDir}
      />,
    );
    const chip = screen.getByText("--resume");
    fireEvent.click(chip);
    // chip should now be selected (accent background)
    expect(chip.style.background).not.toBe("");
  });

  it("calls onStart with combined args", async () => {
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

    // Toggle --resume
    fireEvent.click(screen.getByText("--resume"));
    // Click Start
    fireEvent.click(screen.getByText("Start"));

    expect(onStart).toHaveBeenCalledWith("m1", "--resume", "~");
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(
      <StartSessionModal
        machineId="m1"
        machineName="m1"
        onStart={vi.fn()}
        onClose={onClose}
        listDirectory={mockListDir}
      />,
    );
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when X button clicked", () => {
    const onClose = vi.fn();
    render(
      <StartSessionModal
        machineId="m1"
        machineName="m1"
        onStart={vi.fn()}
        onClose={onClose}
        listDirectory={mockListDir}
      />,
    );
    fireEvent.click(screen.getByTestId("modal-close"));
    expect(onClose).toHaveBeenCalled();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/web && bunx vitest run`
Expected: FAIL — module not found

**Step 3: Implement StartSessionModal**

Create `packages/web/src/components/StartSessionModal.tsx`:

```tsx
import React, { useState, useEffect } from "react";

interface DirEntry {
  name: string;
  isDir: boolean;
}

interface StartSessionModalProps {
  machineId: string;
  machineName: string;
  onStart: (machineId: string, args?: string, cwd?: string) => void;
  onClose: () => void;
  listDirectory: (machineId: string, path: string) => Promise<{
    path: string;
    entries: DirEntry[];
    error?: string;
  }>;
}

const FLAG_PRESETS = [
  { flag: "--resume", label: "--resume" },
  { flag: "--dangerously-skip-permissions", label: "--dangerously-skip-permissions" },
];

export function StartSessionModal({
  machineId,
  machineName,
  onStart,
  onClose,
  listDirectory,
}: StartSessionModalProps) {
  const [currentPath, setCurrentPath] = useState("~");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [selectedFlags, setSelectedFlags] = useState<Set<string>>(new Set());
  const [extraArgs, setExtraArgs] = useState("");

  const loadDirectory = async (path: string) => {
    setLoading(true);
    setError(undefined);
    const result = await listDirectory(machineId, path);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      setEntries(result.entries);
      setCurrentPath(path);
    }
  };

  useEffect(() => {
    loadDirectory("~");
  }, []);

  const navigateUp = () => {
    if (currentPath === "/" || currentPath === "~") return;
    const parent = currentPath.replace(/\/[^/]+\/?$/, "") || "/";
    loadDirectory(parent);
  };

  const navigateInto = (folder: string) => {
    const next = currentPath === "/" ? `/${folder}` : `${currentPath}/${folder}`;
    loadDirectory(next);
  };

  const toggleFlag = (flag: string) => {
    setSelectedFlags((prev) => {
      const next = new Set(prev);
      if (next.has(flag)) next.delete(flag);
      else next.add(flag);
      return next;
    });
  };

  const handleSubmit = () => {
    const parts = [...selectedFlags];
    if (extraArgs.trim()) parts.push(extraArgs.trim());
    const args = parts.length > 0 ? parts.join(" ") : undefined;
    onStart(machineId, args, currentPath);
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        data-testid="modal-backdrop"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0, 0, 0, 0.6)",
          zIndex: 100,
        }}
      />
      {/* Modal */}
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 480,
          maxHeight: "80vh",
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          zIndex: 101,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: 14 }}>
            Start Session on {machineName}
          </span>
          <button
            data-testid="modal-close"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
          {/* Working Directory */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              Working Directory
            </div>
            {/* Path bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "6px 8px",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: "4px 4px 0 0",
                borderBottom: "none",
                fontSize: 13,
                color: "var(--text)",
              }}
            >
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {currentPath}
              </span>
              <button
                onClick={navigateUp}
                title="Go to parent directory"
                style={{
                  background: "none",
                  border: "1px solid var(--border)",
                  borderRadius: 3,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: 12,
                  padding: "1px 6px",
                  lineHeight: 1,
                }}
              >
                ↑
              </button>
            </div>
            {/* File list */}
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "0 0 4px 4px",
                maxHeight: 240,
                overflowY: "auto",
                background: "var(--bg)",
              }}
            >
              {loading ? (
                <div style={{ padding: 12, color: "var(--text-muted)", fontSize: 12, textAlign: "center" }}>
                  Loading...
                </div>
              ) : error ? (
                <div style={{ padding: 12, color: "var(--red)", fontSize: 12 }}>
                  {error}
                </div>
              ) : entries.length === 0 ? (
                <div style={{ padding: 12, color: "var(--text-muted)", fontSize: 12 }}>
                  Empty directory
                </div>
              ) : (
                entries.map((entry) => (
                  <div
                    key={entry.name}
                    onClick={entry.isDir ? () => navigateInto(entry.name) : undefined}
                    style={{
                      padding: "4px 8px",
                      fontSize: 13,
                      cursor: entry.isDir ? "pointer" : "default",
                      color: entry.isDir ? "var(--text)" : "var(--text-muted)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                    onMouseEnter={entry.isDir ? (e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-tertiary)"; } : undefined}
                    onMouseLeave={entry.isDir ? (e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; } : undefined}
                  >
                    <span style={{ fontSize: 12, width: 16, textAlign: "center" }}>
                      {entry.isDir ? "📁" : "📄"}
                    </span>
                    {entry.name}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Flags */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              Flags
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {FLAG_PRESETS.map(({ flag, label }) => {
                const isActive = selectedFlags.has(flag);
                const isDanger = flag === "--dangerously-skip-permissions";
                const activeColor = isDanger ? "var(--red)" : "var(--accent)";
                return (
                  <button
                    key={flag}
                    onClick={() => toggleFlag(flag)}
                    style={{
                      padding: "4px 10px",
                      fontSize: 12,
                      borderRadius: 12,
                      cursor: "pointer",
                      border: `1px solid ${isActive ? activeColor : "var(--border)"}`,
                      background: isActive ? activeColor : "transparent",
                      color: isActive ? "#fff" : "var(--text-muted)",
                      transition: "all 0.15s",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Extra args */}
          <div style={{ marginBottom: 16 }}>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                marginBottom: 6,
              }}
            >
              Additional args
            </div>
            <input
              type="text"
              value={extraArgs}
              onChange={(e) => setExtraArgs(e.target.value)}
              placeholder="e.g. --model sonnet"
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: 12,
                background: "var(--bg)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={handleSubmit}
            style={{
              padding: "6px 16px",
              fontSize: 13,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Start
          </button>
        </div>
      </div>
    </>
  );
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/web && bunx vitest run`
Expected: PASS

**Step 5: Commit**

```bash
git add packages/web/src/components/StartSessionModal.tsx packages/web/src/components/StartSessionModal.test.tsx
git commit -m "feat(web): add StartSessionModal with file browser and flag chips"
```

---

### Task 6: Replace inline form with modal in Sidebar + red indicator

**Files:**
- Modify: `packages/web/src/components/Sidebar.tsx:5-24` (props interface)
- Modify: `packages/web/src/components/Sidebar.tsx:46-48` (state)
- Modify: `packages/web/src/components/Sidebar.tsx:150-250` (replace form with modal trigger)
- Modify: `packages/web/src/components/Sidebar.tsx:277-295` (red color for dangerous sessions)
- Modify: `packages/web/src/App.tsx:49-50` (pass listDirectory)
- Modify: `packages/web/src/App.tsx:96-126` (wire modal props)
- Test: `packages/web/src/components/Sidebar.test.tsx`

**Step 1: Write tests for red indicator**

Add to `packages/web/src/components/Sidebar.test.tsx`:

```typescript
it("shows red text for sessions with --dangerously-skip-permissions", () => {
  const dangerousMachines: MachineSnapshot[] = [
    {
      machineId: "m1",
      sessions: [
        { id: "s1", name: "dev", target: "local", args: "--dangerously-skip-permissions" },
      ],
      lastSeen: Date.now(),
    },
  ];
  render(
    <Sidebar machines={dangerousMachines} onSelectSession={() => {}} />,
  );
  const sessionBtn = screen.getByTestId("session-s1");
  expect(sessionBtn.style.color).toBe("var(--red)");
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/web && bunx vitest run`
Expected: FAIL — color is still `var(--text)`

**Step 3: Update Sidebar**

In `packages/web/src/components/Sidebar.tsx`:

1. Add `listDirectory` and `startSessionModal` state to manage the modal:
   - Add to `SidebarProps`: `listDirectory?: (machineId: string, path: string) => Promise<{ path: string; entries: { name: string; isDir: boolean }[]; error?: string }>`
   - Add state: `const [modalMachineId, setModalMachineId] = useState<string | null>(null);`

2. Replace the "+" button `onClick` to open the modal:
```typescript
onClick={() => setModalMachineId(machine.machineId)}
```

3. Remove the inline form block (lines 175-250) and the `expandedMachine`, `sessionArgs`, `sessionCwd` state.

4. Add modal rendering at the end of the component (before closing `</aside>`):
```tsx
{modalMachineId && onStartSession && listDirectory && (
  <StartSessionModal
    machineId={modalMachineId}
    machineName={getMachineName ? getMachineName(modalMachineId) : modalMachineId}
    onStart={(mid, args, cwd) => {
      onStartSession(mid, args, cwd);
      setModalMachineId(null);
    }}
    onClose={() => setModalMachineId(null)}
    listDirectory={listDirectory}
  />
)}
```

5. Add red color for dangerous sessions — update the session button color (around line 277):
```typescript
const isDangerous = session.args?.includes("--dangerously-skip-permissions");
// ...
color: isDangerous ? "var(--red)" : isSelected ? "var(--accent)" : "var(--text)",
```

6. Update the status dot color (around line 291):
```typescript
background: isDangerous ? "var(--red)" : isWaiting ? "var(--accent)" : "var(--text-muted)",
```

**Step 4: Update App.tsx**

1. Pass `listDirectory` from `useSocket` to `Sidebar`:
```typescript
const { ..., listDirectory, ... } = useSocket(WS_URL);
```

2. Add `listDirectory` prop on `Sidebar`:
```tsx
listDirectory={listDirectory}
```

**Step 5: Update Sidebar tests**

Update existing tests that reference the old inline form elements (`new-session-form-*`, `new-session-args-*`, `new-session-cwd-*`). The "+" button now opens a modal instead. Update tests to verify the modal opens (check for `StartSessionModal` content), or simplify tests to just verify the "+" button renders.

**Step 6: Run all web tests**

Run: `cd packages/web && bunx vitest run`
Expected: PASS

**Step 7: Run all backend tests**

Run: `bun test`
Expected: PASS

**Step 8: Commit**

```bash
git add packages/web/src/components/Sidebar.tsx packages/web/src/components/Sidebar.test.tsx packages/web/src/App.tsx packages/web/src/hooks/useSocket.ts
git commit -m "feat(web): replace inline form with modal, add red danger indicator"
```

---

### Task 7: Manual integration test

**Step 1: Start dev servers**

Run in separate terminals:
```bash
bun run dev:server
bun run dev:web
```

**Step 2: Verify**

1. Open dashboard in browser at `http://localhost:5173`
2. Click "+" on a connected machine — modal should appear
3. File browser loads `~` directory
4. Click into folders, navigate up
5. Toggle `--resume` chip (turns blue), toggle `--dangerously-skip-permissions` (turns red)
6. Type extra args
7. Click "Start" — session starts with combined args and selected CWD
8. Verify the new session appears in sidebar — if `--dangerously-skip-permissions` was selected, it should show in red

**Step 3: Commit final state if any adjustments needed**

```bash
git add -A
git commit -m "fix: integration test adjustments"
```
