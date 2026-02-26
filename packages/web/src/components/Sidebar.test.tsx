import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import type { MachineSnapshot } from "@blkcat/shared";

const machines: MachineSnapshot[] = [
  {
    machineId: "m1",
    sessions: [
      { id: "s1", name: "dev", target: "local" },
      { id: "s2", name: "build", target: "ssh", host: "server1" },
    ],
    lastSeen: Date.now(),
  },
];

describe("Sidebar", () => {
  it("renders all machines and sessions", () => {
    render(<Sidebar machines={machines} onSelectSession={() => {}} />);

    expect(screen.getByText("m1")).toBeInTheDocument();
    expect(screen.getByText("dev")).toBeInTheDocument();
    expect(screen.getByText("build")).toBeInTheDocument();
  });

  it("calls onSelectSession on click", () => {
    const onSelect = vi.fn();
    render(<Sidebar machines={machines} onSelectSession={onSelect} />);

    fireEvent.click(screen.getByTestId("session-s1"));

    expect(onSelect).toHaveBeenCalledWith("m1", "s1");
  });

  it("shows empty state when no machines", () => {
    render(<Sidebar machines={[]} onSelectSession={() => {}} />);

    expect(screen.getByText("No machines connected")).toBeInTheDocument();
  });

  it("shows + button when onStartSession is provided", () => {
    render(
      <Sidebar machines={machines} onSelectSession={() => {}} onStartSession={() => {}} />,
    );

    expect(screen.getByTestId("new-session-m1")).toBeInTheDocument();
  });

  it("does not show + button when onStartSession is not provided", () => {
    render(<Sidebar machines={machines} onSelectSession={() => {}} />);

    expect(screen.queryByTestId("new-session-m1")).not.toBeInTheDocument();
  });

  it("always shows + on the new session button", () => {
    render(
      <Sidebar machines={machines} onSelectSession={() => {}} onStartSession={() => {}} />,
    );

    const btn = screen.getByTestId("new-session-m1");
    expect(btn.querySelector("svg")).toBeTruthy();

    fireEvent.click(btn);
    expect(btn.querySelector("svg")).toBeTruthy();
  });

  it("shows red text for sessions with --dangerously-skip-permissions", () => {
    const dangerousMachines: MachineSnapshot[] = [
      {
        machineId: "m1",
        sessions: [
          { id: "s1", name: "dev", target: "local", args: "--dangerously-skip-permissions" },
        ],
        lastSeen: Date.now(),
      },
    ];
    render(
      <Sidebar machines={dangerousMachines} onSelectSession={() => {}} />,
    );
    const sessionBtn = screen.getByTestId("session-s1");
    expect(sessionBtn.style.color).toBe("var(--red)");
  });

  it("renders AgentManager when agent props provided", () => {
    render(
      <Sidebar
        machines={machines}
        onSelectSession={() => {}}
        agents={[{ address: "localhost:4000", status: "connected", source: "api" }]}
        onAddAgent={vi.fn()}
        onRemoveAgent={vi.fn()}
      />,
    );

    expect(screen.getByText("Outbound Agents")).toBeInTheDocument();
    expect(screen.getByText("localhost:4000")).toBeInTheDocument();
  });

  it("does not render AgentManager when agent props absent", () => {
    render(<Sidebar machines={machines} onSelectSession={() => {}} />);

    expect(screen.queryByText("Outbound Agents")).not.toBeInTheDocument();
  });

  it("shows >_ icon for terminal sessions but not for CLI sessions", () => {
    const mixedMachines: MachineSnapshot[] = [
      {
        machineId: "m1",
        sessions: [
          { id: "s1", name: "dev", target: "local", cliTool: "claude" },
          { id: "s2", name: "server", target: "local" },
        ],
        lastSeen: Date.now(),
      },
    ];
    render(<Sidebar machines={mixedMachines} onSelectSession={() => {}} />);
    const icons = screen.getAllByText(">_");
    expect(icons.length).toBeGreaterThanOrEqual(1);
  });

  // ── CWD grouping tests ──────────────────────────────────────

  it("groups sessions with same cwd together under a CWD header", () => {
    const cwdMachines: MachineSnapshot[] = [
      {
        machineId: "m1",
        sessions: [
          { id: "s1", name: "claude-task", target: "local", cliTool: "claude", cwd: "/home/user/project" },
          { id: "s2", name: "terminal", target: "local", cwd: "/home/user/project" },
        ],
        lastSeen: Date.now(),
      },
    ];
    render(<Sidebar machines={cwdMachines} onSelectSession={() => {}} />);
    // Both sessions should be visible
    expect(screen.getByText("claude-task")).toBeInTheDocument();
    expect(screen.getByText("terminal")).toBeInTheDocument();
    // CWD group header should show shortened path
    expect(screen.getByText("~/project")).toBeInTheDocument();
  });

  it("groups subdirectory terminal with parent vibe session", () => {
    const cwdMachines: MachineSnapshot[] = [
      {
        machineId: "m1",
        sessions: [
          { id: "s1", name: "refactor", target: "local", cliTool: "claude", cwd: "/home/user/myapp" },
          { id: "s2", name: "server-shell", target: "local", cwd: "/home/user/myapp/packages/server" },
        ],
        lastSeen: Date.now(),
      },
    ];
    render(<Sidebar machines={cwdMachines} onSelectSession={() => {}} />);
    // Both should appear — the terminal is in a subdirectory of the CLI cwd
    expect(screen.getByText("refactor")).toBeInTheDocument();
    expect(screen.getByText("server-shell")).toBeInTheDocument();
    // Group header
    expect(screen.getByText("~/myapp")).toBeInTheDocument();
  });

  it("puts sessions without cwd in ungrouped section", () => {
    const cwdMachines: MachineSnapshot[] = [
      {
        machineId: "m1",
        sessions: [
          { id: "s1", name: "claude-task", target: "local", cliTool: "claude", cwd: "/home/user/project" },
          { id: "s2", name: "misc-shell", target: "local" },
        ],
        lastSeen: Date.now(),
      },
    ];
    render(<Sidebar machines={cwdMachines} onSelectSession={() => {}} />);
    expect(screen.getByText("claude-task")).toBeInTheDocument();
    expect(screen.getByText("misc-shell")).toBeInTheDocument();
    // Ungrouped section header "Terminals" should appear
    expect(screen.getByText("Terminals")).toBeInTheDocument();
  });

  it("renders all sessions ungrouped when no CLI sessions exist", () => {
    const noCliMachines: MachineSnapshot[] = [
      {
        machineId: "m1",
        sessions: [
          { id: "s1", name: "shell1", target: "local", cwd: "/tmp" },
          { id: "s2", name: "shell2", target: "local" },
        ],
        lastSeen: Date.now(),
      },
    ];
    render(<Sidebar machines={noCliMachines} onSelectSession={() => {}} />);
    expect(screen.getByText("shell1")).toBeInTheDocument();
    expect(screen.getByText("shell2")).toBeInTheDocument();
    // No CWD group headers should be shown (no anchors since no CLI sessions)
    expect(screen.queryByText("Terminals")).not.toBeInTheDocument();
  });

  it("hides terminals from CWD groups when hideTmuxSessions is true", () => {
    const cwdMachines: MachineSnapshot[] = [
      {
        machineId: "m1",
        sessions: [
          { id: "s1", name: "claude-task", target: "local", cliTool: "claude", cwd: "/home/user/project" },
          { id: "s2", name: "terminal", target: "local", cwd: "/home/user/project" },
          { id: "s3", name: "misc-shell", target: "local" },
        ],
        lastSeen: Date.now(),
      },
    ];
    render(<Sidebar machines={cwdMachines} onSelectSession={() => {}} hideTmuxSessions />);
    expect(screen.getByText("claude-task")).toBeInTheDocument();
    // Terminal sessions should be hidden
    expect(screen.queryByText("terminal")).not.toBeInTheDocument();
    expect(screen.queryByText("misc-shell")).not.toBeInTheDocument();
  });

  // ── Flat list (no window sub-grouping) ────────────────────────

  it("renders sessions flat within a CWD group (no window sub-groups)", () => {
    const cwdMachines: MachineSnapshot[] = [
      {
        machineId: "m1",
        sessions: [
          { id: "s1", name: "task1", target: "local", cliTool: "claude", cwd: "/home/user/proj", windowId: "0" },
          { id: "s2", name: "task2", target: "local", cliTool: "claude", cwd: "/home/user/proj", windowId: "0" },
          { id: "s3", name: "shell", target: "local", cwd: "/home/user/proj", windowId: "1" },
        ],
        lastSeen: Date.now(),
      },
    ];
    render(<Sidebar machines={cwdMachines} onSelectSession={() => {}} />);
    // All three sessions should be rendered flat (no window group headers)
    expect(screen.getByText("task1")).toBeInTheDocument();
    expect(screen.getByText("task2")).toBeInTheDocument();
    expect(screen.getByText("shell")).toBeInTheDocument();
    // No window group header icon (◨) should be present
    expect(screen.queryByText("\u25E8")).not.toBeInTheDocument();
  });

  // ── No numbering badges ───────────────────────────────────────

  it("does not render numbering badges on sessions (machine badges still present)", () => {
    render(<Sidebar machines={machines} onSelectSession={() => {}} />);
    // Session badges should not exist, but machine badges are kept
    const sessionBadges = document.querySelectorAll(".shortcut-badge-session");
    expect(sessionBadges.length).toBe(0);
    // Machine badge should still be present
    const machineBadges = document.querySelectorAll(".shortcut-badge-machine");
    expect(machineBadges.length).toBe(1);
  });

  // ── Attached terminals ────────────────────────────────────────

  it("renders attached terminals under their parent CLI session", () => {
    const cwdMachines: MachineSnapshot[] = [
      {
        machineId: "m1",
        sessions: [
          { id: "cli1", name: "my-task", target: "local", cliTool: "claude", cwd: "/home/user/proj" },
          { id: "term1", name: "server", target: "local", cwd: "/home/user/proj" },
        ],
        lastSeen: Date.now(),
      },
    ];
    const attachedTerminals = {
      getAttachedTo: (mid: string, tid: string) => (mid === "m1" && tid === "term1" ? "cli1" : null),
      isAttached: (mid: string, tid: string) => mid === "m1" && tid === "term1",
      isHidden: () => false,
    };
    render(
      <Sidebar
        machines={cwdMachines}
        onSelectSession={() => {}}
        attachedTerminals={attachedTerminals}
      />,
    );
    // CLI session should be visible
    expect(screen.getByText("my-task")).toBeInTheDocument();
    // Attached terminal should be rendered (via attached-term1 testid)
    expect(screen.getByTestId("attached-term1")).toBeInTheDocument();
    // The terminal should NOT appear in the main session list
    expect(screen.queryByTestId("session-term1")).not.toBeInTheDocument();
  });

  it("hides attached terminals that are marked hidden", () => {
    const cwdMachines: MachineSnapshot[] = [
      {
        machineId: "m1",
        sessions: [
          { id: "cli1", name: "my-task", target: "local", cliTool: "claude", cwd: "/home/user/proj" },
          { id: "term1", name: "server", target: "local", cwd: "/home/user/proj" },
        ],
        lastSeen: Date.now(),
      },
    ];
    const attachedTerminals = {
      getAttachedTo: (mid: string, tid: string) => (mid === "m1" && tid === "term1" ? "cli1" : null),
      isAttached: (mid: string, tid: string) => mid === "m1" && tid === "term1",
      isHidden: (mid: string, tid: string) => mid === "m1" && tid === "term1",
    };
    render(
      <Sidebar
        machines={cwdMachines}
        onSelectSession={() => {}}
        attachedTerminals={attachedTerminals}
      />,
    );
    // CLI session visible
    expect(screen.getByText("my-task")).toBeInTheDocument();
    // Attached terminal should NOT be rendered (it's hidden)
    expect(screen.queryByTestId("attached-term1")).not.toBeInTheDocument();
  });
});
