import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { CLI_TOOLS } from "@blkcat/shared";
import type { CliTool } from "@blkcat/shared";

interface StartSessionModalProps {
  machineId: string;
  machineName: string;
  onStart: (machineId: string, args?: string, cwd?: string, name?: string, cliTool?: CliTool) => void;
  onClose: () => void;
  listDirectory: (
    machineId: string,
    path: string,
  ) => Promise<{
    path: string;
    entries: { name: string; isDir: boolean }[];
    error?: string;
  }>;
  createDirectory?: (
    machineId: string,
    path: string,
  ) => Promise<{
    path: string;
    success: boolean;
    error?: string;
  }>;
}

export function StartSessionModal({
  machineId,
  machineName,
  onStart,
  onClose,
  listDirectory,
  createDirectory,
}: StartSessionModalProps) {
  const [sessionName, setSessionName] = useState("");
  const [currentPath, setCurrentPath] = useState("~");
  const [pathInput, setPathInput] = useState("~/");
  const [entries, setEntries] = useState<{ name: string; isDir: boolean }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTool, setSelectedTool] = useState<CliTool | null>("claude");
  const [selectedFlags, setSelectedFlags] = useState<Set<string>>(new Set());
  const [extraArgs, setExtraArgs] = useState("");
  const [newFolderMode, setNewFolderMode] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const newFolderInputRef = useRef<HTMLInputElement>(null);

  const flagOptions = selectedTool ? [
    { flag: selectedTool === "codex" ? "resume" : "--resume", color: "var(--accent)" },
    ...CLI_TOOLS[selectedTool].flags,
  ] : [];

  // Track the last fetched parent directory (resolved path) to avoid redundant fetches
  const lastFetchedParentRef = useRef<string>("");

  // Full navigation: fetch directory and update pathInput with trailing slash
  const loadDirectory = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await listDirectory(machineId, path);
        if (result.error) {
          setError(result.error);
          setEntries([]);
        } else {
          setEntries(result.entries);
        }
        setCurrentPath(result.path);
        const display = result.path.endsWith("/") ? result.path : result.path + "/";
        setPathInput(display);
        lastFetchedParentRef.current = result.path;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to list directory");
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [machineId, listDirectory],
  );

  useEffect(() => {
    loadDirectory("~");
  }, [loadDirectory]);

  // Parse pathInput into parent directory and partial segment for filtering
  const { parentDir, partial } = useMemo(() => {
    const trimmed = pathInput.trim();
    if (!trimmed || trimmed === "/" || trimmed === "~") {
      return { parentDir: trimmed || "~", partial: "" };
    }
    if (trimmed.endsWith("/")) {
      return { parentDir: trimmed.replace(/\/+$/, "") || "/", partial: "" };
    }
    const lastSlash = trimmed.lastIndexOf("/");
    if (lastSlash === -1) {
      return { parentDir: "~", partial: trimmed };
    }
    return {
      parentDir: trimmed.substring(0, lastSlash) || "/",
      partial: trimmed.substring(lastSlash + 1),
    };
  }, [pathInput]);

  // Debounced fetch when parent directory changes from typing
  useEffect(() => {
    if (!parentDir || parentDir === lastFetchedParentRef.current) return;

    const timer = setTimeout(() => {
      setLoading(true);
      setError(null);
      listDirectory(machineId, parentDir)
        .then((result) => {
          lastFetchedParentRef.current = result.path;
          if (result.error) {
            setError(result.error);
            setEntries([]);
          } else {
            setEntries(result.entries);
          }
          setCurrentPath(result.path);
          setLoading(false);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "Failed to list directory");
          setEntries([]);
          setLoading(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [parentDir, machineId, listDirectory]);

  // Filter entries by partial prefix
  const filteredEntries = useMemo(() => {
    if (!partial) return entries;
    return entries.filter((entry) => entry.name.startsWith(partial));
  }, [entries, partial]);

  function handleNavigate(folderName: string) {
    const newPath =
      currentPath === "/" ? `/${folderName}` : `${currentPath}/${folderName}`;
    loadDirectory(newPath);
  }

  function handleGoUp() {
    if (currentPath === "/" || currentPath === "~") return;
    const parent = currentPath.replace(/\/[^/]+$/, "") || "/";
    loadDirectory(parent);
  }

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

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name || !createDirectory) return;
    const newPath = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
    setCreatingFolder(true);
    const result = await createDirectory(machineId, newPath);
    setCreatingFolder(false);
    if (result.success) {
      setNewFolderMode(false);
      setNewFolderName("");
      loadDirectory(newPath);
    } else {
      setError(result.error ?? "Failed to create directory");
    }
  }

  function handleStart() {
    if (!selectedTool) {
      // Plain terminal session
      const finalName = sessionName.trim() || undefined;
      onStart(machineId, undefined, currentPath, finalName, undefined);
      onClose();
      return;
    }
    const parts: string[] = [];
    for (const { flag } of flagOptions) {
      if (selectedFlags.has(flag)) {
        parts.push(flag);
      }
    }
    const trimmed = extraArgs.trim();
    if (trimmed) parts.push(trimmed);
    const combinedArgs = parts.length > 0 ? parts.join(" ") : undefined;
    const finalName = sessionName.trim() || undefined;
    onStart(machineId, combinedArgs, currentPath, finalName, selectedTool);
    onClose();
  }

  return (
    <div
      data-testid="modal-backdrop"
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
          width: 480,
          maxHeight: "80vh",
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
            Start Session on {machineName}
          </h2>
          <button
            data-testid="modal-close"
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
        <div style={{ padding: 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Session Name */}
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
              Session Name
            </label>
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g. my-project"
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: 13,
                background: "var(--bg)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Working Directory */}
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
              Working Directory
            </label>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 6,
                overflow: "hidden",
                background: "var(--bg)",
              }}
            >
              {/* Current path bar */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "4px 8px",
                  borderBottom: "1px solid var(--border)",
                  gap: 4,
                }}
              >
                <input
                  type="text"
                  value={pathInput}
                  onChange={(e) => setPathInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const trimmed = pathInput.trim();
                      if (trimmed) loadDirectory(trimmed);
                    }
                  }}
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontFamily: "monospace",
                    color: "var(--text)",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    padding: "4px",
                  }}
                />
                <button
                  onClick={() => {
                    const trimmed = pathInput.trim();
                    if (trimmed) loadDirectory(trimmed);
                  }}
                  title="Go to path"
                  style={{
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: 12,
                    lineHeight: 1,
                    padding: "2px 8px",
                  }}
                >
                  Go
                </button>
                <button
                  onClick={handleGoUp}
                  title="Go to parent directory"
                  style={{
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                    borderRadius: 4,
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    fontSize: 14,
                    lineHeight: 1,
                    padding: "2px 8px",
                  }}
                >
                  {"\u2191"}
                </button>
                {createDirectory && (
                  <button
                    onClick={() => {
                      setNewFolderMode(true);
                      setNewFolderName("");
                      setTimeout(() => newFolderInputRef.current?.focus(), 0);
                    }}
                    title="New folder"
                    style={{
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      color: "var(--text-muted)",
                      cursor: "pointer",
                      fontSize: 14,
                      lineHeight: 1,
                      padding: "2px 8px",
                    }}
                  >
                    +
                  </button>
                )}
              </div>

              {/* Directory listing */}
              <div style={{ maxHeight: 200, overflowY: "auto" }}>
                {newFolderMode && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "4px 12px",
                      gap: 6,
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{"\uD83D\uDCC1"}</span>
                    <input
                      ref={newFolderInputRef}
                      type="text"
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateFolder();
                        if (e.key === "Escape") { setNewFolderMode(false); setNewFolderName(""); }
                      }}
                      placeholder="folder name"
                      disabled={creatingFolder}
                      style={{
                        flex: 1,
                        fontSize: 13,
                        fontFamily: "monospace",
                        color: "var(--text)",
                        background: "transparent",
                        border: "1px solid var(--accent)",
                        borderRadius: 4,
                        outline: "none",
                        padding: "2px 6px",
                      }}
                    />
                    <button
                      onClick={handleCreateFolder}
                      disabled={creatingFolder || !newFolderName.trim()}
                      style={{
                        background: "var(--accent)",
                        border: "none",
                        borderRadius: 4,
                        color: "#fff",
                        cursor: creatingFolder || !newFolderName.trim() ? "default" : "pointer",
                        fontSize: 12,
                        padding: "2px 8px",
                        opacity: creatingFolder || !newFolderName.trim() ? 0.5 : 1,
                      }}
                    >
                      {creatingFolder ? "..." : "Create"}
                    </button>
                    <button
                      onClick={() => { setNewFolderMode(false); setNewFolderName(""); }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        fontSize: 14,
                        padding: "0 4px",
                      }}
                    >
                      {"\u00d7"}
                    </button>
                  </div>
                )}
                {loading && (
                  <div style={{ padding: "12px 12px", color: "var(--text-muted)", fontSize: 13 }}>
                    Loading...
                  </div>
                )}
                {error && (
                  <div style={{ padding: "12px 12px", color: "var(--red)", fontSize: 13 }}>
                    {error}
                  </div>
                )}
                {!loading && !error && entries.length === 0 && (
                  <div style={{ padding: "12px 12px", color: "var(--text-muted)", fontSize: 13 }}>
                    Empty directory
                  </div>
                )}
                {!loading && !error && entries.length > 0 && filteredEntries.length === 0 && (
                  <div style={{ padding: "12px 12px", color: "var(--text-muted)", fontSize: 13 }}>
                    No matching entries
                  </div>
                )}
                {!loading &&
                  !error &&
                  filteredEntries.map((entry) => (
                    <div
                      key={entry.name}
                      onClick={entry.isDir ? () => handleNavigate(entry.name) : undefined}
                      style={{
                        padding: "6px 12px",
                        fontSize: 13,
                        cursor: entry.isDir ? "pointer" : "default",
                        color: entry.isDir ? "var(--text)" : "var(--text-muted)",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                      onMouseEnter={(e) => {
                        if (entry.isDir) {
                          (e.currentTarget as HTMLElement).style.background = "var(--bg-tertiary)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      <span style={{ fontSize: 14 }}>{entry.isDir ? "\uD83D\uDCC1" : "\uD83D\uDCC4"}</span>
                      <span>{entry.name}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Session Type */}
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
              Session Type
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {([null, "claude", "codex", "gemini"] as const).map((tool) => {
                const isSelected = selectedTool === tool;
                const label = tool ? tool.charAt(0).toUpperCase() + tool.slice(1) : "Terminal";
                return (
                  <button
                    key={tool ?? "terminal"}
                    type="button"
                    onClick={() => { setSelectedTool(tool); setSelectedFlags(new Set()); }}
                    style={{
                      background: isSelected ? "var(--accent)" : "transparent",
                      color: isSelected ? "#fff" : "var(--text-muted)",
                      border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                      borderRadius: 16,
                      padding: "4px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      lineHeight: 1.4,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Flags (CLI tools only) */}
          {selectedTool && (
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
              {flagOptions.map(({ flag, color }) => {
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
          )}

          {/* Additional args (CLI tools only) */}
          {selectedTool && (
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
              placeholder="e.g. --model sonnet"
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
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--border)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={handleStart}
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
            Start
          </button>
        </div>
      </div>
    </div>
  );
}
