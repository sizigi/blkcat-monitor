# Notifications Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface notification-triggering hook events (Stop, Notification, PermissionRequest) prominently in the dashboard with sidebar badges and a notification list panel, both overlaying the terminal.

**Architecture:** Export `NOTIFY_HOOK_EVENTS` from `@blkcat/shared` so server and web share the same set. Web tracks per-session notification counts in `useSocket` and clears them on session selection. EventFeed and new NotificationList share a tabbed overlay panel positioned absolutely over the terminal.

**Tech Stack:** React 19, TypeScript, Bun test, Vitest + jsdom

---

### Task 1: Export NOTIFY_HOOK_EVENTS from shared

**Files:**
- Modify: `packages/shared/src/protocol.ts`

**Step 1: Add the constant**

At the end of `protocol.ts`, before the parsers section, add:

```typescript
/** Hook events that indicate Claude is waiting for user action. */
export const NOTIFY_HOOK_EVENTS = new Set(["Stop", "Notification", "PermissionRequest"]);
```

**Step 2: Commit**

```bash
git add packages/shared/src/protocol.ts
git commit -m "feat(shared): export NOTIFY_HOOK_EVENTS constant"
```

---

### Task 2: Server uses shared constant + adds console.log

**Files:**
- Modify: `packages/server/src/server.ts`

**Step 1: Import from shared and replace local constant**

Replace the local `NOTIFY_HOOK_EVENTS` declaration at line 34 with an import from `@blkcat/shared`:

```typescript
import {
  type AgentToServerMessage,
  type AgentHookEventMessage,
  type MachineSnapshot,
  type OutboundAgentInfo,
  type SessionInfo,
  parseAgentMessage,
  parseDashboardMessage,
  NOTIFY_HOOK_EVENTS,
} from "@blkcat/shared";
```

Remove line 34: `const NOTIFY_HOOK_EVENTS = new Set(["Stop", "Notification", "PermissionRequest"]);`

**Step 2: Add console.log when notification fires**

In the `hook_event` handler, inside the `if (opts.notifyCommand && NOTIFY_HOOK_EVENTS.has(...))` block, add before `Bun.spawn`:

```typescript
console.log(`[notify] ${msg.hookEventName} from ${msg.machineId}/${msg.sessionId ?? "?"}`);
```

**Step 3: Run tests**

```bash
bun test packages/server/
```

Expected: All tests pass.

**Step 4: Commit**

```bash
git add packages/server/src/server.ts
git commit -m "refactor(server): use shared NOTIFY_HOOK_EVENTS, add notify logging"
```

---

### Task 3: useSocket tracks notification counts

**Files:**
- Modify: `packages/web/src/hooks/useSocket.ts`

**Step 1: Import NOTIFY_HOOK_EVENTS**

Add to imports:

```typescript
import { NOTIFY_HOOK_EVENTS } from "@blkcat/shared";
```

**Step 2: Add notification state and expose in return type**

Add to `UseSocketReturn` interface:

```typescript
notificationCounts: Map<string, number>;
clearNotifications: (sessionKey: string) => void;
```

**Step 3: Add state inside useSocket**

After `hookEventSubsRef`:

```typescript
const [notificationCounts, setNotificationCounts] = useState<Map<string, number>>(new Map());

const clearNotifications = useCallback((sessionKey: string) => {
  setNotificationCounts((prev) => {
    if (!prev.has(sessionKey)) return prev;
    const next = new Map(prev);
    next.delete(sessionKey);
    return next;
  });
}, []);
```

**Step 4: Increment count on matching hook events**

In the `hook_event` message handler, after the existing `for (const sub of hookEventSubsRef.current) sub(hookEvent);` line, add:

```typescript
if (NOTIFY_HOOK_EVENTS.has(hookEvent.hookEventName) && hookEvent.sessionId) {
  const key = `${hookEvent.machineId}:${hookEvent.sessionId}`;
  setNotificationCounts((prev) => {
    const next = new Map(prev);
    next.set(key, (next.get(key) ?? 0) + 1);
    return next;
  });
}
```

Also seed from snapshot: in the `snapshot` handler, after seeding hookEventsRef, add:

