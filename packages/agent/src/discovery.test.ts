import { describe, it, expect } from "bun:test";
import { discoverCliSessions, discoverAllSessions } from "./discovery";
import type { ExecFn } from "./capture";

describe("discoverCliSessions", () => {
  it("finds panes running claude, codex, or gemini by command name", () => {
    const exec: ExecFn = (cmd) => {
      const joined = cmd.join(" ");
      if (joined.includes("list-panes")) {
        return {
          success: true,
          stdout: [
            "dev:0.0\tdev\tclaude\t1000\t%0\tclaude\t/home/user",
            "dev:1.0\tdev\tvim\t1001\t%1\tvim\t/home/user",
            "build:0.0\tbuild\tnpm\t1002\t%2\tnpm\t/home/user",
            "web:0.0\tweb\tclaude\t1003\t%3\tclaude\t/home/user",
            "codex:0.0\tcodex\tcodex\t1004\t%4\tcodex\t/home/user",
            "gemini:0.0\tgemini\tgemini\t1005\t%5\tgemini\t/home/user",
          ].join("\n") + "\n",
        };
      }
      // ps calls for resolveCliArgs — no notable flags
      if (joined.includes("ps")) return { success: true, stdout: "claude\n" };
      return { success: false, stdout: "" };
    };

    const sessions = discoverCliSessions(exec);
    expect(sessions).toHaveLength(4);
    expect(sessions[0]).toMatchObject({ id: "dev:0.0", name: "dev", target: "local", cliTool: "claude", windowId: "dev:0", windowName: "claude", paneCommand: "claude" });
    expect(sessions[1]).toMatchObject({ id: "web:0.0", name: "web", target: "local", cliTool: "claude", windowId: "web:0", windowName: "claude", paneCommand: "claude" });
    expect(sessions[2]).toMatchObject({ id: "codex:0.0", name: "codex", target: "local", cliTool: "codex", windowId: "codex:0", windowName: "codex", paneCommand: "codex" });
    expect(sessions[3]).toMatchObject({ id: "gemini:0.0", name: "gemini", target: "local", cliTool: "gemini", windowId: "gemini:0", windowName: "gemini", paneCommand: "gemini" });
  });

  it("detects node-based CLI tools via child process inspection", () => {
    const exec: ExecFn = (cmd) => {
      const joined = cmd.join(" ");
      if (joined.includes("list-panes")) {
        return {
          success: true,
          stdout: [
            "dev:0.0\tdev\tclaude\t1000\t%0\tclaude\t/home/user",
            "work:0.0\twork\tnode\t2000\t%1\tnode\t/home/user",
            "ai:0.0\tai\tnode\t3000\t%2\tnode\t/home/user",
            "other:0.0\tother\tnode\t4000\t%3\tnode\t/home/user",
          ].join("\n") + "\n",
        };
      }
      // ps -p for direct process check (claude pane)
      if (joined.includes("-p 1000")) {
        return { success: true, stdout: "claude --dangerously-skip-permissions\n" };
      }
      // ps --ppid calls for node panes and claude pane children
      if (joined.includes("--ppid 1000")) {
        return { success: true, stdout: "npm exec @playwright/mcp@latest\n" };
      }
      if (joined.includes("--ppid 2000")) {
        return { success: true, stdout: "node /home/user/.local/bin/codex --full-auto\n" };
      }
      if (joined.includes("--ppid 3000")) {
        return { success: true, stdout: "node /run/user/1005/fnm_multishells/123/bin/gemini\n" };
      }
      if (joined.includes("--ppid 4000")) {
        return { success: true, stdout: "node /usr/lib/some-other-app/server.js\n" };
      }
      // ps -p for node panes (pane process is "node", not the CLI)
      if (joined.includes("-p 2000") || joined.includes("-p 3000") || joined.includes("-p 4000")) {
        return { success: true, stdout: "node\n" };
      }
      return { success: false, stdout: "" };
    };

    const sessions = discoverCliSessions(exec);
    expect(sessions).toHaveLength(3);
    expect(sessions[0]).toMatchObject({ id: "dev:0.0", name: "dev", target: "local", args: "--dangerously-skip-permissions", cliTool: "claude" });
    expect(sessions[1]).toMatchObject({ id: "work:0.0", name: "work", target: "local", args: "--full-auto", cliTool: "codex" });
    expect(sessions[2]).toMatchObject({ id: "ai:0.0", name: "ai", target: "local", cliTool: "gemini" });
  });

  it("deduplicates grouped tmux sessions sharing the same physical pane", () => {
    const exec: ExecFn = (cmd) => {
      const joined = cmd.join(" ");
      if (joined.includes("list-panes")) {
        return {
          success: true,
          stdout: [
            "1:2.0\t1\tclaude\t5000\t%5\tclaude\t/home/user",
            "1-2:2.0\t1-2\tclaude\t5000\t%5\tclaude\t/home/user",
          ].join("\n") + "\n",
        };
      }
      if (joined.includes("ps")) return { success: true, stdout: "claude\n" };
      return { success: false, stdout: "" };
    };

    const sessions = discoverCliSessions(exec);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ id: "1:2.0", name: "1", target: "local", cliTool: "claude", windowId: "1:2", windowName: "claude", paneCommand: "claude" });
  });

  it("excludeIds pre-seeds dedup so manual sessions aren't duplicated by grouped aliases", () => {
    const exec: ExecFn = (cmd) => {
      const joined = cmd.join(" ");
      if (joined.includes("list-panes")) {
        // Session "1-9:8.0" was manually started via dashboard.
        // Auto-discovery sees the same physical pane (%23) under "1:8.0".
        return {
          success: true,
          stdout: [
            "1:3.0\t1\tclaude\t100\t%10\tclaude\t/home/user",
            "1:8.0\t1\tclaude\t200\t%23\tclaude\t/home/user",
            "1-9:8.0\t1-9\tclaude\t200\t%23\tclaude\t/home/user",
          ].join("\n") + "\n",
        };
      }
      if (joined.includes("ps")) return { success: true, stdout: "claude\n" };
      return { success: false, stdout: "" };
    };

    // Without excludeIds: dedup keeps "1:8.0" (first seen), skips "1-9:8.0"
    const withoutExclude = discoverCliSessions(exec);
    expect(withoutExclude).toHaveLength(2);
    expect(withoutExclude.map(s => s.id)).toEqual(["1:3.0", "1:8.0"]);

    // With excludeIds: "1-9:8.0" is manual, so its pane %23 is pre-seeded.
    // Auto-discovery skips "1:8.0" (same pane) — no duplicate.
    const withExclude = discoverCliSessions(exec, new Set(["1-9:8.0"]));
    expect(withExclude).toHaveLength(1);
    expect(withExclude[0].id).toBe("1:3.0");
  });

  it("returns empty array when list-panes fails", () => {
    const exec: ExecFn = () => ({ success: false, stdout: "" });
    expect(discoverCliSessions(exec)).toEqual([]);
  });
});

