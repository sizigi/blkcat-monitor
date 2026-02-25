# Server Health Monitoring Design

## Goal
Add server-side health monitoring (CPU/memory) to prevent crashes, displayed in the dashboard's right panel as a new "Health" tab.

## Scope
- Server-only monitoring (no agent-side metrics)
- Dashboard display only (no automatic protection actions)
- On-demand: data fetched only when Health tab is active

## Approach: REST Polling (on-demand)

### Server: `GET /api/health`
Returns JSON with:
- `cpuUsage`: system CPU utilization % (computed from `os.cpus()` delta)
- `memoryUsed` / `memoryTotal`: system memory in bytes
- `processRss`: server process RSS from `process.memoryUsage()`
- `uptime`: server process uptime in seconds
- `agentCount` / `dashboardCount`: current WebSocket connection counts

CPU usage requires two snapshots to compute delta. The server keeps a rolling previous snapshot and computes utilization on each request.

### Dashboard: Health tab + `useHealth` hook
- New tab "Health" alongside Events / Notifications / Skills
- On tab activate: immediate fetch + interval every 3s
- On tab deactivate: stop polling
- Color thresholds: green < 60%, yellow < 85%, red >= 85%

### Files to change
1. `packages/server/src/server.ts` — add `/api/health` endpoint + CPU snapshot logic
2. `packages/web/src/hooks/useHealth.ts` — new hook for polling
3. `packages/web/src/components/HealthPanel.tsx` — new component
4. `packages/web/src/App.tsx` — add Health tab button + render panel

No changes to `@blkcat/shared` protocol.
