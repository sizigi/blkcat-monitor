import { useRegisterSW } from "virtual:pwa-register/react";

export function PWAPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 16,
        right: 16,
        zIndex: 9999,
        background: "var(--bg-secondary)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        fontSize: 13,
        color: "var(--text)",
      }}
    >
      <span>New version available</span>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          background: "var(--accent)",
          color: "#fff",
          border: "none",
          borderRadius: 4,
          padding: "4px 12px",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        Update
      </button>
      <button
        onClick={() => setNeedRefresh(false)}
        style={{
          background: "none",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: 16,
          lineHeight: 1,
          padding: "0 4px",
        }}
      >
        &times;
      </button>
    </div>
  );
}
