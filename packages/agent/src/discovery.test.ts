import { describe, it, expect } from "bun:test";
import { discoverCliSessions } from "./discovery";
import type { ExecFn } from "./capture";

describe("discoverCliSessions", () => {
  it("finds panes running claude, codex, or gemini by command name", () => {
    const exec: ExecFn = (cmd) => {
      const joined = cmd.join(" ");
      if (joined.includes("list-panes")) {
        return {
          success: true,
          stdout: [
            "dev:0.0\tdev\tclaude\t1000\t%0",
            "dev:1.0\tdev\tvim\t1001\t%1",
            "build:0.0\tbuild\tnpm\t1002\t%2",
            "web:0.0\tweb\tclaude\t1003\t%3",
            "codex:0.0\tcodex\tcodex\t1004\t%4",
            "gemini:0.0\tgemini\tgemini\t1005\t%5",
          ].join("\n") + "\n",
        };
      }
      // ps calls for resolveCliArgs — no notable flags
      if (joined.includes("ps")) return { success: true, stdout: "claude\n" };
      return { success: false, stdout: "" };
    };

    const sessions = discoverCliSessions(exec);
    expect(sessions).toHaveLength(4);
    expect(sessions[0]).toEqual({ id: "dev:0.0", name: "dev", target: "local", args: undefined, cliTool: "claude" });
    expect(sessions[1]).toEqual({ id: "web:0.0", name: "web", target: "local", args: undefined, cliTool: "claude" });
    expect(sessions[2]).toEqual({ id: "codex:0.0", name: "codex", target: "local", args: undefined, cliTool: "codex" });
    expect(sessions[3]).toEqual({ id: "gemini:0.0", name: "gemini", target: "local", args: undefined, cliTool: "gemini" });
  });

  it("detects node-based CLI tools via child process inspection", () => {
    const exec: ExecFn = (cmd) => {
      const joined = cmd.join(" ");
      if (joined.includes("list-panes")) {
        return {
          success: true,
          stdout: [
            "dev:0.0\tdev\tclaude\t1000\t%0",
            "work:0.0\twork\tnode\t2000\t%1",
            "ai:0.0\tai\tnode\t3000\t%2",
            "other:0.0\tother\tnode\t4000\t%3",
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
    expect(sessions[0]).toEqual({ id: "dev:0.0", name: "dev", target: "local", args: "--dangerously-skip-permissions", cliTool: "claude" });
    expect(sessions[1]).toEqual({ id: "work:0.0", name: "work", target: "local", args: "--full-auto", cliTool: "codex" });
    expect(sessions[2]).toEqual({ id: "ai:0.0", name: "ai", target: "local", args: undefined, cliTool: "gemini" });
  });

  it("deduplicates grouped tmux sessions sharing the same physical pane", () => {
    const exec: ExecFn = (cmd) => {
      const joined = cmd.join(" ");
      if (joined.includes("list-panes")) {
        // tmux grouped sessions: session "1" and "1-2" share the same window/pane
        // Both entries have the same #{pane_id} (%5)
        return {
          success: true,
          stdout: [
            "1:2.0\t1\tclaude\t5000\t%5",
            "1-2:2.0\t1-2\tclaude\t5000\t%5",
          ].join("\n") + "\n",
        };
      }
      if (joined.includes("ps")) return { success: true, stdout: "claude\n" };
      return { success: false, stdout: "" };
    };

    const sessions = discoverCliSessions(exec);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual({ id: "1:2.0", name: "1", target: "local", args: undefined, cliTool: "claude" });
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
            "1:3.0\t1\tclaude\t100\t%10",
            "1:8.0\t1\tclaude\t200\t%23",
            "1-9:8.0\t1-9\tclaude\t200\t%23",
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
