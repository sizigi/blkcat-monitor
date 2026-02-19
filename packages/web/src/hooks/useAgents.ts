import { useState, useEffect, useCallback, useRef } from "react";
import type { OutboundAgentInfo } from "@blkcat/shared";

export interface UseAgentsReturn {
  agents: OutboundAgentInfo[];
  loading: boolean;
  addAgent: (address: string) => Promise<{ ok: boolean; error?: string }>;
  removeAgent: (address: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useAgents(): UseAgentsReturn {
  const [agents, setAgents] = useState<OutboundAgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/agents");
      if (res.ok) {
        const data = await res.json();
        if (mountedRef.current) setAgents(data.agents);
      }
    } catch {
      // ignore fetch errors
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [refresh]);

  const addAgent = useCallback(async (address: string) => {
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      if (!res.ok) {
        const data = await res.json();
        return { ok: false, error: data.error ?? "Failed to add agent" };
      }
      await refresh();
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error" };
    }
  }, [refresh]);

  const removeAgent = useCallback(async (address: string) => {
    await fetch(`/api/agents/${encodeURIComponent(address)}`, { method: "DELETE" });
    await refresh();
  }, [refresh]);

  return { agents, loading, addAgent, removeAgent, refresh };
}
