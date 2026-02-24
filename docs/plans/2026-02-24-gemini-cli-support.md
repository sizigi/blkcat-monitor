# Gemini CLI Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Google Gemini CLI as a third supported tool alongside Claude Code and Codex CLI.

**Architecture:** The existing `CLI_TOOLS` map in `@blkcat/shared` is designed to be extensible. We widen the `CliTool` type union to include `"gemini"`, add a gemini entry to `CLI_TOOLS`, and update all hardcoded `"claude" | "codex"` type annotations throughout the codebase to use the `CliTool` type. Most runtime logic already reads from `CLI_TOOLS[tool]` generically and requires no changes.

**Tech Stack:** TypeScript, Bun, React 19, Vitest (web tests), bun:test (backend tests)

---

### Task 1: Widen CliTool type and add gemini to CLI_TOOLS

**Files:**
- Modify: `packages/shared/src/protocol.ts`
- Modify: `packages/shared/src/protocol.test.ts`

**Step 1: Update the CliTool type and CLI_TOOLS map**

In `packages/shared/src/protocol.ts`:

1. Line 9: Change `cliTool?: "claude" | "codex"` to `cliTool?: CliTool` (note: `CliTool` is defined on line 12, so this forward-reference works in TypeScript interfaces)
2. Line 12: Change `export type CliTool = "claude" | "codex"` to `export type CliTool = "claude" | "codex" | "gemini"`
3. After the codex entry (line 35), add the gemini entry:
```typescript
  gemini: {
    command: "gemini",
    resumeFlag: (id?: string) => id ? `--resume ${id}` : "--resume",
    flags: [
      { flag: "--yolo", color: "var(--red)" },
    ],
    configDir: "~/.gemini",
  },
```
4. Line 145: Change `cliTool?: "claude" | "codex"` to `cliTool?: CliTool` (add `CliTool` import is not needed since it's in the same file)
5. Line 319: Change `cliTool?: "claude" | "codex"` to `cliTool?: CliTool`

**Step 2: Update the CLI_TOOLS test**

In `packages/shared/src/protocol.test.ts`, update the existing test (line 290-298) to include gemini:

```typescript
describe("CLI_TOOLS", () => {
  it("CLI_TOOLS has configs for claude, codex, and gemini", () => {
    expect(CLI_TOOLS.claude.command).toBe("claude");
    expect(CLI_TOOLS.codex.command).toBe("codex");
    expect(CLI_TOOLS.gemini.command).toBe("gemini");
    expect(CLI_TOOLS.claude.resumeFlag("abc")).toBe("--resume abc");
    expect(CLI_TOOLS.claude.resumeFlag()).toBe("--resume");
    expect(CLI_TOOLS.codex.resumeFlag("abc")).toBe("resume abc");
    expect(CLI_TOOLS.codex.resumeFlag()).toBe("resume --last");
    expect(CLI_TOOLS.gemini.resumeFlag("abc")).toBe("--resume abc");
    expect(CLI_TOOLS.gemini.resumeFlag()).toBe("--resume");
  });
});
```

**Step 3: Run tests**

Run: `cd packages/shared && bun test`
Expected: All tests pass including the updated CLI_TOOLS test.

**Step 4: Commit**

```bash
git add packages/shared/src/protocol.ts packages/shared/src/protocol.test.ts
git commit -m "feat(shared): add gemini to CliTool type and CLI_TOOLS config"
```

---

### Task 2: Update agent discovery to find gemini sessions

**Files:**
- Modify: `packages/agent/src/discovery.ts`
- Modify: `packages/agent/src/discovery.test.ts`

**Step 1: Add "gemini" to CLI_COMMANDS and fix the type cast**

In `packages/agent/src/discovery.ts`:

1. Line 4: Change `const CLI_COMMANDS = new Set(["claude", "codex"])` to `const CLI_COMMANDS = new Set(["claude", "codex", "gemini"])`
2. Line 18: Change the cast from `cmd as "claude" | "codex"` to `cmd as CliTool`. Add the import: change line 2 from `import type { SessionInfo } from "@blkcat/shared"` to `import type { SessionInfo, CliTool } from "@blkcat/shared"`

**Step 2: Update the discovery test**

In `packages/agent/src/discovery.test.ts`, update the test data (line 7-28) to include a gemini session. Add a line to the mock stdout:
```
"gemini:0.0\tgemini\tgemini",
```

Update the assertions:
```typescript
expect(sessions).toHaveLength(4);
expect(sessions[0]).toEqual({ id: "dev:0.0", name: "dev", target: "local", cliTool: "claude" });
expect(sessions[1]).toEqual({ id: "web:0.0", name: "web", target: "local", cliTool: "claude" });
expect(sessions[2]).toEqual({ id: "codex:0.0", name: "codex", target: "local", cliTool: "codex" });
expect(sessions[3]).toEqual({ id: "gemini:0.0", name: "gemini", target: "local", cliTool: "gemini" });
```

**Step 3: Run tests**

Run: `cd packages/agent && bun test discovery.test.ts`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add packages/agent/src/discovery.ts packages/agent/src/discovery.test.ts
git commit -m "feat(agent): discover gemini sessions in tmux"
```

---

### Task 3: Update capture.ts and agent type annotations

**Files:**
- Modify: `packages/agent/src/capture.ts`
- Modify: `packages/agent/src/capture.test.ts`
- Modify: `packages/agent/src/connection.ts`
- Modify: `packages/agent/src/listener.ts`
- Modify: `packages/agent/src/index.ts`

**Step 1: Update capture.ts**

In `packages/agent/src/capture.ts`:

1. Add import at top: `import type { CliTool } from "@blkcat/shared";`
2. Line 104: Change `startSession(args?: string, cwd?: string, cliTool: "claude" | "codex" = "claude")` to `startSession(args?: string, cwd?: string, cliTool: CliTool = "claude")`
3. Line 105: Change `const command = cliTool === "codex" ? "codex" : "claude"` to use the CLI_TOOLS lookup: `const command = CLI_TOOLS[cliTool].command`. Add `import { CLI_TOOLS } from "@blkcat/shared"` to the top.

Actually, capture.ts doesn't currently import from shared (it only exports types). To keep it simple and avoid adding a dependency, just update the type annotation and use a generic lookup:
- Line 104: Change param type to `cliTool: CliTool = "claude"`
- Line 105: Replace the ternary with a map lookup. Since we don't want to import CLI_TOOLS just for the command name, use `cliTool` directly as the command (since for all tools, `CLI_TOOLS[tool].command === tool`): `const command = cliTool;`

**Step 2: Add gemini test to capture.test.ts**

Add a test after the existing codex test (after line 137):

```typescript
it("startSession uses gemini command when cliTool is gemini", () => {
  const cmds: string[][] = [];
  const exec: ExecFn = (cmd) => {
    cmds.push([...cmd]);
    if (cmd.some(c => c === "new-window")) {
      return { success: true, stdout: "test:0.0\n" };
    }
    return { success: true, stdout: "" };
  };
  const cap = new TmuxCapture(exec);
  cap.startSession("--yolo", undefined, "gemini");
  const sendKeysCmd = cmds.find(c => c.includes("send-keys") && c.includes("-l"));
  expect(sendKeysCmd).toBeDefined();
  expect(sendKeysCmd!.join(" ")).toContain("gemini --yolo");
});
```

**Step 3: Update connection.ts and listener.ts**

In `packages/agent/src/connection.ts`:
1. Add import: `import type { CliTool } from "@blkcat/shared";` (add `CliTool` to the existing import on line 1)
2. Line 7: Change `cliTool?: "claude" | "codex"` to `cliTool?: CliTool`

In `packages/agent/src/listener.ts`:
1. Add import: `import type { CliTool } from "@blkcat/shared";` (add `CliTool` to the existing import on line 1)
2. Line 7: Change `cliTool?: "claude" | "codex"` to `cliTool?: CliTool`

**Step 4: Update index.ts**

In `packages/agent/src/index.ts`:
1. Line 118: Change `cliTool?: "claude" | "codex"` to `cliTool?: CliTool`
2. Add `CliTool` to the import from `@blkcat/shared` on line 10: `import type { SessionInfo, AgentHookEventMessage, CliTool } from "@blkcat/shared";`

**Step 5: Run tests**

Run: `cd packages/agent && bun test`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add packages/agent/src/capture.ts packages/agent/src/capture.test.ts packages/agent/src/connection.ts packages/agent/src/listener.ts packages/agent/src/index.ts
git commit -m "feat(agent): update type annotations for gemini support"
```

---

### Task 4: Add Gemini session ID polling

**Files:**
- Create: `packages/agent/src/gemini-sessions.ts`
- Create: `packages/agent/src/gemini-sessions.test.ts`
- Modify: `packages/agent/src/index.ts`

**Step 1: Create gemini-sessions.ts**

Create `packages/agent/src/gemini-sessions.ts`:

```typescript
import { readdirSync, statSync } from "fs";
import { join } from "path";

/**
 * Scans ~/.gemini/tmp/<project_hash>/chats/ directories to find the most
 * recent Gemini session ID. Returns the session ID string or null if none found.
 */
export function findLatestGeminiSessionId(geminiDir: string): string | null {
  try {
    // geminiDir is ~/.gemini/tmp — scan all project hash dirs
    const projectDirs = readdirSync(geminiDir);
    let latestFile: string | null = null;
    let latestMtime = 0;

    for (const projectHash of projectDirs) {
      const chatsDir = join(geminiDir, projectHash, "chats");
      let files: string[];
      try {
        files = readdirSync(chatsDir);
      } catch {
        continue;
      }
      for (const file of files) {
        try {
          const filePath = join(chatsDir, file);
          const mtime = statSync(filePath).mtimeMs;
          if (mtime > latestMtime) {
            latestMtime = mtime;
            latestFile = file.replace(/\.[^.]+$/, "");
          }
        } catch {
          continue;
        }
      }
    }

    return latestFile;
  } catch {
    return null;
  }
}
```

**Step 2: Create gemini-sessions.test.ts**

Create `packages/agent/src/gemini-sessions.test.ts`:

```typescript
import { describe, it, expect } from "bun:test";
import { findLatestGeminiSessionId } from "./gemini-sessions";

describe("findLatestGeminiSessionId", () => {
  it("returns null when gemini dir does not exist", () => {
    const result = findLatestGeminiSessionId("/nonexistent/path");
    expect(result).toBeNull();
  });
});
```

**Step 3: Wire Gemini polling in index.ts**

In `packages/agent/src/index.ts`:

1. Add import after line 9: `import { findLatestGeminiSessionId } from "./gemini-sessions";`
2. After the Codex polling block (line 310), add Gemini polling:

```typescript
  // Poll for Gemini session IDs (no hooks system available)
  const geminiSessionsDir = resolve(process.env.HOME ?? "/root", ".gemini/tmp");
  setInterval(() => {
    for (const [paneId] of captures) {
      const allSessions = [...autoSessions, ...manualSessions];
      const session = allSessions.find((s) => s.id === paneId);
      if (session?.cliTool === "gemini" && !sessionIds.has(paneId)) {
        const latest = findLatestGeminiSessionId(geminiSessionsDir);
        if (latest) {
          sessionIds.set(paneId, latest);
        }
      }
    }
  }, 5000);
```

**Step 4: Run tests**

Run: `cd packages/agent && bun test`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add packages/agent/src/gemini-sessions.ts packages/agent/src/gemini-sessions.test.ts packages/agent/src/index.ts
git commit -m "feat(agent): poll gemini session files for session ID tracking"
```

---

### Task 5: Update web UI — StartSessionModal and Sidebar

**Files:**
- Modify: `packages/web/src/components/StartSessionModal.tsx`
- Modify: `packages/web/src/components/StartSessionModal.test.tsx`
- Modify: `packages/web/src/components/Sidebar.tsx`
- Modify: `packages/web/src/components/Sidebar.test.tsx`

**Step 1: Add Gemini pill to StartSessionModal**

In `packages/web/src/components/StartSessionModal.tsx`:

1. Line 38: Update the resume flag computation to handle gemini (which uses `--resume` like claude):
```typescript
  const flagOptions = [
    { flag: selectedTool === "codex" ? "resume" : "--resume", color: "var(--accent)" },
    ...CLI_TOOLS[selectedTool].flags,
  ];
```
(This is equivalent to the current code but clearer for 3 tools — codex is the only one with a different resume syntax.)

2. Line 408: Change `{(["claude", "codex"] as const).map((tool) => {` to `{(["claude", "codex", "gemini"] as const).map((tool) => {`

**Step 2: Update StartSessionModal tests**

In `packages/web/src/components/StartSessionModal.test.tsx`:

1. Update the "shows tool selector" test (line 139-151) to include Gemini:
```typescript
it("shows tool selector with Claude, Codex, and Gemini", async () => {
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
  expect(screen.getByText("Gemini")).toBeInTheDocument();
});
```

2. Add a test for Gemini's `--yolo` flag:
```typescript
it("shows --yolo flag when Gemini is selected", async () => {
  render(
    <StartSessionModal
      machineId="m1"
      machineName="m1"
      onStart={vi.fn()}
      onClose={vi.fn()}
      listDirectory={mockListDir}
    />,
  );
  fireEvent.click(screen.getByText("Gemini"));
  expect(screen.getByText("--yolo")).toBeInTheDocument();
  expect(screen.queryByText("--dangerously-skip-permissions")).not.toBeInTheDocument();
  expect(screen.queryByText("--full-auto")).not.toBeInTheDocument();
});
```

3. Add a test that passes `"gemini"` to onStart:
```typescript
it("passes gemini cliTool to onStart", async () => {
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
  fireEvent.click(screen.getByText("Gemini"));
  fireEvent.click(screen.getByText("Start"));
  expect(onStart).toHaveBeenCalledWith("m1", undefined, "~", undefined, "gemini");
});
```

**Step 3: Add (gemini) label to Sidebar**

In `packages/web/src/components/Sidebar.tsx`:

1. After the `(codex)` label block (lines 281-285), add:
```tsx
{session.cliTool === "gemini" && (
  <span style={{ color: "var(--text-muted)", marginLeft: 4 }}>
    (gemini)
  </span>
)}
```

2. Line 339: Update the reload tooltip to handle gemini. Change:
```typescript
title={`Reload session (${session.cliTool === "codex" ? "codex resume" : "claude --resume"})`}
```
to:
```typescript
title={`Reload session (${session.cliTool === "codex" ? "codex resume" : `${session.cliTool ?? "claude"} --resume`})`}
```

3. Line 13: Update `onStartSession` prop type. Change `cliTool?: "claude" | "codex"` to `cliTool?: CliTool`. Add `CliTool` to the import from `@blkcat/shared` on line 2.

**Step 4: Add Gemini Sidebar test**

In `packages/web/src/components/Sidebar.test.tsx`, add a test after the codex label test (after line 117):

```typescript
it("shows (gemini) label for gemini sessions", () => {
  const geminiMachines: MachineSnapshot[] = [
    {
      machineId: "m1",
      sessions: [
        { id: "s1", name: "dev", target: "local", cliTool: "gemini" },
      ],
      lastSeen: Date.now(),
    },
  ];
  render(<Sidebar machines={geminiMachines} onSelectSession={() => {}} />);
  expect(screen.getByText("(gemini)")).toBeInTheDocument();
});
```

**Step 5: Run tests**

Run: `cd packages/web && bunx vitest run`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add packages/web/src/components/StartSessionModal.tsx packages/web/src/components/StartSessionModal.test.tsx packages/web/src/components/Sidebar.tsx packages/web/src/components/Sidebar.test.tsx
git commit -m "feat(web): add Gemini to tool selector, sidebar label, and reload tooltip"
```

---

### Task 6: Update useSocket hook type annotation

**Files:**
- Modify: `packages/web/src/hooks/useSocket.ts`

**Step 1: Update the startSession type**

In `packages/web/src/hooks/useSocket.ts`:

1. Add `CliTool` to the import from `@blkcat/shared` (search for existing `@blkcat/shared` import)
2. Line 71: Change `cliTool?: "claude" | "codex"` to `cliTool?: CliTool`
3. Line 414: Change `cliTool?: "claude" | "codex"` to `cliTool?: CliTool`

**Step 2: Run tests**

Run: `cd packages/web && bunx vitest run`
Expected: All tests still pass.

**Step 3: Commit**

```bash
git add packages/web/src/hooks/useSocket.ts
git commit -m "feat(web): update useSocket startSession type for gemini"
```

---

### Task 7: Update README documentation

**Files:**
- Modify: `README.md`

**Step 1: Update README**

Find and update all references to "Claude Code and Codex CLI" to include Gemini:

1. Opening description: "Claude Code and Codex CLI" → "Claude Code, Codex CLI, and Gemini CLI"
2. Auto-discovery line: "Claude Code or Codex CLI" → "Claude Code, Codex CLI, or Gemini CLI"
3. Usage description: "Claude Code or Codex session" → "Claude Code, Codex, or Gemini session"
4. Session management bullet: Update the flags description to include `--yolo` for Gemini. Update "CLI tool (Claude or Codex)" to "CLI tool (Claude, Codex, or Gemini)".
5. Codex CLI support bullet: Rename to "Multi-CLI support" or expand to mention Gemini. Add that Gemini sessions are labeled `(gemini)` and session IDs are polled from `~/.gemini/tmp/`.
6. Package description: "Claude/Codex session discovery" → "Claude/Codex/Gemini session discovery"
7. Auto target description: `"claude" or "codex"` → `"claude"`, `"codex"`, or `"gemini"`
8. Reload session description: "Claude or Codex" → "Claude, Codex, or Gemini"

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document Gemini CLI support"
```

---

### Task 8: Full verification

**Step 1: Run all backend tests**

Run: `bun test`
Expected: All tests pass.

**Step 2: Run all web tests**

Run: `cd packages/web && bunx vitest run`
Expected: All tests pass.

**Step 3: Run production build**

Run: `cd packages/web && bunx vite build`
Expected: Build succeeds with no errors.

**Step 4: TypeScript check**

Run: `cd packages/web && bunx tsc --noEmit`
Expected: No type errors. (Backend packages use bun's built-in TypeScript so `bun test` already validates types.)
