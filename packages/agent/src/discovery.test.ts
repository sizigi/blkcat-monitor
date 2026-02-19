import { describe, it, expect } from "bun:test";
import { discoverClaudeSessions } from "./discovery";
import type { ExecFn } from "./capture";

describe("discoverClaudeSessions", () => {
  it("finds sessions with claude in the pane content", () => {
    const exec: ExecFn = (cmd) => {
      const joined = cmd.join(" ");
      if (joined.includes("list-sessions")) {
        return { success: true, stdout: "dev\nbuild\nweb\n" };
      }
      if (joined.includes("list-panes") && joined.includes("dev")) {
        return { success: true, stdout: "dev:0.0\n" };
      }
      if (joined.includes("list-panes") && joined.includes("build")) {
        return { success: true, stdout: "build:0.0\n" };
      }
      if (joined.includes("list-panes") && joined.includes("web")) {
        return { success: true, stdout: "web:0.0\n" };
      }
      if (joined.includes("capture-pane") && joined.includes("dev:0.0")) {
        return { success: true, stdout: "$ claude\nclaude> working on it\n" };
      }
      if (joined.includes("capture-pane") && joined.includes("build:0.0")) {
        return { success: true, stdout: "$ npm run build\n" };
      }
      if (joined.includes("capture-pane") && joined.includes("web:0.0")) {
        return { success: true, stdout: "$ claude code\nclaude> done\n" };
      }
      return { success: false, stdout: "" };
    };

    const sessions = discoverClaudeSessions(exec);
    expect(sessions.map((s) => s.name)).toEqual(["dev", "web"]);
  });
});
