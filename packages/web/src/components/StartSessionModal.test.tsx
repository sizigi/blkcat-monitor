import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StartSessionModal } from "./StartSessionModal";

const mockListDir = vi.fn().mockResolvedValue({
  path: "/home/user",
  entries: [
    { name: "projects", isDir: true },
    { name: "docs", isDir: true },
    { name: ".bashrc", isDir: false },
  ],
});

describe("StartSessionModal", () => {
  it("renders modal with machine name", () => {
    render(
      <StartSessionModal
        machineId="m1"
        machineName="My Machine"
        onStart={vi.fn()}
        onClose={vi.fn()}
        listDirectory={mockListDir}
      />,
    );
    expect(screen.getByText(/My Machine/)).toBeInTheDocument();
  });

  it("loads directory listing on mount", async () => {
    render(
      <StartSessionModal
        machineId="m1"
        machineName="My Machine"
        onStart={vi.fn()}
        onClose={vi.fn()}
        listDirectory={mockListDir}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("projects")).toBeInTheDocument();
    });
  });

  it("navigates into a folder on click", async () => {
    const listDir = vi.fn()
      .mockResolvedValueOnce({
        path: "~",
        entries: [{ name: "projects", isDir: true }],
      })
      .mockResolvedValueOnce({
        path: "/home/user/projects",
        entries: [{ name: "myapp", isDir: true }],
      });

    render(
      <StartSessionModal
        machineId="m1"
        machineName="m1"
        onStart={vi.fn()}
        onClose={vi.fn()}
        listDirectory={listDir}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("projects")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("projects"));
    await waitFor(() => {
      expect(screen.getByText("myapp")).toBeInTheDocument();
    });
  });

  it("toggles flag chips", async () => {
    render(
      <StartSessionModal
        machineId="m1"
        machineName="m1"
        onStart={vi.fn()}
        onClose={vi.fn()}
        listDirectory={mockListDir}
      />,
    );
    fireEvent.click(screen.getByText("Claude"));
    const chip = screen.getByText("--resume");
    fireEvent.click(chip);
    // After clicking, the chip should have accent background (selected state)
    expect(chip.style.background).toContain("var(--accent)");
  });

  it("calls onStart with combined args", async () => {
    const onStart = vi.fn();
    render(
      <StartSessionModal
        machineId="m1"
        machineName="m1"
        onStart={onStart}
        onClose={vi.fn()}
        listDirectory={mockListDir}
      />,
    );

    // Select Claude first (default is now Terminal)
    fireEvent.click(screen.getByText("Claude"));
    // Toggle --resume
    fireEvent.click(screen.getByText("--resume"));
    // Click Start
    fireEvent.click(screen.getByText("Start"));

    expect(onStart).toHaveBeenCalledWith("m1", "--resume", "~", undefined, "claude");
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = vi.fn();
    render(
      <StartSessionModal
        machineId="m1"
        machineName="m1"
        onStart={vi.fn()}
        onClose={onClose}
        listDirectory={mockListDir}
      />,
    );
    fireEvent.click(screen.getByTestId("modal-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when X button clicked", () => {
    const onClose = vi.fn();
    render(
      <StartSessionModal
        machineId="m1"
        machineName="m1"
        onStart={vi.fn()}
        onClose={onClose}
        listDirectory={mockListDir}
      />,
    );
    fireEvent.click(screen.getByTestId("modal-close"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows tool selector with Claude, Codex, and Gemini", async () => {
    render(
      <StartSessionModal
        machineId="m1"
        machineName="m1"
        onStart={vi.fn()}
        onClose={vi.fn()}
        listDirectory={mockListDir}
      />,
    );
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.getByText("Codex")).toBeInTheDocument();
    expect(screen.getByText("Gemini")).toBeInTheDocument();
  });

  it("shows --full-auto flag when Codex is selected", async () => {
    render(
      <StartSessionModal
        machineId="m1"
        machineName="m1"
        onStart={vi.fn()}
        onClose={vi.fn()}
        listDirectory={mockListDir}
      />,
    );
    fireEvent.click(screen.getByText("Claude"));
    expect(screen.getByText("--dangerously-skip-permissions")).toBeInTheDocument();
    expect(screen.queryByText("--full-auto")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Codex"));
    expect(screen.getByText("--full-auto")).toBeInTheDocument();
    expect(screen.queryByText("--dangerously-skip-permissions")).not.toBeInTheDocument();
  });

  it("passes cliTool to onStart", async () => {
    const onStart = vi.fn();
    render(
      <StartSessionModal
        machineId="m1"
        machineName="m1"
        onStart={onStart}
        onClose={vi.fn()}
        listDirectory={mockListDir}
      />,
    );
    fireEvent.click(screen.getByText("Codex"));
    fireEvent.click(screen.getByText("Start"));
    expect(onStart).toHaveBeenCalledWith("m1", undefined, "~", undefined, "codex");
  });

  it("shows --yolo flag when Gemini is selected", async () => {
    render(
      <StartSessionModal
        machineId="m1"
        machineName="m1"
        onStart={vi.fn()}
        onClose={vi.fn()}
        listDirectory={mockListDir}
      />,
    );
    fireEvent.click(screen.getByText("Gemini"));
    expect(screen.getByText("--yolo")).toBeInTheDocument();
    expect(screen.queryByText("--dangerously-skip-permissions")).not.toBeInTheDocument();
    expect(screen.queryByText("--full-auto")).not.toBeInTheDocument();
  });

  it("passes gemini cliTool to onStart", async () => {
    const onStart = vi.fn();
    render(
      <StartSessionModal
        machineId="m1"
        machineName="m1"
        onStart={onStart}
        onClose={vi.fn()}
        listDirectory={mockListDir}
      />,
    );
    fireEvent.click(screen.getByText("Gemini"));
    fireEvent.click(screen.getByText("Start"));
    expect(onStart).toHaveBeenCalledWith("m1", undefined, "~", undefined, "gemini");
  });
});
