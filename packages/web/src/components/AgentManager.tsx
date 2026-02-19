import React, { useState } from "react";
import type { OutboundAgentInfo } from "@blkcat/shared";

interface AgentManagerProps {
  agents: OutboundAgentInfo[];
  onAdd: (address: string) => Promise<{ ok: boolean; error?: string }>;
  onRemove: (address: string) => Promise<void>;
}

const STATUS_COLORS: Record<OutboundAgentInfo["status"], string> = {
  connected: "var(--green)",
  connecting: "var(--accent)",
  disconnected: "var(--red)",
};

export function AgentManager({ agents, onAdd, onRemove }: AgentManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = address.trim();
    if (!trimmed) return;
    setError(null);
    const result = await onAdd(trimmed);
    if (result.ok) {
      setAddress("");
      setShowForm(false);
    } else {
      setError(result.error ?? "Failed to add agent");
    }
  }

  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Outbound Agents</h2>
        <button
          data-testid="add-agent-btn"
          onClick={() => {
            setShowForm(!showForm);
            setError(null);
            setAddress("");
          }}
          style={{
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 4,
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 14,
            lineHeight: 1,
            padding: "2px 6px",
          }}
        >
          +
        </button>
      </div>

      {showForm && (
        <form
          data-testid="add-agent-form"
          onSubmit={handleSubmit}
          style={{ padding: "0 16px 8px", display: "flex", gap: 4 }}
        >
          <input
            data-testid="add-agent-input"
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="host:port"
            style={{
              flex: 1,
              padding: "4px 8px",
              fontSize: 12,
              background: "var(--bg)",
              color: "var(--text)",
              border: "1px solid var(--border)",
              borderRadius: 4,
            }}
          />
          <button
            type="submit"
            style={{
              padding: "4px 8px",
              fontSize: 12,
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Connect
          </button>
          <button
            type="button"
            onClick={() => { setShowForm(false); setError(null); }}
            style={{
              padding: "4px 8px",
              fontSize: 12,
              background: "none",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </form>
      )}

      {error && (
        <div data-testid="add-agent-error" style={{ padding: "0 16px 8px", color: "var(--red)", fontSize: 12 }}>
          {error}
        </div>
      )}

      {agents.length === 0 && !showForm && (
        <p style={{ padding: "0 16px 12px", color: "var(--text-muted)", fontSize: 13 }}>
          No outbound agents
        </p>
      )}

      {agents.map((agent) => (
        <div
          key={agent.address}
          data-testid={`agent-${agent.address}`}
          style={{
            padding: "4px 16px",
            fontSize: 13,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            data-testid={`agent-status-${agent.address}`}
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: STATUS_COLORS[agent.status],
              display: "inline-block",
              flexShrink: 0,
            }}
          />
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {agent.address}
          </span>
          {agent.source === "env" && (
            <span
              style={{
                fontSize: 10,
                padding: "1px 4px",
                background: "var(--bg-tertiary)",
                borderRadius: 3,
                color: "var(--text-muted)",
              }}
            >
              env
            </span>
          )}
          <button
            data-testid={`remove-agent-${agent.address}`}
            onClick={() => onRemove(agent.address)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 14,
              lineHeight: 1,
              padding: "0 2px",
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
