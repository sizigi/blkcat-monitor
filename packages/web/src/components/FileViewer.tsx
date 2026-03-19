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
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const imgContainerRef = useRef<HTMLDivElement>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);
  const panRef = useRef<{ startX: number; startY: number; startOx: number; startOy: number; moved: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    setTruncated(null);
    setEncoding(undefined);
    setMimeType(undefined);
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });

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
    e.preventDefault();
    setZoom((z) => Math.min(10, Math.max(0.1, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
  }, []);

  // Pinch-to-zoom + pan for touch devices
  const getTouchDist = (t1: React.Touch, t2: React.Touch) =>
    Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch start
      const dist = getTouchDist(e.touches[0], e.touches[1]);
      pinchRef.current = { startDist: dist, startZoom: zoom };
      panRef.current = null;
    } else if (e.touches.length === 1 && zoom > 1) {
      // Pan start (only when zoomed in)
      const t = e.touches[0];
      panRef.current = { startX: t.clientX, startY: t.clientY, startOx: panOffset.x, startOy: panOffset.y, moved: false };
    }
  }, [zoom, panOffset]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const dist = getTouchDist(e.touches[0], e.touches[1]);
      const scale = dist / pinchRef.current.startDist;
      setZoom(Math.min(10, Math.max(0.1, pinchRef.current.startZoom * scale)));
    } else if (e.touches.length === 1 && panRef.current && zoom > 1) {
      const t = e.touches[0];
      const dx = t.clientX - panRef.current.startX;
      const dy = t.clientY - panRef.current.startY;
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) panRef.current.moved = true;
      if (panRef.current.moved) {
        e.preventDefault();
        setPanOffset({ x: panRef.current.startOx + dx, y: panRef.current.startOy + dy });
      }
    }
  }, [zoom]);

  const handleTouchEnd = useCallback(() => {
    pinchRef.current = null;
    panRef.current = null;
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
          <button onClick={() => { setZoom(1); setPanOffset({ x: 0, y: 0 }); }} style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: 4, padding: "2px 8px", color: "var(--text-primary)", cursor: "pointer", fontSize: 11 }}>1:1</button>
          <button onClick={() => setZoom((z) => Math.min(10, z * 1.5))} style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: 4, padding: "2px 10px", color: "var(--text-primary)", cursor: "pointer", fontSize: 14 }}>+</button>
          <button onClick={() => { setZoom(0); setPanOffset({ x: 0, y: 0 }); }} style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: 4, padding: "2px 8px", color: "var(--text-primary)", cursor: "pointer", fontSize: 11 }}>Fit</button>
        </div>
      )}

      {/* Content */}
      <div
        ref={imgContainerRef}
        onWheel={isImage ? handleWheel : undefined}
        onTouchStart={isImage ? handleTouchStart : undefined}
        onTouchMove={isImage ? handleTouchMove : undefined}
        onTouchEnd={isImage ? handleTouchEnd : undefined}
        style={{ flex: 1, overflow: isImage && zoom > 1 ? "hidden" : "auto", padding: 0, touchAction: isImage ? "none" : "auto" }}
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
            transform: zoom > 1 ? `translate(${panOffset.x}px, ${panOffset.y}px)` : undefined,
          }}>
            <img
              src={`data:${mimeType};base64,${content}`}
              alt={fileName}
              draggable={false}
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
