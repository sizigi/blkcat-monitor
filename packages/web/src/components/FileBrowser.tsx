import { useState, useEffect, useCallback, useRef } from "react";

interface FileBrowserProps {
  machineId: string;
  initialPath?: string;
  listDirectory: (machineId: string, path: string) => Promise<{ path: string; entries: { name: string; isDir: boolean }[]; error?: string }>;
  onFileSelect: (path: string) => void;
  onClose: () => void;
}

export function FileBrowser({ machineId, initialPath, listDirectory, onFileSelect, onClose }: FileBrowserProps) {
  const [currentPath, setCurrentPath] = useState(initialPath || "~");
  const [pathInput, setPathInput] = useState(initialPath ? (initialPath.endsWith("/") ? initialPath : initialPath + "/") : "~/");
  const [entries, setEntries] = useState<{ name: string; isDir: boolean }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevInitialPathRef = useRef(initialPath);

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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to list directory");
        setEntries([]);
      } finally {
        setLoading(false);
      }
    },
    [machineId, listDirectory],
  );

  // Load initial directory
  useEffect(() => {
    loadDirectory(initialPath || "~");
  }, [machineId]);

  // Update when session cwd changes
  useEffect(() => {
    if (initialPath && initialPath !== prevInitialPathRef.current) {
      prevInitialPathRef.current = initialPath;
      loadDirectory(initialPath);
    }
  }, [initialPath, loadDirectory]);

  const handleGoUp = () => {
    const parts = currentPath.replace(/\/+$/, "").split("/");
    if (parts.length > 1) {
      parts.pop();
      loadDirectory(parts.join("/") || "/");
    }
  };

  const handleNavigate = (name: string) => {
    const base = currentPath.endsWith("/") ? currentPath : currentPath + "/";
    loadDirectory(base + name);
  };

  const handleFileClick = (name: string) => {
    const base = currentPath.endsWith("/") ? currentPath : currentPath + "/";
    onFileSelect(base + name);
  };

  // Sort: directories first, then files, alphabetical within each group
  const sorted = [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid var(--border-color)" }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Files</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 16 }}>×</button>
      </div>

      {/* Path bar */}
      <div style={{ display: "flex", gap: 4, padding: "6px 8px", borderBottom: "1px solid var(--border-color)" }}>
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
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-color)",
            borderRadius: 4,
            padding: "4px 8px",
            fontSize: 12,
            fontFamily: "monospace",
            outline: "none",
            minWidth: 0,
          }}
        />
        <button
          onClick={() => { const trimmed = pathInput.trim(); if (trimmed) loadDirectory(trimmed); }}
          title="Go to path"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: 4, padding: "4px 8px", color: "var(--text-primary)", cursor: "pointer", fontSize: 12 }}
        >
          Go
        </button>
        <button
          onClick={handleGoUp}
          title="Parent directory"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: 4, padding: "4px 8px", color: "var(--text-primary)", cursor: "pointer", fontSize: 12 }}
        >
          ↑
        </button>
      </div>

      {/* File list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 0" }}>
        {loading && <div style={{ padding: "8px 12px", color: "var(--text-secondary)", fontSize: 12 }}>Loading...</div>}
        {error && <div style={{ padding: "8px 12px", color: "#e55", fontSize: 12 }}>{error}</div>}
        {!loading && !error && entries.length === 0 && (
          <div style={{ padding: "8px 12px", color: "var(--text-secondary)", fontSize: 12 }}>Empty directory</div>
        )}
        {!loading && !error && sorted.map((entry) => (
          <div
            key={entry.name}
            onClick={() => entry.isDir ? handleNavigate(entry.name) : handleFileClick(entry.name)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 12px",
              cursor: "pointer",
              fontSize: 12,
              fontFamily: "monospace",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <span style={{ flexShrink: 0 }}>{entry.isDir ? "\ud83d\udcc1" : "\ud83d\udcc4"}</span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
