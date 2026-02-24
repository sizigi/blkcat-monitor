import React, { useState } from "react";
import { CLI_TOOLS } from "@blkcat/shared";
import type { CliTool } from "@blkcat/shared";

interface ReloadSessionModalProps {
  sessionName: string;
  currentArgs?: string;
  cliTool?: CliTool;
  onReload: (args?: string, resume?: boolean) => void;
  onClose: () => void;
}

export function ReloadSessionModal({
  sessionName,
  currentArgs,
  cliTool,
  onReload,
  onClose,
}: ReloadSessionModalProps) {
  const tool = cliTool ?? "claude";
  const resumeFlag = tool === "codex" ? "resume" : "--resume";
  const FLAG_OPTIONS = [
    { flag: resumeFlag, color: "var(--accent)" },
    ...CLI_TOOLS[tool].flags,
  ];

  // Pre-populate flags from current session args; resume on by default
  const initialFlags = new Set<string>([resumeFlag]);
  for (const { flag } of FLAG_OPTIONS) {
    if (flag === resumeFlag) continue; // always start selected
    if (currentArgs?.includes(flag)) {
      initialFlags.add(flag);
    }
  }
  const [selectedFlags, setSelectedFlags] = useState<Set<string>>(initialFlags);
  const [extraArgs, setExtraArgs] = useState(() => {
    if (!currentArgs) return "";
    // Strip known flags to show only extra args
    let remainder = currentArgs;
    for (const { flag } of FLAG_OPTIONS) {
      remainder = remainder.replace(flag, "");
    }
    // Also strip resume value (session id) if present for both tools
    remainder = remainder.replace(/--resume\s+\S+/, "").replace(/--resume/, "");
    remainder = remainder.replace(/resume\s+\S+/, "").replace(/\bresume\b/, "");
    return remainder.trim();
  });

  function toggleFlag(flag: string) {
    setSelectedFlags((prev) => {
      const next = new Set(prev);
      if (next.has(flag)) {
        next.delete(flag);
      } else {
        next.add(flag);
      }
      return next;
    });
  }

  function handleReload() {
    const resume = selectedFlags.has(resumeFlag);
    const parts: string[] = [];
    for (const { flag } of FLAG_OPTIONS) {
      if (flag === resumeFlag) continue; // handled separately
      if (selectedFlags.has(flag)) {
        parts.push(flag);
      }
    }
    const trimmed = extraArgs.trim();
    if (trimmed) {
      parts.push(trimmed);
    }
    const combinedArgs = parts.length > 0 ? parts.join(" ") : undefined;
    onReload(combinedArgs, resume);
    onClose();
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.6)",
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
          borderRadius: 8,
          width: 400,
          display: "flex",
          flexDirection: "column",
          zIndex: 101,
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "var(--text)" }}>
            Reload Session
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
              padding: "2px 6px",
            }}
          >
            {"\u00d7"}
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Reloading <strong style={{ color: "var(--text)" }}>{sessionName}</strong>
          </div>

          {/* Flags */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text)",
                marginBottom: 8,
              }}
            >
              Flags
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {FLAG_OPTIONS.map(({ flag, color }) => {
                const isSelected = selectedFlags.has(flag);
                return (
                  <button
                    key={flag}
                    type="button"
                    onClick={() => toggleFlag(flag)}
                    style={{
                      background: isSelected ? color : "transparent",
                      color: isSelected ? "#fff" : "var(--text-muted)",
                      border: isSelected ? `1px solid ${color}` : "1px solid var(--border)",
                      borderRadius: 16,
                      padding: "4px 12px",
                      fontSize: 12,
                      fontFamily: "monospace",
                      cursor: "pointer",
                      lineHeight: 1.4,
                    }}
                  >
                    {flag}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Additional args */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text)",
                marginBottom: 8,
              }}
            >
              Additional args
            </label>
            <input
              type="text"
              value={extraArgs}
              onChange={(e) => setExtraArgs(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleReload();
              }}
              placeholder="e.g. --model sonnet"
              autoFocus
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: 13,
                fontFamily: "monospace",
                background: "var(--bg)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                boxSizing: "border-box",
              }}
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "8px 16px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleReload}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "8px 24px",
              fontSize: 14,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
