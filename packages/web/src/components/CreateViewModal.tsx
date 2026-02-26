import React, { useState } from "react";
import type { MachineSnapshot, ViewPane } from "@blkcat/shared";
import { X, ChevronDown } from "./Icons";

interface CreateViewModalProps {
  machines: MachineSnapshot[];
  getMachineName: (machineId: string) => string;
  getSessionName: (machineId: string, sessionId: string, defaultName: string) => string;
  onCreate: (id: string, name: string, panes: ViewPane[]) => void;
  onClose: () => void;
}

export function CreateViewModal({
  machines,
  getMachineName,
  getSessionName,
  onCreate,
  onClose,
}: CreateViewModalProps) {
  const [name, setName] = useState("New View");
  const [selected, setSelected] = useState<Set<string>>(new Set()); // "machineId:sessionId"
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleSession = (machineId: string, sessionId: string) => {
    const key = `${machineId}:${sessionId}`;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleCreate = () => {
    const panes: ViewPane[] = [];
    // Preserve order: iterate machines then sessions in their natural order
    for (const machine of machines) {
      for (const session of machine.sessions) {
        if (selected.has(`${machine.machineId}:${session.id}`)) {
          panes.push({ machineId: machine.machineId, sessionId: session.id });
        }
      }
    }
    if (panes.length === 0) return;
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    onCreate(id, name.trim() || "Untitled View", panes);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 20,
          minWidth: 350,
          maxWidth: 500,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Create View</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}
          >
            <X size={14} />
          </button>
        </div>

        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          placeholder="View name"
          style={{
            background: "var(--bg)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "6px 10px",
            fontSize: 13,
            outline: "none",
          }}
        />

        <div style={{ flex: 1, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 4 }}>
          {machines.map((machine) => {
            const isCollapsed = collapsed.has(machine.machineId);
            const allSelected = machine.sessions.every((s) => selected.has(`${machine.machineId}:${s.id}`));
            const someSelected = machine.sessions.some((s) => selected.has(`${machine.machineId}:${s.id}`));
            return (
              <div key={machine.machineId}>
                <div
                  style={{
                    padding: "6px 10px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    borderBottom: "1px solid var(--border)",
                    background: "var(--bg)",
                  }}
                >
                  <span
                    onClick={() => setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(machine.machineId)) next.delete(machine.machineId);
                      else next.add(machine.machineId);
                      return next;
                    })}
                    style={{
                      cursor: "pointer",
                      display: "inline-flex",
                      transition: "transform 0.15s",
                      transform: isCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                    }}
                  >
                    <ChevronDown size={12} />
                  </span>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected; }}
                    onChange={() => {
                      setSelected((prev) => {
                        const next = new Set(prev);
                        for (const s of machine.sessions) {
                          const key = `${machine.machineId}:${s.id}`;
                          if (allSelected) next.delete(key);
                          else next.add(key);
                        }
                        return next;
                      });
                    }}
                    style={{ accentColor: "var(--accent)" }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{getMachineName(machine.machineId)}</span>
                </div>
                {!isCollapsed && machine.sessions.map((session) => {
                  const key = `${machine.machineId}:${session.id}`;
                  return (
                    <label
                      key={session.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "4px 10px 4px 36px",
                        fontSize: 13,
                        color: "var(--text-muted)",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(key)}
                        onChange={() => toggleSession(machine.machineId, session.id)}
                        style={{ accentColor: "var(--accent)" }}
                      />
                      {getSessionName(machine.machineId, session.id, session.windowName ?? session.name)}
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{
              padding: "6px 16px",
              fontSize: 13,
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text-muted)",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            style={{
              padding: "6px 16px",
              fontSize: 13,
              background: selected.size > 0 ? "var(--accent)" : "var(--bg-tertiary)",
              border: "none",
              borderRadius: 4,
              color: selected.size > 0 ? "#fff" : "var(--text-muted)",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Create ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}
