# Notification Tracking & Dashboard

## Goal

Surface notification events (Stop, Notification, PermissionRequest) prominently in the dashboard so users know which host:session needs attention.

## Server

- Log to console when a notification fires
- Export `NOTIFY_HOOK_EVENTS` from `@blkcat/shared` so server and web share the same set
- No protocol changes needed — hook_event messages already carry all data

## Dashboard: Sidebar Badges

- Track `notificationCounts: Map<sessionKey, number>` in `useSocket`
- Increment on hook_event matching NOTIFY_HOOK_EVENTS
- Clear count when user selects that session
- Render red badge with count next to session name in Sidebar

## Dashboard: Notification List Panel

- New `NotificationList` component filtered to notification event types
- Each entry: timestamp, machine name, session name, event type
- Clicking an entry navigates to that machine/session
- Tab toggle in right panel: "Events" | "Notifications"

## Overlay Behavior

- Right panel (Events/Notifications) floats over the terminal as an overlay
- Terminal always stays full width — panels do not resize it
- Panel is absolutely positioned over the terminal area
