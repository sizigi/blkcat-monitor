import { useState, useEffect } from "react";

interface FileViewerProps {
  machineId: string;
  filePath: string;
  readFile: (machineId: string, path: string) => Promise<{ path: string; content?: string; error?: string; truncated?: { totalLines: number; headLines: number; tailLines: number } }>;
  onClose: () => void;
}

export function FileViewer({ machineId, filePath, readFile, onClose }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState<{ totalLines: number; headLines: number; tailLines: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    setTruncated(null);

    readFile(machineId, filePath).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
      } else {
        setContent(result.content ?? "");
        if (result.truncated) setTruncated(result.truncated);
      }
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [machineId, filePath, readFile]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); e.preventDefault(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const fileName = filePath.split("/").pop() || filePath;
  const lines = content?.split("\n") ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 12px",
        borderBottom: "1px solid var(--border-color)",
        background: "var(--bg-secondary)",
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: "monospace", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={filePath}>
          {filePath}
        </span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px" }}>
          ×
        </button>
      </div>

      {/* Truncation banner */}
      {truncated && (
        <div style={{
          padding: "4px 12px",
          background: "var(--bg-warning, #433)",
          color: "var(--text-warning, #fa5)",
          fontSize: 12,
          borderBottom: "1px solid var(--border-color)",
          flexShrink: 0,
        }}>
          File truncated: showing first {truncated.headLines} + last {truncated.tailLines} of {truncated.totalLines} lines
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 0 }}>
        {loading && <div style={{ padding: 16, color: "var(--text-secondary)" }}>Loading {fileName}...</div>}
        {error && <div style={{ padding: 16, color: "#e55" }}>Error: {error}</div>}
        {!loading && !error && content !== null && (
          <pre style={{ margin: 0, padding: 0, fontFamily: "monospace", fontSize: 13, lineHeight: "20px" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i}>
                    <td style={{
                      textAlign: "right",
                      paddingRight: 12,
                      paddingLeft: 8,
                      color: "var(--text-tertiary, #666)",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                      width: 1,
                      verticalAlign: "top",
                    }}>
                      {i + 1}
                    </td>
                    <td style={{ whiteSpace: "pre", paddingRight: 12 }}>
                      {line}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </pre>
        )}
      </div>
    </div>
  );
}
