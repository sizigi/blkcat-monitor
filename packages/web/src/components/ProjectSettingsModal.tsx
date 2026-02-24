import React, { useState, useEffect, useCallback, useRef } from "react";
import { X, Folder } from "./Icons";

interface ProjectSettingsModalProps {
  machineId: string;
  machineName: string;
  sessionName: string;
  getSettings: (machineId: string, scope: "global" | "project", projectPath?: string) => string;
  updateSettings: (machineId: string, scope: "global" | "project", settings: Record<string, unknown>, projectPath?: string) => string;
  subscribeSettingsSnapshot: (cb: (msg: any) => void) => () => void;
  subscribeSettingsResult: (cb: (msg: any) => void) => () => void;
  listDirectory: (machineId: string, path: string) => Promise<{ path: string; entries: { name: string; isDir: boolean }[]; error?: string }>;
  onClose: () => void;
}

export function ProjectSettingsModal({
  machineId,
  machineName,
  sessionName,
  getSettings,
  updateSettings,
  subscribeSettingsSnapshot,
  subscribeSettingsResult,
  listDirectory,
  onClose,
}: ProjectSettingsModalProps) {
  const [projectPath, setProjectPath] = useState("");
  const [settingsJson, setSettingsJson] = useState("");
  const [hooksJson, setHooksJson] = useState("");
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [browseEntries, setBrowseEntries] = useState<{ name: string; isDir: boolean }[]>([]);
  const [browsePath, setBrowsePath] = useState("");
  const reqIdRef = useRef("");
  const saveReqIdRef = useRef("");

  const fetchSettings = useCallback((path: string) => {
    if (!path.trim()) return;
    setLoading(true);
    setLoaded(false);
    setSaveStatus(null);
    setParseError(null);
    reqIdRef.current = getSettings(machineId, "project", path);
  }, [machineId, getSettings]);

  useEffect(() => {
    return subscribeSettingsSnapshot((msg: any) => {
      if (msg.requestId === reqIdRef.current) {
        const settings = { ...msg.settings };
        const hooks = settings.hooks;
        delete settings.hooks;
        setSettingsJson(JSON.stringify(settings, null, 2));
        setHooksJson(hooks ? JSON.stringify(hooks, null, 2) : "");
        setLoading(false);
        setLoaded(true);
      }
    });
  }, [subscribeSettingsSnapshot]);

  useEffect(() => {
    return subscribeSettingsResult((msg: any) => {
      if (msg.requestId === saveReqIdRef.current) {
        setSaveStatus(msg.success ? "Saved" : (msg.error ?? "Failed"));
        setTimeout(() => setSaveStatus(null), 3000);
        if (msg.success) fetchSettings(projectPath);
      }
    });
  }, [subscribeSettingsResult, fetchSettings, projectPath]);

  function handleSave() {
    try {
      const parsed = JSON.parse(settingsJson);
      setParseError(null);
      setSaveStatus("Saving...");
      saveReqIdRef.current = updateSettings(machineId, "project", parsed, projectPath);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }

  async function handleBrowse(path: string) {
    setBrowsing(true);
    setBrowsePath(path);
    const result = await listDirectory(machineId, path || "~");
    setBrowseEntries(result.entries.filter(e => e.isDir));
    setBrowsePath(result.path);
  }

  function selectDir(path: string) {
    setProjectPath(path);
    setBrowsing(false);
    fetchSettings(path);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        width: 520,
        maxHeight: "80vh",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", margin: 0 }}>
              Project Settings
            </h3>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              {machineName} / {sessionName}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "2px 6px",
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Project path */}
        <div style={{
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>Path:</span>
          <input
            type="text"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") fetchSettings(projectPath); }}
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
            onClick={() => handleBrowse(projectPath || "~")}
            title="Browse directories"
            style={{
              background: "var(--bg-tertiary)",
              color: "var(--text-muted)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: "3px 8px",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            Browse
          </button>
          <button
            onClick={() => fetchSettings(projectPath)}
            disabled={!projectPath.trim()}
            style={{
              background: "var(--accent)",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              padding: "3px 10px",
              fontSize: 11,
              cursor: "pointer",
              fontWeight: 600,
              opacity: projectPath.trim() ? 1 : 0.5,
            }}
          >
            Load
          </button>
        </div>

        {/* Directory browser */}
        {browsing && (
          <div style={{
            padding: "8px 16px",
            borderBottom: "1px solid var(--border)",
            maxHeight: 200,
            overflowY: "auto",
          }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6, fontFamily: "monospace" }}>
              {browsePath}
            </div>
            <div
              onClick={() => {
                const parent = browsePath.replace(/\/[^/]+\/?$/, "") || "/";
                handleBrowse(parent);
              }}
              style={{
                padding: "3px 8px",
                fontSize: 12,
                color: "var(--accent)",
                cursor: "pointer",
                borderRadius: 3,
              }}
              onMouseEnter={(e) => { (e.target as HTMLElement).style.background = "var(--bg-tertiary)"; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "transparent"; }}
            >
              ..
            </div>
            {browseEntries.map(e => (
              <div
                key={e.name}
                style={{
                  padding: "3px 8px",
                  fontSize: 12,
                  color: "var(--text)",
                  cursor: "pointer",
                  borderRadius: 3,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
                onMouseEnter={(ev) => { (ev.currentTarget as HTMLElement).style.background = "var(--bg-tertiary)"; }}
                onMouseLeave={(ev) => { (ev.currentTarget as HTMLElement).style.background = "transparent"; }}
                onClick={() => handleBrowse(`${browsePath}/${e.name}`)}
                onDoubleClick={() => selectDir(`${browsePath}/${e.name}`)}
              >
                <Folder size={14} style={{ color: "var(--text-muted)" }} />
                {e.name}
              </div>
            ))}
            <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
              <button
                onClick={() => selectDir(browsePath)}
                style={{
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
                Select this folder
              </button>
              <button
                onClick={() => setBrowsing(false)}
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
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div style={{ flex: 1, overflowY: "auto", padding: 0 }}>
          {loading ? (
            <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13 }}>Loading settings...</div>
          ) : !loaded ? (
            <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 13, textAlign: "center" }}>
              Enter a project path and click Load to view settings.
            </div>
          ) : (
            <>
              <div style={{ padding: "12px 16px" }}>
                <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                  Project Settings (JSON)
                </label>
                <textarea
                  value={settingsJson}
                  onChange={(e) => { setSettingsJson(e.target.value); setParseError(null); }}
                  spellCheck={false}
                  style={{
                    width: "100%",
                    minHeight: 180,
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

              {hooksJson && (
                <div style={{ padding: "0 16px 12px" }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4 }}>
                    Hooks (managed by blkcat - read only)
                  </label>
                  <textarea
                    value={hooksJson}
                    readOnly
                    spellCheck={false}
                    style={{
                      width: "100%",
                      minHeight: 60,
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
            </>
          )}
        </div>

        {/* Footer */}
        {loaded && (
          <div style={{
            padding: "10px 16px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <button
              onClick={handleSave}
              style={{
                background: "var(--accent)",
                color: "#fff",
                border: "none",
                borderRadius: 4,
                padding: "5px 16px",
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
        )}
      </div>
    </div>
  );
}
