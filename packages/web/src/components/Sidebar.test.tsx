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
});