```typescript
// Seed notification counts from snapshot events
const counts = new Map<string, number>();
for (const machine of msg.machines) {
  if (machine.recentEvents) {
    for (const ev of machine.recentEvents) {
      if (NOTIFY_HOOK_EVENTS.has(ev.hookEventName) && ev.sessionId) {
        const key = `${machine.machineId}:${ev.sessionId}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
}
if (counts.size > 0) setNotificationCounts(counts);
```

**Step 5: Add to return object**

Add `notificationCounts` and `clearNotifications` to the return statement.

**Step 6: Commit**

```bash
git add packages/web/src/hooks/useSocket.ts
git commit -m "feat(web): track notification counts per session in useSocket"
```

---

### Task 4: Sidebar notification badges

**Files:**
- Modify: `packages/web/src/components/Sidebar.tsx`
- Modify: `packages/web/src/App.tsx` (pass new props)

**Step 1: Add notificationCounts prop to Sidebar**

In `SidebarProps` interface add:

```typescript
notificationCounts?: Map<string, number>;
```

Destructure in the component params.

**Step 2: Render badge next to session name**

In the session list rendering, after the session name `<span>` (the one with `onDoubleClick`), add:

```typescript
{(() => {
  const count = notificationCounts?.get(`${machine.machineId}:${session.id}`) ?? 0;
  if (count === 0) return null;
  return (
    <span style={{
      background: "var(--red)",
      color: "#fff",
      borderRadius: 8,
      padding: "0 5px",
      fontSize: 10,
      fontWeight: 700,
      marginLeft: 4,
      minWidth: 16,
      textAlign: "center",
      lineHeight: "16px",
      display: "inline-block",
    }}>
      {count}
    </span>
  );
})()}
```

**Step 3: Pass notificationCounts from App.tsx**

In `App.tsx`, add `notificationCounts` prop to `<Sidebar>`:

```typescript
notificationCounts={notificationCounts}
```

**Step 4: Clear notifications on session selection**

In the `onSelectSession` handler in App.tsx, call `clearNotifications`:

```typescript
onSelectSession={(m, s) => {
  setSelectedMachine(m);
  setSelectedSession(s);
  clearNotifications(`${m}:${s}`);
}}
```

**Step 5: Commit**

```bash
git add packages/web/src/components/Sidebar.tsx packages/web/src/App.tsx
git commit -m "feat(web): add notification badge to sidebar sessions"
```

---

### Task 5: NotificationList component

**Files:**
- Create: `packages/web/src/components/NotificationList.tsx`

**Step 1: Create the component**

Model it after EventFeed but filtered to NOTIFY_HOOK_EVENTS. Each entry is clickable to navigate to that session.

```typescript
import React, { useState, useEffect, useRef } from "react";
import type { AgentHookEventMessage } from "@blkcat/shared";
import { NOTIFY_HOOK_EVENTS } from "@blkcat/shared";

interface NotificationListProps {
  hookEventsRef: React.RefObject<AgentHookEventMessage[]>;
  subscribeHookEvents: (cb: (event: AgentHookEventMessage) => void) => () => void;
  onSelectSession?: (machineId: string, sessionId: string) => void;
  getMachineName?: (machineId: string) => string;
  getSessionName?: (sessionId: string, defaultName: string) => string;
}

const EVENT_LABELS: Record<string, string> = {
  Stop: "Response complete",
  Notification: "Notification",
  PermissionRequest: "Permission needed",
};

