import React, { useState, useEffect, useCallback, useRef } from "react";
import type { MachineSnapshot } from "@blkcat/shared";

interface SkillDef {
  name: string;
  files: { path: string; content: string }[];
}

export interface SettingsPanelProps {
  machines: MachineSnapshot[];
  getMachineName?: (machineId: string) => string;
  deploySkills: (machineId: string, skills: SkillDef[]) => string;
  getSettings: (machineId: string, scope: "global" | "project", projectPath?: string) => string;
  updateSettings: (machineId: string, scope: "global" | "project", settings: Record<string, unknown>, projectPath?: string) => string;
  subscribeDeployResult: (cb: (msg: any) => void) => () => void;
  subscribeSettingsSnapshot: (cb: (msg: any) => void) => () => void;
  subscribeSettingsResult: (cb: (msg: any) => void) => () => void;
}

type Tab = "skills" | "plugins" | "settings";

// ---------- Skills Tab ----------

function SkillsTab({
  machineId,
  deploySkills,
  subscribeDeployResult,
}: {
  machineId: string;
  deploySkills: SettingsPanelProps["deploySkills"];
  subscribeDeployResult: SettingsPanelProps["subscribeDeployResult"];
}) {
  const [skills, setSkills] = useState<SkillDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deployStatus, setDeployStatus] = useState<Record<string, { pending: boolean; msg: string }>>({});
  const pendingRef = useRef<Map<string, string>>(new Map());

  // Fetch skills from REST
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/skills");
        const data = await res.json();
        if (!cancelled) {
          setSkills(data.skills ?? []);
          if (data.error) setError(data.error);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to fetch skills");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Subscribe to deploy results
  useEffect(() => {
    return subscribeDeployResult((msg) => {
      const label = pendingRef.current.get(msg.requestId);
      if (!label) return;
      pendingRef.current.delete(msg.requestId);
      setDeployStatus((prev) => ({
        ...prev,
        [label]: {
          pending: false,
          msg: msg.success ? "Deployed" : (msg.error ?? "Failed"),
        },
      }));
    });
  }, [subscribeDeployResult]);

  function handleDeploy(skill: SkillDef) {
    const reqId = deploySkills(machineId, [skill]);
    pendingRef.current.set(reqId, skill.name);
    setDeployStatus((prev) => ({
      ...prev,
      [skill.name]: { pending: true, msg: "Deploying..." },
    }));
  }

  function handleDeployAll() {
    if (skills.length === 0) return;
    const reqId = deploySkills(machineId, skills);
    pendingRef.current.set(reqId, "__all__");
    setDeployStatus((prev) => ({
      ...prev,
      ["__all__"]: { pending: true, msg: "Deploying all..." },
    }));
  }

  if (loading) {
    return <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>Loading skills...</div>;
  }

  if (error) {
    return <div style={{ padding: 16, color: "var(--red)", fontSize: 13 }}>{error}</div>;
  }

  if (skills.length === 0) {
    return (
      <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>
        No skills available. Configure <code style={{ color: "var(--text)" }}>BLKCAT_SKILLS_DIR</code> on the server.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Deploy All button */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
        <button
          onClick={handleDeployAll}
          disabled={deployStatus["__all__"]?.pending}
          style={{
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            padding: "4px 12px",
            fontSize: 12,
            cursor: "pointer",
            fontWeight: 600,
            opacity: deployStatus["__all__"]?.pending ? 0.6 : 1,
          }}
        >
          Deploy All ({skills.length})
        </button>
        {deployStatus["__all__"] && (
          <span style={{
            fontSize: 11,
            color: deployStatus["__all__"].pending ? "var(--text-muted)" : (deployStatus["__all__"].msg === "Deployed" ? "var(--green)" : "var(--red)"),
          }}>
            {deployStatus["__all__"].msg}
          </span>
        )}
      </div>
      {/* Skill list */}
      {skills.map((skill) => {
        const status = deployStatus[skill.name];
        return (
          <div
            key={skill.name}
            style={{
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{skill.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                {skill.files.length} file{skill.files.length !== 1 ? "s" : ""}
              </div>
            </div>
            <button
              onClick={() => handleDeploy(skill)}
              disabled={status?.pending}
              style={{
                background: "var(--bg-tertiary)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "3px 10px",
                fontSize: 11,
                cursor: "pointer",
                opacity: status?.pending ? 0.6 : 1,
                flexShrink: 0,
              }}
            >
              Deploy
            </button>
            {status && (
              <span style={{
                fontSize: 11,
                color: status.pending ? "var(--text-muted)" : (status.msg === "Deployed" ? "var(--green)" : "var(--red)"),
                flexShrink: 0,
              }}>
                {status.msg}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Plugins Tab ----------

function PluginsTab({
  machineId,
  getSettings,
  updateSettings,
  subscribeSettingsSnapshot,
  subscribeSettingsResult,
}: {
  machineId: string;
  getSettings: SettingsPanelProps["getSettings"];
  updateSettings: SettingsPanelProps["updateSettings"];
  subscribeSettingsSnapshot: SettingsPanelProps["subscribeSettingsSnapshot"];
  subscribeSettingsResult: SettingsPanelProps["subscribeSettingsResult"];
}) {
  const [enabledPlugins, setEnabledPlugins] = useState<string[]>([]);
  const [installedPlugins, setInstalledPlugins] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const reqIdRef = useRef<string>("");
  const saveReqIdRef = useRef<string>("");

  // Fetch settings on mount
  useEffect(() => {
    setLoading(true);
    reqIdRef.current = getSettings(machineId, "global");
  }, [machineId, getSettings]);

  // Subscribe to snapshot
  useEffect(() => {
    return subscribeSettingsSnapshot((msg) => {
      if (msg.requestId === reqIdRef.current || msg.machineId === machineId) {
        const settings = msg.settings ?? {};
        const enabled = Array.isArray(settings.enabledPlugins) ? settings.enabledPlugins : [];
        setEnabledPlugins(enabled);
        setInstalledPlugins(msg.installedPlugins ?? {});
        setLoading(false);
      }
    });
  }, [subscribeSettingsSnapshot, machineId]);

  // Subscribe to save results
  useEffect(() => {
    return subscribeSettingsResult((msg) => {
      if (msg.requestId === saveReqIdRef.current) {
        setSaveStatus(msg.success ? "Saved" : (msg.error ?? "Failed"));
        setTimeout(() => setSaveStatus(null), 3000);
      }
    });
  }, [subscribeSettingsResult]);

  function togglePlugin(name: string) {
    setEnabledPlugins((prev) => {
      if (prev.includes(name)) {
        return prev.filter((p) => p !== name);
      }
      return [...prev, name];
    });
  }

  function handleSave() {
    setSaveStatus("Saving...");
    saveReqIdRef.current = updateSettings(machineId, "global", { enabledPlugins });
  }

  if (loading) {
    return <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>Loading plugins...</div>;
  }

  // Combine installed and enabled into one list for display
  const allPluginNames = new Set([
    ...enabledPlugins,
    ...Object.keys(installedPlugins),
  ]);

  if (allPluginNames.size === 0) {
    return (
      <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>
        No plugins found. Install plugins via Claude Code CLI.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Enabled Plugins</span>
        <button
          onClick={handleSave}
          style={{
            marginLeft: "auto",
            background: "var(--accent)",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            padding: "3px 10px",
            fontSize: 11,
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Save
        </button>
        {saveStatus && (
          <span style={{
            fontSize: 11,
            color: saveStatus === "Saved" ? "var(--green)" : saveStatus === "Saving..." ? "var(--text-muted)" : "var(--red)",
          }}>
            {saveStatus}
          </span>
        )}
      </div>
      {[...allPluginNames].sort().map((name) => {
        const isEnabled = enabledPlugins.includes(name);
        const isInstalled = name in installedPlugins;
        return (
          <div
            key={name}
            style={{
              padding: "6px 12px",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {/* Toggle switch */}
            <button
              onClick={() => togglePlugin(name)}
              style={{
                width: 32,
                height: 18,
                borderRadius: 9,
                border: "none",
                cursor: "pointer",
                background: isEnabled ? "var(--green)" : "var(--bg-tertiary)",
                position: "relative",
                flexShrink: 0,
                padding: 0,
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "#fff",
                  position: "absolute",
                  top: 2,
                  left: isEnabled ? 16 : 2,
                  transition: "left 0.15s ease",
                }}
              />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, color: "var(--text)" }}>{name}</span>
              {!isInstalled && (
                <span style={{ fontSize: 10, color: "var(--text-muted)", marginLeft: 6 }}>(not installed)</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Settings Tab ----------

function SettingsTab({
  machineId,
  getSettings,
  updateSettings,
  subscribeSettingsSnapshot,
  subscribeSettingsResult,
}: {
  machineId: string;
  getSettings: SettingsPanelProps["getSettings"];
  updateSettings: SettingsPanelProps["updateSettings"];
  subscribeSettingsSnapshot: SettingsPanelProps["subscribeSettingsSnapshot"];
  subscribeSettingsResult: SettingsPanelProps["subscribeSettingsResult"];
}) {
  const [scope, setScope] = useState<"global" | "project">("global");
  const [projectPath, setProjectPath] = useState("");
  const [settingsJson, setSettingsJson] = useState("");
  const [hooksJson, setHooksJson] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const reqIdRef = useRef<string>("");
  const saveReqIdRef = useRef<string>("");

  const fetchSettings = useCallback(() => {
    setLoading(true);
    setSaveStatus(null);
    setParseError(null);
    reqIdRef.current = getSettings(machineId, scope, scope === "project" ? projectPath : undefined);
  }, [machineId, scope, projectPath, getSettings]);

  // Fetch on mount and when scope/machine changes
  useEffect(() => {
    // For project scope, only fetch if path is non-empty
    if (scope === "project" && !projectPath.trim()) {
      setLoading(false);
      setSettingsJson("");
      setHooksJson("");
      return;
    }
    fetchSettings();
  }, [machineId, scope]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to snapshot
  useEffect(() => {
    return subscribeSettingsSnapshot((msg) => {
      if (msg.requestId === reqIdRef.current) {
        const settings = { ...msg.settings };
        // Separate hooks from the rest
        const hooks = settings.hooks;
        delete settings.hooks;
        setSettingsJson(JSON.stringify(settings, null, 2));
        setHooksJson(hooks ? JSON.stringify(hooks, null, 2) : "");
        setLoading(false);
      }
    });
  }, [subscribeSettingsSnapshot]);

  // Subscribe to save results
  useEffect(() => {
    return subscribeSettingsResult((msg) => {
      if (msg.requestId === saveReqIdRef.current) {
        setSaveStatus(msg.success ? "Saved" : (msg.error ?? "Failed"));
        setTimeout(() => setSaveStatus(null), 3000);
        // Refresh after save
        if (msg.success) fetchSettings();
      }
    });
  }, [subscribeSettingsResult, fetchSettings]);

  function handleSave() {
    try {
      const parsed = JSON.parse(settingsJson);
      setParseError(null);
      setSaveStatus("Saving...");
      saveReqIdRef.current = updateSettings(
        machineId,
        scope,
        parsed,
        scope === "project" ? projectPath : undefined,
      );
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }

  function handleFetchProject() {
    if (projectPath.trim()) fetchSettings();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Scope selector */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>Scope:</span>
        {(["global", "project"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScope(s)}
            style={{
              background: scope === s ? "var(--accent)" : "var(--bg-tertiary)",
              color: scope === s ? "#fff" : "var(--text-muted)",
              border: scope === s ? "1px solid var(--accent)" : "1px solid var(--border)",
              borderRadius: 4,
              padding: "2px 10px",
              fontSize: 11,
              cursor: "pointer",
              fontWeight: scope === s ? 600 : 400,
            }}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Project path input (only for project scope) */}
      {scope === "project" && (
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 6 }}>
          <input
            type="text"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleFetchProject(); }}
            placeholder="/path/to/project"
            style={{
              flex: 1,
              fontSize: 12,
              fontFamily: "monospace",
              color: "var(--text)",
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "4px 8px",
            }}
          />
          <button
            onClick={handleFetchProject}
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "3px 10px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Load
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>Loading settings...</div>
      ) : (
        <>
          {/* Settings editor */}
          <div style={{ padding: "8px 12px" }}>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
              Settings (JSON)
            </label>
            <textarea
              value={settingsJson}
              onChange={(e) => { setSettingsJson(e.target.value); setParseError(null); }}
              spellCheck={false}
              style={{
                width: "100%",
                minHeight: 200,
                fontSize: 12,
                fontFamily: "monospace",
                color: "var(--text)",
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: 8,
                boxSizing: "border-box",
                resize: "vertical",
              }}
            />
            {parseError && (
              <div style={{ fontSize: 11, color: "var(--red)", marginTop: 4 }}>{parseError}</div>
            )}
          </div>

          {/* Hooks (read-only) */}
          {hooksJson && (
            <div style={{ padding: "0 12px 8px" }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>
                Hooks (managed by blkcat - read only)
              </label>
              <textarea
                value={hooksJson}
                readOnly
                spellCheck={false}
                style={{
                  width: "100%",
                  minHeight: 80,
                  fontSize: 12,
                  fontFamily: "monospace",
                  color: "var(--text-muted)",
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  borderRadius: 4,
                  padding: 8,
                  boxSizing: "border-box",
                  resize: "vertical",
                  opacity: 0.7,
                }}
              />
            </div>
          )}

          {/* Save button */}
          <div style={{ padding: "8px 12px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={handleSave}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "4px 14px",
                fontSize: 12,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Save
            </button>
            {saveStatus && (
              <span style={{
                fontSize: 11,
                color: saveStatus === "Saved" ? "var(--green)" : saveStatus === "Saving..." ? "var(--text-muted)" : "var(--red)",
              }}>
                {saveStatus}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ---------- Main SettingsPanel ----------

export function SettingsPanel({
  machines,
  getMachineName,
  deploySkills,
  getSettings,
  updateSettings,
  subscribeDeployResult,
  subscribeSettingsSnapshot,
  subscribeSettingsResult,
}: SettingsPanelProps) {
  const [selectedMachine, setSelectedMachine] = useState<string>("");
  const [activeTab, setActiveTab] = useState<Tab>("skills");

  // Auto-select first machine if none selected
  useEffect(() => {
    if (!selectedMachine && machines.length > 0) {
      setSelectedMachine(machines[0].machineId);
    }
    // Clear selection if machine disappears
    if (selectedMachine && !machines.find((m) => m.machineId === selectedMachine)) {
      setSelectedMachine(machines.length > 0 ? machines[0].machineId : "");
    }
  }, [machines, selectedMachine]);

  const tabs: { key: Tab; label: string }[] = [
    { key: "skills", label: "Skills" },
    { key: "plugins", label: "Plugins" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--bg-secondary)",
      borderLeft: "1px solid var(--border)",
    }}>
      {/* Machine selector */}
      <div style={{
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>Machine:</span>
        <select
          value={selectedMachine}
          onChange={(e) => setSelectedMachine(e.target.value)}
          style={{
            flex: 1,
            fontSize: 12,
            padding: "3px 6px",
            background: "var(--bg)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            borderRadius: 4,
            minWidth: 0,
          }}
        >
          {machines.length === 0 && <option value="">No machines</option>}
          {machines.map((m) => (
            <option key={m.machineId} value={m.machineId}>
              {getMachineName ? getMachineName(m.machineId) : m.machineId}
            </option>
          ))}
        </select>
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex",
        borderBottom: "1px solid var(--border)",
      }}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            style={{
              flex: 1,
              background: activeTab === key ? "var(--bg-secondary)" : "var(--bg-tertiary)",
              color: activeTab === key ? "var(--text)" : "var(--text-muted)",
              border: "none",
              borderBottom: activeTab === key ? "2px solid var(--accent)" : "2px solid transparent",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: activeTab === key ? 600 : 400,
              padding: "6px 0",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {!selectedMachine ? (
          <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
            No machine connected
          </div>
        ) : activeTab === "skills" ? (
          <SkillsTab
            machineId={selectedMachine}
            deploySkills={deploySkills}
            subscribeDeployResult={subscribeDeployResult}
          />
        ) : activeTab === "plugins" ? (
          <PluginsTab
            machineId={selectedMachine}
            getSettings={getSettings}
            updateSettings={updateSettings}
            subscribeSettingsSnapshot={subscribeSettingsSnapshot}
            subscribeSettingsResult={subscribeSettingsResult}
          />
        ) : (
          <SettingsTab
            machineId={selectedMachine}
            getSettings={getSettings}
            updateSettings={updateSettings}
            subscribeSettingsSnapshot={subscribeSettingsSnapshot}
            subscribeSettingsResult={subscribeSettingsResult}
          />
        )}
      </div>
    </div>
  );
}
