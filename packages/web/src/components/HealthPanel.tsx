import type { HealthData } from "../hooks/useHealth";
import { X } from "./Icons";

interface HealthPanelProps {
  health: HealthData | null;
  onClose?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  return `${(bytes / (1024 ** 3)).toFixed(2)} GB`;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function barColor(pct: number): string {
  if (pct < 60) return "#4caf50";
  if (pct < 85) return "#ff9800";
  return "#f44336";
}

function Gauge({ label, value, max, unit }: { label: string; value: number; max: number; unit?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const display = unit === "%" ? `${value.toFixed(1)}%` : `${formatBytes(value)} / ${formatBytes(max)}`;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{label}</span>
        <span style={{ color: "var(--text-muted)" }}>{display}</span>
      </div>
      <div style={{
        height: 8,
        background: "color-mix(in srgb, var(--bg-primary) 60%, transparent)",
        borderRadius: 4,
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%",
          width: `${pct}%`,
          background: barColor(pct),
          borderRadius: 4,
          transition: "width 0.3s ease",
        }} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      padding: "6px 0",
      borderBottom: "1px solid color-mix(in srgb, var(--border) 50%, transparent)",
      fontSize: 12,
    }}>
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{value}</span>
    </div>
  );
}

export function HealthPanel({ health, onClose }: HealthPanelProps) {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "color-mix(in srgb, var(--bg-secondary) 75%, transparent)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      borderLeft: "1px solid color-mix(in srgb, var(--border) 60%, transparent)",
    }}>
      <div style={{
        padding: "8px 12px",
        borderBottom: "1px solid color-mix(in srgb, var(--border) 60%, transparent)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        {onClose && (
          <button onClick={onClose} style={{
            background: "none", border: "none", color: "var(--text-muted)",
            cursor: "pointer", lineHeight: 1, padding: "8px 12px",
            minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center",
          }}><X size={18} /></button>
        )}
        <span style={{ fontWeight: 600, fontSize: 13 }}>Server Health</span>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 12px" }}>
        {!health ? (
          <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 12, padding: 24 }}>
            Loading...
          </div>
        ) : (
          <>
            <Gauge label="CPU" value={health.cpuUsage} max={100} unit="%" />
            <Gauge label="System Memory" value={health.memoryUsed} max={health.memoryTotal} />

            <div style={{ marginTop: 8 }}>
              <Stat label="Process RSS" value={formatBytes(health.processRss)} />
              <Stat label="Uptime" value={formatUptime(health.uptime)} />
              <Stat label="Agents" value={health.agentCount} />
              <Stat label="Dashboards" value={health.dashboardCount} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
