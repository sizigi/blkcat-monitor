import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AgentManager } from "./AgentManager";
import type { OutboundAgentInfo } from "@blkcat/shared";

const agents: OutboundAgentInfo[] = [
  { address: "localhost:4000", status: "connected", source: "api" },
  { address: "localhost:5000", status: "connecting", source: "env" },
  { address: "localhost:6000", status: "disconnected", source: "api" },
];

describe("AgentManager", () => {
  it("renders agents with status indicators", () => {
    render(<AgentManager agents={agents} onAdd={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByTestId("agent-localhost:4000")).toBeInTheDocument();
    expect(screen.getByTestId("agent-localhost:5000")).toBeInTheDocument();
    expect(screen.getByTestId("agent-localhost:6000")).toBeInTheDocument();
    expect(screen.getByText("localhost:4000")).toBeInTheDocument();
  });

  it("shows empty state when no agents", () => {
    render(<AgentManager agents={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByText("No outbound agents")).toBeInTheDocument();
  });

  it("shows env badge for env-sourced agents", () => {
    render(<AgentManager agents={agents} onAdd={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByText("env")).toBeInTheDocument();
  });

  it("shows add form on + click", () => {
    render(<AgentManager agents={[]} onAdd={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.queryByTestId("add-agent-form")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("add-agent-btn"));
    expect(screen.getByTestId("add-agent-form")).toBeInTheDocument();
  });

  it("calls onAdd on form submit", async () => {
    const onAdd = vi.fn().mockResolvedValue({ ok: true });
    render(<AgentManager agents={[]} onAdd={onAdd} onRemove={vi.fn()} />);

    fireEvent.click(screen.getByTestId("add-agent-btn"));
    fireEvent.change(screen.getByTestId("add-agent-input"), {
      target: { value: "localhost:4000" },
    });
    fireEvent.submit(screen.getByTestId("add-agent-form"));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledWith("localhost:4000");
    });
  });

  it("shows error on failed add", async () => {
    const onAdd = vi.fn().mockResolvedValue({ ok: false, error: "agent already exists" });
    render(<AgentManager agents={[]} onAdd={onAdd} onRemove={vi.fn()} />);

    fireEvent.click(screen.getByTestId("add-agent-btn"));
    fireEvent.change(screen.getByTestId("add-agent-input"), {
      target: { value: "localhost:4000" },
    });
    fireEvent.submit(screen.getByTestId("add-agent-form"));

    await waitFor(() => {
      expect(screen.getByTestId("add-agent-error")).toHaveTextContent("agent already exists");
    });
  });

  it("remove button calls onRemove", () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(<AgentManager agents={agents} onAdd={vi.fn()} onRemove={onRemove} />);

    fireEvent.click(screen.getByTestId("remove-agent-localhost:4000"));

    expect(onRemove).toHaveBeenCalledWith("localhost:4000");
  });
});