describe("discoverAllSessions", () => {
  it("returns all panes including non-CLI ones with windowId", () => {
    const exec: ExecFn = (cmd) => {
      const joined = cmd.join(" ");
      if (joined.includes("list-panes")) {
        return {
          success: true,
          stdout: [
            "dev:0.0\tdev\tclaude\t1000\t%0\tclaude\t/home/user",
            "dev:1.0\tdev\tvim\t1001\t%1\tvim\t/home/user",
            "build:0.0\tbuild\tbash\t1002\t%2\tbash\t/home/user",
            "web:0.0\tweb\tclaude\t1003\t%3\tclaude\t/home/user",
          ].join("\n") + "\n",
        };
      }
      // ps calls for CLI arg resolution
      if (joined.includes("ps")) return { success: true, stdout: "claude\n" };
      return { success: false, stdout: "" };
    };

    const sessions = discoverAllSessions(exec);
    expect(sessions).toHaveLength(4);
    expect(sessions[0]).toMatchObject({ id: "dev:0.0", name: "dev", target: "local", cliTool: "claude", windowId: "dev:0", windowName: "claude", paneCommand: "claude" });
    expect(sessions[1]).toMatchObject({ id: "dev:1.0", name: "dev", target: "local", windowId: "dev:1", windowName: "vim", paneCommand: "vim" });
    expect(sessions[2]).toMatchObject({ id: "build:0.0", name: "build", target: "local", windowId: "build:0", windowName: "bash", paneCommand: "bash" });
    expect(sessions[3]).toMatchObject({ id: "web:0.0", name: "web", target: "local", cliTool: "claude", windowId: "web:0", windowName: "claude", paneCommand: "claude" });
  });

  it("groups panes in the same window by windowId", () => {
    const exec: ExecFn = (cmd) => {
      const joined = cmd.join(" ");
      if (joined.includes("list-panes")) {
        return {
          success: true,
          stdout: [
            "dev:0.0\tdev\tbash\t1000\t%0\twork\t/home/user",
            "dev:0.1\tdev\tvim\t1001\t%1\twork\t/home/user",
            "dev:1.0\tdev\tclaude\t1002\t%2\tclaude\t/home/user",
          ].join("\n") + "\n",
        };
      }
      if (joined.includes("ps")) return { success: true, stdout: "claude\n" };
      return { success: false, stdout: "" };
    };

    const sessions = discoverAllSessions(exec);
    expect(sessions).toHaveLength(3);
    // Two panes share windowId "dev:0"
    expect(sessions[0].windowId).toBe("dev:0");
    expect(sessions[1].windowId).toBe("dev:0");
    // Third pane in different window
    expect(sessions[2].windowId).toBe("dev:1");
    // All share the same windowName for the same window
    expect(sessions[0].windowName).toBe("work");
    expect(sessions[1].windowName).toBe("work");
  });

  it("deduplicates grouped tmux sessions", () => {
    const exec: ExecFn = (cmd) => {
      const joined = cmd.join(" ");
      if (joined.includes("list-panes")) {
        return {
          success: true,
          stdout: [
            "1:0.0\t1\tbash\t1000\t%0\tbash\t/home/user",
            "1-2:0.0\t1-2\tbash\t1000\t%0\tbash\t/home/user",
            "1:1.0\t1\tclaude\t2000\t%1\tclaude\t/home/user",
          ].join("\n") + "\n",
        };
      }
      if (joined.includes("ps")) return { success: true, stdout: "claude\n" };
      return { success: false, stdout: "" };
    };

    const sessions = discoverAllSessions(exec);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({ id: "1:0.0", name: "1", target: "local", windowId: "1:0", windowName: "bash", paneCommand: "bash" });
    expect(sessions[1]).toMatchObject({ id: "1:1.0", name: "1", target: "local", cliTool: "claude", windowId: "1:1", windowName: "claude", paneCommand: "claude" });
  });

  it("returns empty array when list-panes fails", () => {
    const exec: ExecFn = () => ({ success: false, stdout: "" });
    expect(discoverAllSessions(exec)).toEqual([]);
  });
});
