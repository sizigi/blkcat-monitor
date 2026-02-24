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
