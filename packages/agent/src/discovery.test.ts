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
            "dev:0.0\tdev\tclaude\t1000\t%0\tclaude",
            "dev:1.0\tdev\tvim\t1001\t%1\tvim",
            "build:0.0\tbuild\tnpm\t1002\t%2\tnpm",
            "web:0.0\tweb\tclaude\t1003\t%3\tclaude",
            "codex:0.0\tcodex\tcodex\t1004\t%4\tcodex",
            "gemini:0.0\tgemini\tgemini\t1005\t%5\tgemini",
          ].join("\n") + "\n",
        };
      }
      return { success: false, stdout: "" };
    };

    const sessions = discoverCliSessions(exec);
    expect(sessions).toHaveLength(4);
    expect(sessions[0]).toEqual({ id: "dev:0.0", name: "dev", target: "local", cliTool: "claude", windowId: "dev:0", windowName: "claude" });
    expect(sessions[1]).toEqual({ id: "web:0.0", name: "web", target: "local", cliTool: "claude", windowId: "web:0", windowName: "claude" });
    expect(sessions[2]).toEqual({ id: "codex:0.0", name: "codex", target: "local", cliTool: "codex", windowId: "codex:0", windowName: "codex" });
    expect(sessions[3]).toEqual({ id: "gemini:0.0", name: "gemini", target: "local", cliTool: "gemini", windowId: "gemini:0", windowName: "gemini" });
  });

  it("detects node-based CLI tools via child process inspection", () => {
    const exec: ExecFn = (cmd) => {
      const joined = cmd.join(" ");
      if (joined.includes("list-panes")) {
        return {
          success: true,
          stdout: [
            "dev:0.0\tdev\tclaude\t1000\t%0\tclaude",
            "work:0.0\twork\tnode\t2000\t%1\tnode",
            "ai:0.0\tai\tnode\t3000\t%2\tnode",
            "other:0.0\tother\tnode\t4000\t%3\tnode",
          ].join("\n") + "\n",
        };
      }
      // ps --ppid calls for node panes
      if (joined.includes("--ppid 2000")) {
        return { success: true, stdout: "node /home/user/.local/bin/codex --full-auto\n" };
      }
      if (joined.includes("--ppid 3000")) {
        return { success: true, stdout: "node /run/user/1005/fnm_multishells/123/bin/gemini\n" };
      }
      if (joined.includes("--ppid 4000")) {
        return { success: true, stdout: "node /usr/lib/some-other-app/server.js\n" };
      }
      return { success: false, stdout: "" };
    };

    const sessions = discoverCliSessions(exec);
    expect(sessions).toHaveLength(3);
    expect(sessions[0]).toEqual({ id: "dev:0.0", name: "dev", target: "local", cliTool: "claude", windowId: "dev:0", windowName: "claude" });
    expect(sessions[1]).toEqual({ id: "work:0.0", name: "work", target: "local", cliTool: "codex", windowId: "work:0", windowName: "node" });
    expect(sessions[2]).toEqual({ id: "ai:0.0", name: "ai", target: "local", cliTool: "gemini", windowId: "ai:0", windowName: "node" });
  });

  it("deduplicates grouped tmux sessions sharing the same physical pane", () => {
    const exec: ExecFn = (cmd) => {
      const joined = cmd.join(" ");
      if (joined.includes("list-panes")) {
        return {
          success: true,
          stdout: [
            "1:2.0\t1\tclaude\t5000\t%5\tclaude",
            "1-2:2.0\t1-2\tclaude\t5000\t%5\tclaude",
          ].join("\n") + "\n",
        };
      }
      return { success: false, stdout: "" };
    };

    const sessions = discoverCliSessions(exec);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toEqual({ id: "1:2.0", name: "1", target: "local", cliTool: "claude", windowId: "1:2", windowName: "claude" });
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
            "dev:0.0\tdev\tclaude\t1000\t%0\tclaude",
            "dev:1.0\tdev\tvim\t1001\t%1\tvim",
            "build:0.0\tbuild\tbash\t1002\t%2\tbash",
            "web:0.0\tweb\tclaude\t1003\t%3\tclaude",
          ].join("\n") + "\n",
        };
      }
      return { success: false, stdout: "" };
    };

    const sessions = discoverAllSessions(exec);
    expect(sessions).toHaveLength(4);
    expect(sessions[0]).toEqual({ id: "dev:0.0", name: "dev", target: "local", cliTool: "claude", windowId: "dev:0", windowName: "claude" });
    expect(sessions[1]).toEqual({ id: "dev:1.0", name: "dev", target: "local", windowId: "dev:1", windowName: "vim" });
    expect(sessions[2]).toEqual({ id: "build:0.0", name: "build", target: "local", windowId: "build:0", windowName: "bash" });
    expect(sessions[3]).toEqual({ id: "web:0.0", name: "web", target: "local", cliTool: "claude", windowId: "web:0", windowName: "claude" });
  });

  it("groups panes in the same window by windowId", () => {
    const exec: ExecFn = (cmd) => {
      const joined = cmd.join(" ");
      if (joined.includes("list-panes")) {
        return {
          success: true,
          stdout: [
            "dev:0.0\tdev\tbash\t1000\t%0\twork",
            "dev:0.1\tdev\tvim\t1001\t%1\twork",
            "dev:1.0\tdev\tclaude\t1002\t%2\tclaude",
          ].join("\n") + "\n",
        };
      }
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
            "1:0.0\t1\tbash\t1000\t%0\tbash",
            "1-2:0.0\t1-2\tbash\t1000\t%0\tbash",
            "1:1.0\t1\tclaude\t2000\t%1\tclaude",
          ].join("\n") + "\n",
        };
      }
      return { success: false, stdout: "" };
    };

    const sessions = discoverAllSessions(exec);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toEqual({ id: "1:0.0", name: "1", target: "local", windowId: "1:0", windowName: "bash" });
    expect(sessions[1]).toEqual({ id: "1:1.0", name: "1", target: "local", cliTool: "claude", windowId: "1:1", windowName: "claude" });
  });

  it("returns empty array when list-panes fails", () => {
    const exec: ExecFn = () => ({ success: false, stdout: "" });
    expect(discoverAllSessions(exec)).toEqual([]);
  });
});
