import React, { useState, useEffect, useRef } from "react";
import type { MachineSnapshot } from "@blkcat/shared";

interface SkillDef {
  name: string;
  files: { path: string; content: string }[];
}

interface MachineSettings {
  enabledPlugins: Record<string, boolean>;
  installedPlugins: Record<string, unknown>;
  loading: boolean;
}

export interface SkillsMatrixProps {
  machines: MachineSnapshot[];
  getMachineName?: (machineId: string) => string;
  deploySkills: (machineId: string, skills: SkillDef[]) => string;
  getSettings: (machineId: string, scope: "global" | "project", projectPath?: string) => string;
  updateSettings: (machineId: string, scope: "global" | "project", settings: Record<string, unknown>, projectPath?: string) => string;
  subscribeDeployResult: (cb: (msg: any) => void) => () => void;
  subscribeSettingsSnapshot: (cb: (msg: any) => void) => () => void;
  subscribeSettingsResult: (cb: (msg: any) => void) => () => void;
  onClose: () => void;
}

type CellStatus = "deploying" | "toggling" | "deployed" | "failed";

export function SkillsMatrix({
  machines,
  getMachineName,
  deploySkills,
  getSettings,
  updateSettings,
  subscribeDeployResult,
  subscribeSettingsSnapshot,
  subscribeSettingsResult,
  onClose,
}: SkillsMatrixProps) {
  const [availableSkills, setAvailableSkills] = useState<SkillDef[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(true);
  const [machineData, setMachineData] = useState<Map<string, MachineSettings>>(new Map());
  const [cellStatus, setCellStatus] = useState<Map<string, CellStatus>>(new Map());
  const pendingDeploy = useRef(new Map<string, string>()); // requestId -> cellKey
  const pendingToggle = useRef(new Map<string, string>()); // requestId -> cellKey

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
    const initial = new Map<string, MachineSettings>();
    for (const m of machines) {
      initial.set(m.machineId, { enabledPlugins: {}, installedPlugins: {}, loading: true });
      getSettings(m.machineId, "global");
    }
    setMachineData(initial);
  }, [machines.map(m => m.machineId).join(",")]); // eslint-disable-line

  // Subscribe to settings snapshots
  useEffect(() => {
    return subscribeSettingsSnapshot((msg: any) => {
      setMachineData(prev => {
        const next = new Map(prev);
        const ep = msg.settings?.enabledPlugins ?? {};
        const enabledPlugins: Record<string, boolean> = typeof ep === "object" && !Array.isArray(ep) ? ep : {};
        next.set(msg.machineId, {
          enabledPlugins,
          installedPlugins: msg.installedPlugins?.plugins ?? {},
          loading: false,
        });
        return next;
      });
    });
  }, [subscribeSettingsSnapshot]);

  // Subscribe to deploy results
  useEffect(() => {
    return subscribeDeployResult((msg: any) => {
      const cellKey = pendingDeploy.current.get(msg.requestId);
      if (!cellKey) return;
      pendingDeploy.current.delete(msg.requestId);
      if (msg.success) {
        setCellStatus(prev => { const n = new Map(prev); n.set(cellKey, "deployed"); return n; });
        // Refresh this machine's settings
        const machineId = cellKey.split(":")[0];
        getSettings(machineId, "global");
        setTimeout(() => setCellStatus(prev => { const n = new Map(prev); n.delete(cellKey); return n; }), 2000);
      } else {
        setCellStatus(prev => { const n = new Map(prev); n.set(cellKey, "failed"); return n; });
        setTimeout(() => setCellStatus(prev => { const n = new Map(prev); n.delete(cellKey); return n; }), 3000);
      }
    });
  }, [subscribeDeployResult, getSettings]);

  // Subscribe to settings results (for toggle)
  useEffect(() => {
    return subscribeSettingsResult((msg: any) => {
      const cellKey = pendingToggle.current.get(msg.requestId);
      if (!cellKey) return;
      pendingToggle.current.delete(msg.requestId);
      if (msg.success) {
        setCellStatus(prev => { const n = new Map(prev); n.delete(cellKey); return n; });
        const machineId = cellKey.split(":")[0];
        getSettings(machineId, "global");
      } else {
        setCellStatus(prev => { const n = new Map(prev); n.set(cellKey, "failed"); return n; });
        setTimeout(() => setCellStatus(prev => { const n = new Map(prev); n.delete(cellKey); return n; }), 3000);
      }
    });
  }, [subscribeSettingsResult, getSettings]);

  // Collect all skill/plugin names across all machines + available
  const allNames = new Set<string>();
  for (const s of availableSkills) allNames.add(s.name);
  for (const [, data] of machineData) {
    for (const name of Object.keys(data.enabledPlugins)) allNames.add(name);
    for (const name of Object.keys(data.installedPlugins)) allNames.add(name);
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

  function handleToggle(machineId: string, skillName: string, currentlyEnabled: boolean) {
    const cellKey = `${machineId}:${skillName}`;
    setCellStatus(prev => { const n = new Map(prev); n.set(cellKey, "toggling"); return n; });
    const data = machineData.get(machineId);
    const ep = { ...(data?.enabledPlugins ?? {}) };
    ep[skillName] = !currentlyEnabled;
    const reqId = updateSettings(machineId, "global", { enabledPlugins: ep });
    pendingToggle.current.set(reqId, cellKey);
  }

  function isInstalled(machineId: string, name: string): boolean {
    const data = machineData.get(machineId);
    if (!data) return false;
    return name in data.installedPlugins || name in data.enabledPlugins;
  }

  function isEnabled(machineId: string, name: string): boolean {
    const data = machineData.get(machineId);
    if (!data) return false;
    return !!data.enabledPlugins[name];
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
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>Skills & Plugins</h3>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 16,
            padding: "2px 6px",
            lineHeight: 1,
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
            No skills or plugins found.
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
                  Skill / Plugin
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
                    const installed = isInstalled(mId, name);
                    const enabled = isEnabled(mId, name);
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
                        ) : status === "toggling" ? (
                          <span style={{ color: "var(--accent)", fontSize: 11 }}>Saving...</span>
                        ) : status === "deployed" ? (
                          <span style={{ color: "var(--green)", fontSize: 11, fontWeight: 600 }}>Deployed</span>
                        ) : status === "failed" ? (
                          <span style={{ color: "var(--red)", fontSize: 11 }}>Failed</span>
                        ) : installed ? (
                          <button
                            onClick={() => handleToggle(mId, name, enabled)}
                            title={enabled ? "Click to disable" : "Click to enable"}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: "2px 8px",
                              borderRadius: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              color: enabled ? "var(--green)" : "var(--text-muted)",
                            }}
                          >
                            {enabled ? "on" : "off"}
                          </button>
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
