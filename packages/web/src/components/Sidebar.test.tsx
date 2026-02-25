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

  it("shows (codex) label for codex sessions", () => {
    const codexMachines: MachineSnapshot[] = [
      {
        machineId: "m1",
        sessions: [
          { id: "s1", name: "dev", target: "local", cliTool: "codex" },
        ],
        lastSeen: Date.now(),
      },
    ];
    render(<Sidebar machines={codexMachines} onSelectSession={() => {}} />);
    expect(screen.getByText("(codex)")).toBeInTheDocument();
  });

  it("shows (gemini) label for gemini sessions", () => {
    const geminiMachines: MachineSnapshot[] = [
      {
        machineId: "m1",
        sessions: [
          { id: "s1", name: "dev", target: "local", cliTool: "gemini" },
        ],
        lastSeen: Date.now(),
      },
    ];
    render(<Sidebar machines={geminiMachines} onSelectSession={() => {}} />);
    expect(screen.getByText("(gemini)")).toBeInTheDocument();
  });
});
