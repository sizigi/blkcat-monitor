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
      "tmux capture-pane -p -e -t mysession:0.0": {
        success: true,
        stdout: "line1\nline2\nline3\n",
      },
    });
    const capture = new TmuxCapture(exec);
    const lines = capture.capturePane("mysession:0.0");
    expect(lines).toEqual(["line1", "line2", "line3"]);
  });

  it("captures full scrollback", () => {
    const exec = mockExec({
      "tmux capture-pane -p -e -S - -t mysession:0.0": {
        success: true,
        stdout: "old1\nold2\nline1\nline2\nline3\n",
      },
    });
    const capture = new TmuxCapture(exec);
    const lines = capture.captureScrollback("mysession:0.0");
    expect(lines).toEqual(["old1", "old2", "line1", "line2", "line3"]);
  });

  it("returns empty array on scrollback failure", () => {
    const exec = mockExec({});
    const capture = new TmuxCapture(exec);
    expect(capture.captureScrollback("bad:0.0")).toEqual([]);
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

  it("sends literal text to a session", () => {
    const calls: string[][] = [];
    const exec: ExecFn = (cmd) => { calls.push(cmd); return { success: true, stdout: "" }; };
    const capture = new TmuxCapture(exec);
    capture.sendText("dev:0.0", "hello world");
    expect(calls[0]).toEqual(["tmux", "send-keys", "-l", "-t", "dev:0.0", "hello world"]);
  });

  it("sends a special key to a session", () => {
    const calls: string[][] = [];
    const exec: ExecFn = (cmd) => { calls.push(cmd); return { success: true, stdout: "" }; };
    const capture = new TmuxCapture(exec);
    capture.sendKey("dev:0.0", "Enter");
    expect(calls[0]).toEqual(["tmux", "send-keys", "-t", "dev:0.0", "Enter"]);
  });

  it("starts a new session with args", () => {
    const exec = mockExec({
      "tmux new-window -P -F #{session_name}:#{window_index}.#{pane_index}": {
        success: true,
        stdout: "dev:1.0\n",
      },
      "tmux send-keys -l -t dev:1.0 claude --model sonnet": { success: true, stdout: "" },
      "tmux send-keys -t dev:1.0 Enter": { success: true, stdout: "" },
    });
    const capture = new TmuxCapture(exec);
    const paneId = capture.startSession("--model sonnet");
    expect(paneId).toBe("dev:1.0");
  });

  it("starts a new session with cwd", () => {
    const exec = mockExec({
      "tmux new-window -P -F #{session_name}:#{window_index}.#{pane_index} -c /home/user/project": {
        success: true,
        stdout: "dev:1.0\n",
      },
      "tmux send-keys -l -t dev:1.0 claude --model sonnet": { success: true, stdout: "" },
      "tmux send-keys -t dev:1.0 Enter": { success: true, stdout: "" },
    });
    const capture = new TmuxCapture(exec);
    const paneId = capture.startSession("--model sonnet", "/home/user/project");
    expect(paneId).toBe("dev:1.0");
  });

  it("starts a new session without args", () => {
    const exec = mockExec({
      "tmux new-window -P -F #{session_name}:#{window_index}.#{pane_index}": {
        success: true,
        stdout: "dev:1.0\n",
      },
      "tmux send-keys -l -t dev:1.0 claude": { success: true, stdout: "" },
      "tmux send-keys -t dev:1.0 Enter": { success: true, stdout: "" },
    });
    const capture = new TmuxCapture(exec);
    const paneId = capture.startSession();
    expect(paneId).toBe("dev:1.0");
  });

  it("returns null when startSession fails", () => {
    const exec = mockExec({});
    const capture = new TmuxCapture(exec);
    expect(capture.startSession()).toBeNull();
  });

  it("startSession uses codex command when cliTool is codex", () => {
    const cmds: string[][] = [];
    const exec: ExecFn = (cmd) => {
      cmds.push([...cmd]);
      if (cmd.some(c => c === "new-window")) {
        return { success: true, stdout: "test:0.0\n" };
      }
      return { success: true, stdout: "" };
    };
    const cap = new TmuxCapture(exec);
    cap.startSession("--full-auto", undefined, "codex");
    const sendKeysCmd = cmds.find(c => c.includes("send-keys") && c.includes("-l"));
    expect(sendKeysCmd).toBeDefined();
    expect(sendKeysCmd!.join(" ")).toContain("codex --full-auto");
  });

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
});
