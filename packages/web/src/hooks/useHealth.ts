import { useState, useEffect, useCallback, useRef } from "react";

export interface HealthData {
  cpuUsage: number;
  memoryUsed: number;
  memoryTotal: number;
  processRss: number;
  uptime: number;
  agentCount: number;
  dashboardCount: number;
}

export function useHealth(active: boolean) {
  const [health, setHealth] = useState<HealthData | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      if (res.ok) {
        const data = await res.json();
        if (mountedRef.current) setHealth(data);
      }
    } catch {
      // ignore fetch errors
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!active) {
      return () => { mountedRef.current = false; };
    }
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [active, refresh]);

  return health;
}
