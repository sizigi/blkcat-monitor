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

  it("shows form on + click and calls onStartSession on submit", () => {
    const onStart = vi.fn();
    render(
      <Sidebar machines={machines} onSelectSession={() => {}} onStartSession={onStart} />,
    );

    fireEvent.click(screen.getByTestId("new-session-m1"));
    expect(screen.getByTestId("new-session-form-m1")).toBeInTheDocument();

    const input = screen.getByTestId("new-session-args-m1");
    fireEvent.change(input, { target: { value: "--model sonnet" } });
    fireEvent.submit(screen.getByTestId("new-session-form-m1"));

    expect(onStart).toHaveBeenCalledWith("m1", "--model sonnet", undefined);
    expect(screen.queryByTestId("new-session-form-m1")).not.toBeInTheDocument();
  });

  it("calls onStartSession with undefined when args empty", () => {
    const onStart = vi.fn();
    render(
      <Sidebar machines={machines} onSelectSession={() => {}} onStartSession={onStart} />,
    );

    fireEvent.click(screen.getByTestId("new-session-m1"));
    fireEvent.submit(screen.getByTestId("new-session-form-m1"));

    expect(onStart).toHaveBeenCalledWith("m1", undefined, undefined);
  });

  it("calls onStartSession with cwd when path provided", () => {
    const onStart = vi.fn();
    render(
      <Sidebar machines={machines} onSelectSession={() => {}} onStartSession={onStart} />,
    );

    fireEvent.click(screen.getByTestId("new-session-m1"));
    const cwdInput = screen.getByTestId("new-session-cwd-m1");
    fireEvent.change(cwdInput, { target: { value: "/home/user/project" } });
    fireEvent.submit(screen.getByTestId("new-session-form-m1"));

    expect(onStart).toHaveBeenCalledWith("m1", undefined, "/home/user/project");
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
});
