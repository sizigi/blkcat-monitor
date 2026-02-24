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
            "dev:0.0\tdev\tclaude\t1000",
            "dev:1.0\tdev\tvim\t1001",
            "build:0.0\tbuild\tnpm\t1002",
            "web:0.0\tweb\tclaude\t1003",
            "codex:0.0\tcodex\tcodex\t1004",
            "gemini:0.0\tgemini\tgemini\t1005",
          ].join("\n") + "\n",
        };
      }
      return { success: false, stdout: "" };
    };

    const sessions = discoverCliSessions(exec);
    expect(sessions).toHaveLength(4);
    expect(sessions[0]).toEqual({ id: "dev:0.0", name: "dev", target: "local", cliTool: "claude" });
    expect(sessions[1]).toEqual({ id: "web:0.0", name: "web", target: "local", cliTool: "claude" });
    expect(sessions[2]).toEqual({ id: "codex:0.0", name: "codex", target: "local", cliTool: "codex" });
    expect(sessions[3]).toEqual({ id: "gemini:0.0", name: "gemini", target: "local", cliTool: "gemini" });
  });

  it("detects node-based CLI tools via child process inspection", () => {
    const exec: ExecFn = (cmd) => {
      const joined = cmd.join(" ");
      if (joined.includes("list-panes")) {
        return {
          success: true,
          stdout: [
            "dev:0.0\tdev\tclaude\t1000",
            "work:0.0\twork\tnode\t2000",
            "ai:0.0\tai\tnode\t3000",
            "other:0.0\tother\tnode\t4000",
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
    expect(sessions[0]).toEqual({ id: "dev:0.0", name: "dev", target: "local", cliTool: "claude" });
    expect(sessions[1]).toEqual({ id: "work:0.0", name: "work", target: "local", cliTool: "codex" });
    expect(sessions[2]).toEqual({ id: "ai:0.0", name: "ai", target: "local", cliTool: "gemini" });
  });

  it("returns empty array when list-panes fails", () => {
    const exec: ExecFn = () => ({ success: false, stdout: "" });
    expect(discoverCliSessions(exec)).toEqual([]);
  });
});
