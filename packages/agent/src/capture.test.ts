import { describe, it, expect } from "bun:test";
import { TmuxCapture, type ExecResult, type ExecFn } from "./capture";

function mockExec(outputs: Record<string, ExecResult>): ExecFn {
  return (cmd: string[]) => {
    const key = cmd.join(" ");
    return outputs[key] ?? { success: false, stdout: "" };
  };
}

describe("TmuxCapture", () => {
  it("captures local pane content", () => {
    const exec = mockExec({
      "tmux capture-pane -p -t mysession:0.0": {
        success: true,
        stdout: "line1\nline2\nline3\n",
      },
    });
    const capture = new TmuxCapture(exec);
    const lines = capture.capturePane("mysession:0.0");
    expect(lines).toEqual(["line1", "line2", "line3"]);
  });

  it("returns empty array on failure", () => {
    const exec = mockExec({});
    const capture = new TmuxCapture(exec);
    expect(capture.capturePane("bad:0.0")).toEqual([]);
  });

  it("lists sessions", () => {
    const exec = mockExec({
      "tmux list-sessions -F #{session_name}": {
        success: true,
        stdout: "dev\nbuild\n",
      },
    });
    const capture = new TmuxCapture(exec);
    expect(capture.listSessions()).toEqual(["dev", "build"]);
  });

  it("sends keys to a session", () => {
    const calls: string[][] = [];
    const exec: ExecFn = (cmd) => { calls.push(cmd); return { success: true, stdout: "" }; };
    const capture = new TmuxCapture(exec);
    capture.sendKeys("dev:0.0", "hello world");
    expect(calls[0]).toEqual(["tmux", "send-keys", "-t", "dev:0.0", "hello world", ""]);
  });
});
