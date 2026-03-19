import { useState, useEffect, useRef, useCallback } from "react";

interface FileViewerProps {
  machineId: string;
  filePath: string;
  readFile: (machineId: string, path: string) => Promise<{ path: string; content?: string; error?: string; truncated?: { totalLines: number; headLines: number; tailLines: number }; encoding?: "base64"; mimeType?: string }>;
  onClose: () => void;
  onBack?: () => void;
}

export function FileViewer({ machineId, filePath, readFile, onClose, onBack }: FileViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [truncated, setTruncated] = useState<{ totalLines: number; headLines: number; tailLines: number } | null>(null);
  const [encoding, setEncoding] = useState<"base64" | undefined>();
  const [mimeType, setMimeType] = useState<string | undefined>();
  const [zoom, setZoom] = useState(1);
  const imgContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    setTruncated(null);
    setEncoding(undefined);
    setMimeType(undefined);
    setZoom(1);

    readFile(machineId, filePath).then((result) => {
      if (cancelled) return;
      if (result.error) {
        setError(result.error);
      } else {
        setContent(result.content ?? "");
        if (result.truncated) setTruncated(result.truncated);
        if (result.encoding) setEncoding(result.encoding);
        if (result.mimeType) setMimeType(result.mimeType);
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

  // Wheel zoom on image container
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!isImage) return;
    e.preventDefault();
    setZoom((z) => Math.min(10, Math.max(0.1, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
  }, []);

  const fileName = filePath.split("/").pop() || filePath;
  const isImage = encoding === "base64" && mimeType?.startsWith("image/");
  const lines = (!isImage && content) ? content.split("\n") : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary, #111)", color: "var(--text-primary, #eee)" }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderBottom: "1px solid var(--border-color)",
        background: "var(--bg-secondary)",
        flexShrink: 0,
      }}>
        {onBack && (
          <button onClick={onBack} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 14, padding: "0 4px", flexShrink: 0 }}>
            ←
          </button>
        )}
        <span style={{ flex: 1, fontFamily: "monospace", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={filePath}>
          {filePath}
        </span>
        {isImage && (
          <span style={{ fontSize: 11, color: "var(--text-secondary)", flexShrink: 0 }}>
            {Math.round(zoom * 100)}%
          </span>
        )}
        <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px", flexShrink: 0 }}>
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

      {/* Image zoom controls */}
      {!loading && !error && isImage && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 12px",
          borderBottom: "1px solid var(--border-color)",
          flexShrink: 0,
        }}>
          <button onClick={() => setZoom((z) => Math.max(0.1, z / 1.5))} style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: 4, padding: "2px 10px", color: "var(--text-primary)", cursor: "pointer", fontSize: 14 }}>−</button>
          <button onClick={() => setZoom(1)} style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: 4, padding: "2px 8px", color: "var(--text-primary)", cursor: "pointer", fontSize: 11 }}>1:1</button>
          <button onClick={() => setZoom((z) => Math.min(10, z * 1.5))} style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: 4, padding: "2px 10px", color: "var(--text-primary)", cursor: "pointer", fontSize: 14 }}>+</button>
          <button onClick={() => setZoom(0)} style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: 4, padding: "2px 8px", color: "var(--text-primary)", cursor: "pointer", fontSize: 11 }}>Fit</button>
        </div>
      )}

      {/* Content */}
      <div
        ref={imgContainerRef}
        onWheel={isImage ? handleWheel : undefined}
        style={{ flex: 1, overflow: "auto", padding: 0 }}
      >
        {loading && <div style={{ padding: 16, color: "var(--text-secondary)" }}>Loading {fileName}...</div>}
        {error && <div style={{ padding: 16, color: "#e55" }}>Error: {error}</div>}
        {!loading && !error && isImage && content && (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            minHeight: "100%",
          }}>
            <img
              src={`data:${mimeType};base64,${content}`}
              alt={fileName}
              style={zoom === 0
                ? { maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }
                : { width: `${zoom * 100}%`, objectFit: "contain" }
              }
            />
          </div>
        )}
        {!loading && !error && !isImage && content !== null && (
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