const EVENT_COLORS: Record<string, string> = {
  Stop: "#2196f3",
  Notification: "#00bcd4",
  PermissionRequest: "#e91e63",
};

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function NotificationList({
  hookEventsRef,
  subscribeHookEvents,
  onSelectSession,
  getMachineName,
  getSessionName,
}: NotificationListProps) {
  const [events, setEvents] = useState<AgentHookEventMessage[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    setEvents(hookEventsRef.current.filter((e) => NOTIFY_HOOK_EVENTS.has(e.hookEventName)));
    return subscribeHookEvents((event) => {
      if (NOTIFY_HOOK_EVENTS.has(event.hookEventName)) {
        setEvents((prev) => [...prev, event]);
      }
    });
  }, [hookEventsRef, subscribeHookEvents]);

  useEffect(() => {
    if (autoScrollRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events.length]);

  const handleScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    autoScrollRef.current = scrollHeight - scrollTop - clientHeight < 40;
  };

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100%",
      background: "var(--bg-secondary)",
      borderLeft: "1px solid var(--border)",
    }}>
      <div style={{
        padding: "8px 12px",
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
      }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Notifications</span>
        <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
          {events.length}
        </span>
      </div>
      <div
        ref={listRef}
        onScroll={handleScroll}
        style={{ flex: 1, overflowY: "auto", fontSize: 12 }}
      >
        {events.map((event, i) => (
          <div
            key={i}
            onClick={() => {
              if (event.sessionId && onSelectSession) {
                onSelectSession(event.machineId, event.sessionId);
              }
            }}
            style={{
              padding: "6px 12px",
              borderBottom: "1px solid var(--border)",
              cursor: event.sessionId ? "pointer" : "default",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "var(--text-muted)", fontSize: 10, flexShrink: 0 }}>
                {formatTime(event.timestamp)}
              </span>
              <span style={{
                background: EVENT_COLORS[event.hookEventName] ?? "#9e9e9e",
                color: "#fff",
                borderRadius: 3,
                padding: "1px 5px",
                fontSize: 10,
                fontWeight: 600,
                flexShrink: 0,
              }}>
                {event.hookEventName}
              </span>
            </div>
            <div style={{ marginTop: 2, color: "var(--text-muted)", fontSize: 11 }}>
              {getMachineName ? getMachineName(event.machineId) : event.machineId}
              {event.sessionId && (
                <> / {getSessionName
                  ? getSessionName(event.sessionId, event.sessionId)
                  : event.sessionId}</>
              )}
            </div>
            <div style={{ marginTop: 1, fontSize: 11 }}>
              {EVENT_LABELS[event.hookEventName] ?? event.hookEventName}
            </div>
          </div>
        ))}
        {events.length === 0 && (
          <div style={{
            padding: 24,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 12,
          }}>
            No notifications yet
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add packages/web/src/components/NotificationList.tsx
git commit -m "feat(web): add NotificationList component"
```

---

### Task 6: Overlay panel with Events/Notifications tabs

**Files:**
- Modify: `packages/web/src/App.tsx`

**Step 1: Import NotificationList**

```typescript
import { NotificationList } from "./components/NotificationList";
```

**Step 2: Replace eventPanelOpen state with panel tab state**

Replace:
```typescript
const [eventPanelOpen, setEventPanelOpen] = useState(false);
```

With:
```typescript
const [panelTab, setPanelTab] = useState<"events" | "notifications" | null>(null);
```

**Step 3: Replace the event panel toggle button and panel with an overlay**

Replace everything from `{/* Event panel toggle */}` through the closing `{eventPanelOpen && ...}` block with:

```typescript
{/* Right overlay panel */}
<div style={{
  position: "absolute",
  top: 0,
  right: 0,
  bottom: 0,
  display: "flex",
  flexDirection: "column",
  zIndex: 20,
  pointerEvents: "none",
}}>
  {/* Tab buttons */}
  <div style={{
    display: "flex",
    gap: 0,
    padding: "8px 8px 0",
    justifyContent: "flex-end",
    pointerEvents: "auto",
  }}>
    {(["events", "notifications"] as const).map((tab) => (
      <button
        key={tab}
        onClick={() => setPanelTab((v) => v === tab ? null : tab)}
        style={{
          background: panelTab === tab ? "var(--bg-secondary)" : "var(--bg-tertiary)",
          border: "1px solid var(--border)",
          borderBottom: panelTab === tab ? "none" : "1px solid var(--border)",
          color: panelTab === tab ? "var(--text-primary)" : "var(--text-muted)",
          cursor: "pointer",
          fontSize: 12,
          padding: "4px 10px",
          borderRadius: tab === "events" ? "4px 0 0 0" : "0 4px 0 0",
        }}
      >
        {tab === "events" ? "Events" : "Notifications"}
        {tab === "notifications" && (() => {
          let total = 0;
          for (const c of notificationCounts.values()) total += c;
          return total > 0 ? ` (${total})` : "";
        })()}
      </button>
    ))}
  </div>
  {/* Panel content */}
  {panelTab && (
    <div style={{
      width: 320,
      flex: 1,
      pointerEvents: "auto",
      marginRight: 0,
      alignSelf: "flex-end",
      overflow: "hidden",
    }}>
      {panelTab === "events" ? (
        <EventFeed
          hookEventsRef={hookEventsRef}
          subscribeHookEvents={subscribeHookEvents}
        />
      ) : (
        <NotificationList
          hookEventsRef={hookEventsRef}
          subscribeHookEvents={subscribeHookEvents}
          onSelectSession={(m, s) => {
            setSelectedMachine(m);
            setSelectedSession(s);
            clearNotifications(`${m}:${s}`);
            setPanelTab(null);
          }}
          getMachineName={getMachineName}
          getSessionName={getSessionName}
        />
      )}
    </div>
  )}
</div>
```

**Step 4: Destructure new values from useSocket**

Update the destructuring in App.tsx to include `notificationCounts` and `clearNotifications`:

```typescript
const { connected, machines, waitingSessions, outputMapRef, logMapRef, scrollbackMapRef, subscribeOutput, subscribeScrollback, sendInput, startSession, closeSession, reloadSession, sendResize, requestScrollback, hookEventsRef, subscribeHookEvents, notificationCounts, clearNotifications } = useSocket(WS_URL);
```

**Step 5: Run web tests**

```bash
cd packages/web && bunx vitest run
```

Expected: All tests pass.

**Step 6: Run all tests**

```bash
bun test
```

Expected: All tests pass.

**Step 7: Commit**

```bash
git add packages/web/src/App.tsx
git commit -m "feat(web): overlay panel with Events/Notifications tabs"
```
