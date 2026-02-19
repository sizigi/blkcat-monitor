import { describe, it, expect } from "bun:test";
import { discoverClaudeSessions } from "./discovery";
import type { ExecFn } from "./capture";

describe("discoverClaudeSessions", () => {
  it("finds panes where pane_current_command is claude", () => {
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
          ].join("\n") + "\n",
        };
      }
      return { success: false, stdout: "" };
    };

    const sessions = discoverClaudeSessions(exec);
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toEqual({ id: "dev:0.0", name: "dev", target: "local" });
    expect(sessions[1]).toEqual({ id: "web:0.0", name: "web", target: "local" });
  });

  it("returns empty array when list-panes fails", () => {
    const exec: ExecFn = () => ({ success: false, stdout: "" });
    expect(discoverClaudeSessions(exec)).toEqual([]);
  });
});
