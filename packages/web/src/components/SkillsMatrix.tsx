import React, { useState, useEffect, useRef } from "react";
import type { MachineSnapshot } from "@blkcat/shared";

interface SkillDef {
  name: string;
  files: { path: string; content: string }[];
}

interface MachineSkillData {
  deployedSkills: Set<string>;
  loading: boolean;
}

export interface SkillsMatrixProps {
  machines: MachineSnapshot[];
  getMachineName?: (machineId: string) => string;
  deploySkills: (machineId: string, skills: SkillDef[]) => string;
  removeSkills: (machineId: string, skillNames: string[]) => string;
  getSettings: (machineId: string, scope: "global" | "project", projectPath?: string) => string;
  updateSettings: (machineId: string, scope: "global" | "project", settings: Record<string, unknown>, projectPath?: string) => string;
  subscribeDeployResult: (cb: (msg: any) => void) => () => void;
  subscribeSettingsSnapshot: (cb: (msg: any) => void) => () => void;
  subscribeSettingsResult: (cb: (msg: any) => void) => () => void;
  onClose: () => void;
}

type CellStatus = "deploying" | "removing" | "deployed" | "removed" | "failed";

export function SkillsMatrix({
  machines,
  getMachineName,
  deploySkills,
  removeSkills,
  getSettings,
  subscribeDeployResult,
  subscribeSettingsSnapshot,
  onClose,
}: SkillsMatrixProps) {
  const [availableSkills, setAvailableSkills] = useState<SkillDef[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(true);
  const [machineData, setMachineData] = useState<Map<string, MachineSkillData>>(new Map());
  const [cellStatus, setCellStatus] = useState<Map<string, CellStatus>>(new Map());
  const pendingDeploy = useRef(new Map<string, string>()); // requestId -> cellKey
  const pendingRemove = useRef(new Map<string, string>()); // requestId -> cellKey

  // Fetch available skills
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/skills");
        const data = await res.json();
        setAvailableSkills(data.skills ?? []);
      } catch {}
      setLoadingSkills(false);
    })();
  }, []);

  // Fetch settings for each machine
  useEffect(() => {
    const initial = new Map<string, MachineSkillData>();
    for (const m of machines) {
      initial.set(m.machineId, { deployedSkills: new Set(), loading: true });
      getSettings(m.machineId, "global");
    }
    setMachineData(initial);
  }, [machines.map(m => m.machineId).join(",")]); // eslint-disable-line

  // Subscribe to settings snapshots (contains deployedSkills list)
  useEffect(() => {
    return subscribeSettingsSnapshot((msg: any) => {
      setMachineData(prev => {
        const next = new Map(prev);
        const skills = Array.isArray(msg.deployedSkills) ? new Set<string>(msg.deployedSkills) : new Set<string>();
        next.set(msg.machineId, {
          deployedSkills: skills,
          loading: false,
        });
        return next;
      });
    });
  }, [subscribeSettingsSnapshot]);

  // Subscribe to deploy/remove results (both use deploy_result message)
  useEffect(() => {
    return subscribeDeployResult((msg: any) => {
      // Check deploy
      const deployCellKey = pendingDeploy.current.get(msg.requestId);
      if (deployCellKey) {
        pendingDeploy.current.delete(msg.requestId);
        if (msg.success) {
          setCellStatus(prev => { const n = new Map(prev); n.set(deployCellKey, "deployed"); return n; });
          const machineId = deployCellKey.split(":")[0];
          getSettings(machineId, "global");
          setTimeout(() => setCellStatus(prev => { const n = new Map(prev); n.delete(deployCellKey); return n; }), 2000);
        } else {
          setCellStatus(prev => { const n = new Map(prev); n.set(deployCellKey, "failed"); return n; });
          setTimeout(() => setCellStatus(prev => { const n = new Map(prev); n.delete(deployCellKey); return n; }), 3000);
        }
        return;
      }
      // Check remove
      const removeCellKey = pendingRemove.current.get(msg.requestId);
      if (removeCellKey) {
        pendingRemove.current.delete(msg.requestId);
        if (msg.success) {
          setCellStatus(prev => { const n = new Map(prev); n.set(removeCellKey, "removed"); return n; });
          const machineId = removeCellKey.split(":")[0];
          getSettings(machineId, "global");
          setTimeout(() => setCellStatus(prev => { const n = new Map(prev); n.delete(removeCellKey); return n; }), 2000);
        } else {
          setCellStatus(prev => { const n = new Map(prev); n.set(removeCellKey, "failed"); return n; });
          setTimeout(() => setCellStatus(prev => { const n = new Map(prev); n.delete(removeCellKey); return n; }), 3000);
        }
      }
    });
  }, [subscribeDeployResult, getSettings]);

  // Collect all skill names: available + deployed on any machine
  const allNames = new Set<string>();
  for (const s of availableSkills) allNames.add(s.name);
  for (const [, data] of machineData) {
    for (const name of data.deployedSkills) allNames.add(name);
  }
  const sortedNames = [...allNames].sort();

  function handleDeploy(machineId: string, skillName: string) {
    const skill = availableSkills.find(s => s.name === skillName);
    if (!skill) return;
    const cellKey = `${machineId}:${skillName}`;
    setCellStatus(prev => { const n = new Map(prev); n.set(cellKey, "deploying"); return n; });
    const reqId = deploySkills(machineId, [skill]);
    pendingDeploy.current.set(reqId, cellKey);
  }

  function handleRemove(machineId: string, skillName: string) {
    const cellKey = `${machineId}:${skillName}`;
    setCellStatus(prev => { const n = new Map(prev); n.set(cellKey, "removing"); return n; });
    const reqId = removeSkills(machineId, [skillName]);
    pendingRemove.current.set(reqId, cellKey);
  }

  function isDeployed(machineId: string, name: string): boolean {
    const data = machineData.get(machineId);
    return data?.deployedSkills.has(name) ?? false;
  }

  function isAvailable(name: string): boolean {
    return availableSkills.some(s => s.name === name);
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--bg-secondary)",
      borderLeft: "1px solid var(--border)",
    }}>
      {/* Header */}
      <div style={{
        padding: "10px 16px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Skills</h3>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 18,
            padding: "8px 12px",
            lineHeight: 1,
            minWidth: 44,
            minHeight: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          ✕
        </button>
      </div>

      {/* Matrix */}
      <div style={{ flex: 1, overflow: "auto", padding: 0 }}>
        {loadingSkills ? (
          <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>Loading...</div>
        ) : sortedNames.length === 0 ? (
          <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>
            No skills found.
          </div>
        ) : (
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
          }}>
            <thead>
              <tr>
                <th style={{
                  textAlign: "left",
                  padding: "8px 12px",
                  borderBottom: "2px solid var(--border)",
                  color: "var(--text-muted)",
                  fontWeight: 600,
                  position: "sticky",
                  top: 0,
                  background: "var(--bg-secondary)",
                  zIndex: 1,
                }}>
                  Skill
                </th>
                {machines.map(m => (
                  <th key={m.machineId} style={{
                    textAlign: "center",
                    padding: "8px 12px",
                    borderBottom: "2px solid var(--border)",
                    color: "var(--text-muted)",
                    fontWeight: 600,
                    position: "sticky",
                    top: 0,
                    background: "var(--bg-secondary)",
                    zIndex: 1,
                    minWidth: 100,
                  }}>
                    {getMachineName ? getMachineName(m.machineId) : m.machineId}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedNames.map(name => (
                <tr key={name}>
                  <td style={{
                    padding: "6px 12px",
                    borderBottom: "1px solid var(--border)",
                    color: "var(--text)",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}>
                    {name}
                  </td>
                  {machines.map(m => {
                    const mId = m.machineId;
                    const cellKey = `${mId}:${name}`;
                    const status = cellStatus.get(cellKey);
                    const deployed = isDeployed(mId, name);
                    const available = isAvailable(name);
                    const mData = machineData.get(mId);

                    return (
                      <td key={mId} style={{
                        padding: "6px 12px",
                        borderBottom: "1px solid var(--border)",
                        textAlign: "center",
                      }}>
                        {mData?.loading ? (
                          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>...</span>
                        ) : status === "deploying" ? (
                          <span style={{ color: "var(--accent)", fontSize: 11 }}>Deploying...</span>
                        ) : status === "removing" ? (
                          <span style={{ color: "var(--accent)", fontSize: 11 }}>Removing...</span>
                        ) : status === "deployed" ? (
                          <span style={{ color: "var(--green)", fontSize: 11, fontWeight: 600 }}>Deployed</span>
                        ) : status === "removed" ? (
                          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>Removed</span>
                        ) : status === "failed" ? (
                          <span style={{ color: "var(--red)", fontSize: 11 }}>Failed</span>
                        ) : deployed ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            {available ? (
                              <button
                                onClick={() => handleDeploy(mId, name)}
                                title="Re-deploy (update)"
                                style={{
                                  background: "none",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "var(--green)",
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: "2px 4px",
                                }}
                              >
                                ✓
                              </button>
                            ) : (
                              <span style={{ color: "var(--green)", fontSize: 11, fontWeight: 600, padding: "2px 4px" }}>✓</span>
                            )}
                            <button
                              onClick={() => handleRemove(mId, name)}
                              title="Remove skill"
                              style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: "var(--text-muted)",
                                fontSize: 10,
                                padding: "2px 4px",
                                opacity: 0.5,
                              }}
                              onMouseEnter={(e) => { (e.currentTarget).style.opacity = "1"; (e.currentTarget).style.color = "var(--red)"; }}
                              onMouseLeave={(e) => { (e.currentTarget).style.opacity = "0.5"; (e.currentTarget).style.color = "var(--text-muted)"; }}
                            >
                              ✕
                            </button>
                          </span>
                        ) : available ? (
                          <button
                            onClick={() => handleDeploy(mId, name)}
                            style={{
                              background: "var(--bg-tertiary)",
                              color: "var(--accent)",
                              border: "1px solid var(--border)",
                              borderRadius: 4,
                              padding: "2px 8px",
                              fontSize: 11,
                              cursor: "pointer",
                            }}
                          >
                            Deploy
                          </button>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
