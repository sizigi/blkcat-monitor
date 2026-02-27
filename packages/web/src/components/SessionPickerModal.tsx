import React from "react";
import type { MachineSnapshot } from "@blkcat/shared";
import { X } from "./Icons";
import { buildCwdGroups, shortenPath } from "../utils/cwdGroups";

interface SessionPickerModalProps {
  machines: MachineSnapshot[];
  currentMachineId: string;
  currentSessionId: string;
  existingPaneKeys: Set<string>;
  getMachineName: (machineId: string) => string;
  getSessionName: (machineId: string, sessionId: string, defaultName: string) => string;
  getOrderedGroups?: <T extends { cwdRoot: string }>(machineId: string, groups: T[]) => T[];
  onSelect: (machineId: string, sessionId: string) => void;
  onClose: () => void;
}

export function SessionPickerModal({
  machines,
  currentMachineId,
  currentSessionId,
  existingPaneKeys,
  getMachineName,
  getSessionName,
  getOrderedGroups,
  onSelect,
  onClose,
}: SessionPickerModalProps) {
  const currentKey = `${currentMachineId}:${currentSessionId}`;

  // Build per-machine sections with CLI / terminal split
  const sections: { title: string; machines: { machineId: string; machineName: string; groups: { cwdRoot: string; sessions: { machineId: string; id: string; name: string; key: string; isCurrent: boolean; isInView: boolean }[] }[] }[] }[] = [];

  // Collect CLI and terminal sessions per machine
  const cliMachines: typeof sections[0]["machines"] = [];
  const termMachines: typeof sections[0]["machines"] = [];

  for (const machine of machines) {
    const cliSessions = machine.sessions.filter((s) => s.cliTool);
    const termSessions = machine.sessions.filter((s) => !s.cliTool);

    const machineName = getMachineName(machine.machineId);

    if (cliSessions.length > 0) {
      const { groups, ungrouped } = buildCwdGroups(cliSessions);
      const ordered = getOrderedGroups ? getOrderedGroups(machine.machineId, groups) : groups;
      const allGroups = [
        ...ordered.map((g) => ({
          cwdRoot: g.cwdRoot,
          sessions: g.sessions.map((s) => ({
            machineId: machine.machineId,
            id: s.id,
            name: getSessionName(machine.machineId, s.id, s.windowName ?? s.name),
            key: `${machine.machineId}:${s.id}`,
            isCurrent: `${machine.machineId}:${s.id}` === currentKey,
            isInView: existingPaneKeys.has(`${machine.machineId}:${s.id}`),
          })),
        })),
        ...(ungrouped.length > 0 ? [{
          cwdRoot: "",
          sessions: ungrouped.map((s) => ({
            machineId: machine.machineId,
            id: s.id,
            name: getSessionName(machine.machineId, s.id, s.windowName ?? s.name),
            key: `${machine.machineId}:${s.id}`,
            isCurrent: `${machine.machineId}:${s.id}` === currentKey,
            isInView: existingPaneKeys.has(`${machine.machineId}:${s.id}`),
          })),
        }] : []),
      ];
      cliMachines.push({ machineId: machine.machineId, machineName, groups: allGroups });
    }

    if (termSessions.length > 0) {
      const { groups, ungrouped } = buildCwdGroups(termSessions);
      const ordered = getOrderedGroups ? getOrderedGroups(machine.machineId, groups) : groups;
      const allGroups = [
        ...ordered.map((g) => ({
          cwdRoot: g.cwdRoot,
          sessions: g.sessions.map((s) => ({
            machineId: machine.machineId,
            id: s.id,
            name: getSessionName(machine.machineId, s.id, s.windowName ?? s.name),
            key: `${machine.machineId}:${s.id}`,
            isCurrent: `${machine.machineId}:${s.id}` === currentKey,
            isInView: existingPaneKeys.has(`${machine.machineId}:${s.id}`),
          })),
        })),
        ...(ungrouped.length > 0 ? [{
          cwdRoot: "",
          sessions: ungrouped.map((s) => ({
            machineId: machine.machineId,
            id: s.id,
            name: getSessionName(machine.machineId, s.id, s.windowName ?? s.name),
            key: `${machine.machineId}:${s.id}`,
            isCurrent: `${machine.machineId}:${s.id}` === currentKey,
            isInView: existingPaneKeys.has(`${machine.machineId}:${s.id}`),
          })),
        }] : []),
      ];
      termMachines.push({ machineId: machine.machineId, machineName, groups: allGroups });
    }
  }

  if (cliMachines.length > 0) sections.push({ title: "Vibe Coding", machines: cliMachines });
  if (termMachines.length > 0) sections.push({ title: "Terminals", machines: termMachines });

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
          width: "90vw",
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Switch Session</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", padding: 4 }}
          >
            <X size={14} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: "auto", borderRadius: 4 }}>
          {sections.map((section, si) => (
            <div key={section.title} style={{ marginTop: si > 0 ? 8 : 0 }}>
              {/* ── L1: Section header ── */}
              <div style={{
                padding: "7px 12px",
                fontSize: 11,
                fontWeight: 700,
                color: "var(--accent)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                background: "color-mix(in srgb, var(--accent) 8%, var(--bg))",
                borderTop: "2px solid var(--accent)",
                borderBottom: "1px solid var(--border)",
                position: "sticky",
                top: 0,
                zIndex: 2,
              }}>
                {section.title}
              </div>

              {section.machines.map((machine, mi) => (
                <div key={machine.machineId} style={{ marginTop: mi > 0 ? 4 : 0 }}>
                  {/* ── L2: Machine sub-header ── */}
                  {machines.length > 1 && (
                    <div style={{
                      padding: "5px 12px",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "var(--text)",
                      background: "var(--bg)",
                      borderBottom: "1px solid var(--border)",
                      borderLeft: "3px solid var(--text-muted)",
                      position: "sticky",
                      top: 27,
                      zIndex: 1,
                    }}>
                      {machine.machineName}
                    </div>
                  )}

                  {machine.groups.map((group, gi) => {
                    const indent = machines.length > 1 ? 12 : 4;
                    return (
                      <div key={group.cwdRoot || `ungrouped-${gi}`} style={{
                        marginTop: gi > 0 ? 2 : 0,
                        marginLeft: indent,
                        borderLeft: group.cwdRoot ? "2px solid color-mix(in srgb, var(--accent) 25%, transparent)" : undefined,
                      }}>
                        {/* ── L3: CWD group header ── */}
                        {group.cwdRoot && (
                          <div style={{
                            padding: "3px 8px",
                            fontSize: 11,
                            color: "var(--text-muted)",
                            fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
                            opacity: 0.8,
                          }}>
                            {shortenPath(group.cwdRoot)}
                          </div>
                        )}

                        {/* ── L4: Session rows ── */}
                        {group.sessions.map((session) => (
                          <div
                            key={session.key}
                            onClick={() => {
                              if (!session.isCurrent) {
                                onSelect(session.machineId, session.id);
                              }
                            }}
                            style={{
                              padding: "5px 10px 5px 14px",
                              fontSize: 13,
                              cursor: session.isCurrent ? "default" : "pointer",
                              color: session.isCurrent
                                ? "var(--accent)"
                                : session.isInView
                                  ? "var(--text-muted)"
                                  : "var(--text)",
                              opacity: session.isInView && !session.isCurrent ? 0.5 : 1,
                              background: session.isCurrent
                                ? "color-mix(in srgb, var(--accent) 6%, transparent)"
                                : "transparent",
                              fontWeight: session.isCurrent ? 600 : 400,
                              borderRadius: 3,
                              margin: "1px 4px",
                            }}
                            onMouseEnter={(e) => {
                              if (!session.isCurrent) {
                                (e.currentTarget as HTMLElement).style.background = "color-mix(in srgb, var(--accent) 10%, transparent)";
                              }
                            }}
                            onMouseLeave={(e) => {
                              (e.currentTarget as HTMLElement).style.background = session.isCurrent
                                ? "color-mix(in srgb, var(--accent) 6%, transparent)"
                                : "transparent";
                            }}
                          >
                            {session.name}
                            {session.isCurrent && <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.6 }}>(current)</span>}
                            {session.isInView && !session.isCurrent && <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.6 }}>(in view)</span>}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {/* bottom spacing after machine's groups */}
                  <div style={{ height: 4 }} />
                </div>
              ))}
            </div>
          ))}

          {sections.length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              No sessions available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
