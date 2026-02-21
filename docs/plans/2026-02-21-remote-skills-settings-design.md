# Remote Skills & Settings Deployment — Design

## Goal

Deploy custom Claude Code skills/plugins and manage settings on remote agent hosts, on-demand from the dashboard.

## Architecture

```
Dashboard UI  →  Server (reads skills from git submodule)  →  Agent (writes to ~/.claude/)
                         WS: deploy_skills / update_settings
```

Three capabilities:
1. **Deploy skills** — Push skill directories from a git submodule on the server to agent hosts' `~/.claude/plugins/cache/`
2. **Manage plugins** — Enable/disable plugins via `enabledPlugins` in settings.json and `installed_plugins.json`
3. **Edit settings** — View and edit `settings.json` (global or project-level) through a JSON editor UI, with hooks section protected as read-only

## Protocol — New Message Types

### Server → Agent

| Message | Purpose |
|---------|---------|
| `deploy_skills` | Push skill files to agent host |
| `update_settings` | Replace non-hook settings in settings.json |
| `get_settings` | Request current settings.json from agent |

### Agent → Server

| Message | Purpose |
|---------|---------|
| `deploy_result` | Success/error after writing skill files |
| `settings_snapshot` | Current settings.json contents |
| `settings_result` | Success/error after patching settings |

### Payloads

```typescript
// Server → Agent
interface DeploySkillsMessage {
  type: "deploy_skills";
  machineId: string;
  requestId: string;
  skills: {
    name: string;
    files: { path: string; content: string }[];
  }[];
}

interface UpdateSettingsMessage {
  type: "update_settings";
  machineId: string;
  requestId: string;
  scope: "global" | "project";
  projectPath?: string;
  settings: Record<string, unknown>;  // full replacement of non-hook keys
}

interface GetSettingsMessage {
  type: "get_settings";
  machineId: string;
  requestId: string;
  scope: "global" | "project";
  projectPath?: string;
}

// Agent → Server
interface DeployResultMessage {
  type: "deploy_result";
  machineId: string;
  requestId: string;
  success: boolean;
  error?: string;
}

interface SettingsSnapshotMessage {
  type: "settings_snapshot";
  machineId: string;
  requestId: string;
  settings: Record<string, unknown>;
}

interface SettingsResultMessage {
  type: "settings_result";
  machineId: string;
  requestId: string;
  success: boolean;
  error?: string;
}
```

## Dashboard UI

New "Settings" panel accessible from the sidebar or top-level tab with three sections:

### A. Skills Manager
- Lists skills available in the server's git submodule
- Per-agent deployment status
- Actions: deploy to selected agents, remove from agent
- Shows file count and last-deployed timestamp

### B. Plugin Toggle
- Shows `enabledPlugins` from each agent's settings.json
- Toggle switches to enable/disable each plugin
- Changes sent via `update_settings`

### C. Settings Editor
- Fetches agent's current settings.json via `get_settings`
- JSON editor (editable textarea or structured form)
- `hooks` section rendered as read-only to prevent accidental breakage
- Save button sends `update_settings`
- Scope selector: Global (`~/.claude/settings.json`) vs Project (pick project path via file browser)

## Agent File-Write Capability

### Write skill files
- Target: `~/.claude/plugins/cache/<skill-name>/`
- Creates directories as needed
- Updates `~/.claude/plugins/installed_plugins.json` to register the plugin

### Read/modify settings.json
- Read: parse JSON, send full contents to server
- Write: merge incoming settings with existing, **preserve `hooks` section unconditionally**
- Support both global (`~/.claude/settings.json`) and project-level (`<projectPath>/.claude/settings.json`)
- Atomic write (temp file + rename) to avoid corruption

### Remove/disable skills
- Delete skill directory from `~/.claude/plugins/cache/`
- Remove entry from `installed_plugins.json`
- Set `enabledPlugins[name]` to `false` in settings.json

## Server-side Skill Source

- Git submodule at repo root (e.g., `skills/`)
- Server reads skill directories at deploy time via filesystem
- New REST endpoints:
  - `GET /api/skills` — list available skills from submodule
  - `POST /api/deploy` — trigger deploy to specified agents
  - `GET /api/settings/:machineId` — proxy to fetch agent settings
  - `PUT /api/settings/:machineId` — proxy to update agent settings

## Testing

- **shared** — Unit tests for new message type parsers
- **agent** — Unit tests for file write, settings merge (hooks preservation), skill removal
- **server** — Unit tests for skill file reading, deploy relay
- **web** — Component tests for skills manager, plugin toggles, settings editor
