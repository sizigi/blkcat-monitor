# Remote Skills & Settings Deployment — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy custom Claude Code skills/plugins and manage settings on remote agent hosts, on-demand from the dashboard.

**Architecture:** Server reads skill files from a local directory (git submodule), sends them to agents over the existing WebSocket connection. Agents write files to `~/.claude/plugins/cache/` and read/modify `~/.claude/settings.json`. Dashboard provides a Settings panel with skills manager, plugin toggles, and a JSON settings editor.

**Tech Stack:** Bun, TypeScript, React 19, WebSocket, Bun.file/Bun.write for file I/O

---

### Task 1: Add protocol types to shared package

**Files:**
- Modify: `packages/shared/src/protocol.ts:67-73` (AgentToServerMessage union)
- Modify: `packages/shared/src/protocol.ts:120` (ServerToAgentMessage union)
- Modify: `packages/shared/src/protocol.ts:171-177` (ServerToDashboardMessage union)
- Modify: `packages/shared/src/protocol.ts:231` (DashboardToServerMessage union)
- Modify: `packages/shared/src/protocol.ts:246-247` (parser type sets)
- Test: `packages/shared/src/protocol.test.ts`

**Step 1: Write failing tests for new message types**

Add to `packages/shared/src/protocol.test.ts` at the end of the `parseAgentMessage` describe block:

```typescript
it("parses deploy_result message", () => {
  const msg = parseAgentMessage(JSON.stringify({
    type: "deploy_result",
    machineId: "m1",
    requestId: "req-1",
    success: true,
  }));
  expect(msg?.type).toBe("deploy_result");
});

it("parses settings_snapshot message", () => {
  const msg = parseAgentMessage(JSON.stringify({
    type: "settings_snapshot",
    machineId: "m1",
    requestId: "req-1",
    settings: { model: "opus" },
  }));
  expect(msg?.type).toBe("settings_snapshot");
});

it("parses settings_result message", () => {
  const msg = parseAgentMessage(JSON.stringify({
    type: "settings_result",
    machineId: "m1",
    requestId: "req-1",
    success: true,
  }));
  expect(msg?.type).toBe("settings_result");
});
```

Add to the `parseDashboardMessage` describe block:

```typescript
it("parses deploy_skills message", () => {
  const msg = parseDashboardMessage(JSON.stringify({
    type: "deploy_skills",
    machineId: "m1",
    requestId: "req-1",
    skills: [{ name: "my-skill", files: [{ path: "skill.md", content: "# Skill" }] }],
  }));
  expect(msg?.type).toBe("deploy_skills");
});

it("parses get_settings message", () => {
  const msg = parseDashboardMessage(JSON.stringify({
    type: "get_settings",
    machineId: "m1",
    requestId: "req-1",
    scope: "global",
  }));
  expect(msg?.type).toBe("get_settings");
});

it("parses update_settings message", () => {
  const msg = parseDashboardMessage(JSON.stringify({
    type: "update_settings",
    machineId: "m1",
    requestId: "req-1",
    scope: "global",
    settings: { model: "sonnet" },
  }));
  expect(msg?.type).toBe("update_settings");
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/jinyh/blkcat-monitor && bun test packages/shared`
Expected: FAIL — parser rejects unknown types

**Step 3: Add new interfaces and update unions in protocol.ts**

After `AgentDirectoryListingMessage` (line 65), add:

```typescript
export interface AgentDeployResultMessage {
  type: "deploy_result";
  machineId: string;
  requestId: string;
  success: boolean;
  error?: string;
}

export interface AgentSettingsSnapshotMessage {
  type: "settings_snapshot";
  machineId: string;
  requestId: string;
  settings: Record<string, unknown>;
  scope: "global" | "project";
  installedPlugins?: Record<string, unknown>;
}

export interface AgentSettingsResultMessage {
  type: "settings_result";
  machineId: string;
  requestId: string;
  success: boolean;
  error?: string;
}
```

Update `AgentToServerMessage` union to include:
```typescript
| AgentDeployResultMessage
| AgentSettingsSnapshotMessage
| AgentSettingsResultMessage;
```

After `ServerListDirectoryMessage` (line 118), add:

```typescript
export interface ServerDeploySkillsMessage {
  type: "deploy_skills";
  requestId: string;
  skills: { name: string; files: { path: string; content: string }[] }[];
}

export interface ServerGetSettingsMessage {
  type: "get_settings";
  requestId: string;
  scope: "global" | "project";
  projectPath?: string;
}

export interface ServerUpdateSettingsMessage {
  type: "update_settings";
  requestId: string;
  scope: "global" | "project";
  projectPath?: string;
  settings: Record<string, unknown>;
}
```

Update `ServerToAgentMessage` union to include:
```typescript
| ServerDeploySkillsMessage
| ServerGetSettingsMessage
| ServerUpdateSettingsMessage;
```

After `ServerDirectoryListingMessage` (line 169), add:

```typescript
export interface ServerDeployResultMessage {
  type: "deploy_result";
  machineId: string;
  requestId: string;
  success: boolean;
  error?: string;
}

export interface ServerSettingsSnapshotMessage {
  type: "settings_snapshot";
  machineId: string;
  requestId: string;
  settings: Record<string, unknown>;
  scope: "global" | "project";
  installedPlugins?: Record<string, unknown>;
}

export interface ServerSettingsResultMessage {
  type: "settings_result";
  machineId: string;
  requestId: string;
  success: boolean;
  error?: string;
}
```

Update `ServerToDashboardMessage` union to include:
```typescript
| ServerDeployResultMessage
| ServerSettingsSnapshotMessage
| ServerSettingsResultMessage;
```

After `DashboardListDirectoryMessage` (line 229), add:

```typescript
export interface DashboardDeploySkillsMessage {
  type: "deploy_skills";
  machineId: string;
  requestId: string;
  skills: { name: string; files: { path: string; content: string }[] }[];
}

export interface DashboardGetSettingsMessage {
  type: "get_settings";
  machineId: string;
  requestId: string;
  scope: "global" | "project";
  projectPath?: string;
}

export interface DashboardUpdateSettingsMessage {
  type: "update_settings";
  machineId: string;
  requestId: string;
  scope: "global" | "project";
  projectPath?: string;
  settings: Record<string, unknown>;
}
```

Update `DashboardToServerMessage` union to include:
```typescript
| DashboardDeploySkillsMessage
| DashboardGetSettingsMessage
| DashboardUpdateSettingsMessage;
```

Update parser type sets:
```typescript
const AGENT_TYPES = new Set(["register", "output", "sessions", "scrollback", "hook_event", "directory_listing", "deploy_result", "settings_snapshot", "settings_result"]);
const DASHBOARD_TYPES = new Set(["input", "start_session", "close_session", "resize", "request_scrollback", "reload_session", "list_directory", "deploy_skills", "get_settings", "update_settings"]);
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/jinyh/blkcat-monitor && bun test packages/shared`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/shared/src/protocol.ts packages/shared/src/protocol.test.ts
git commit -m "feat(shared): add deploy_skills, get_settings, update_settings protocol types"
```

---

### Task 2: Agent settings/skills file handler

**Files:**
- Create: `packages/agent/src/settings-handler.ts`
- Test: `packages/agent/src/settings-handler.test.ts`

This module handles reading/writing `~/.claude/settings.json` and deploying skill files.

**Step 1: Write failing tests**

Create `packages/agent/src/settings-handler.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { readSettings, writeSettings, deploySkills } from "./settings-handler";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "blkcat-test-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true });
});

describe("readSettings", () => {
  it("reads existing settings.json", async () => {
    const settingsPath = join(tempDir, "settings.json");
    await Bun.write(settingsPath, JSON.stringify({ model: "opus", hooks: { Stop: [] } }));
    const result = await readSettings(settingsPath);
    expect(result.settings.model).toBe("opus");
    expect(result.settings.hooks).toBeDefined();
  });

  it("returns empty object for missing file", async () => {
    const result = await readSettings(join(tempDir, "nope.json"));
    expect(result.settings).toEqual({});
  });
});

describe("writeSettings", () => {
  it("writes settings preserving hooks", async () => {
    const settingsPath = join(tempDir, "settings.json");
    const existingHooks = { Stop: [{ matcher: "", hooks: [{ type: "command", command: "blkcat" }] }] };
    await Bun.write(settingsPath, JSON.stringify({ model: "opus", hooks: existingHooks, enabledPlugins: {} }));

    await writeSettings(settingsPath, { model: "sonnet", enabledPlugins: { "my-skill": true } });

    const written = JSON.parse(await Bun.file(settingsPath).text());
    expect(written.model).toBe("sonnet");
    expect(written.hooks).toEqual(existingHooks);
    expect(written.enabledPlugins["my-skill"]).toBe(true);
  });

  it("creates file if it does not exist", async () => {
    const settingsPath = join(tempDir, "new-settings.json");
    await writeSettings(settingsPath, { model: "haiku" });
    const written = JSON.parse(await Bun.file(settingsPath).text());
    expect(written.model).toBe("haiku");
  });
});

describe("deploySkills", () => {
  it("writes skill files to target directory", async () => {
    const cacheDir = join(tempDir, "plugins", "cache");
    const pluginsPath = join(tempDir, "plugins", "installed_plugins.json");

    await deploySkills({
      cacheDir,
      pluginsPath,
      skills: [{
        name: "my-skill",
        files: [
          { path: "skills/my-skill/index.md", content: "# My Skill\nDoes things." },
          { path: "skills/my-skill/helper.md", content: "# Helper" },
        ],
      }],
    });

    const content = await Bun.file(join(cacheDir, "my-skill", "skills", "my-skill", "index.md")).text();
    expect(content).toBe("# My Skill\nDoes things.");

    const plugins = JSON.parse(await Bun.file(pluginsPath).text());
    expect(plugins.plugins["my-skill"]).toBeDefined();
  });

  it("overwrites existing skill files", async () => {
    const cacheDir = join(tempDir, "plugins", "cache");
    const pluginsPath = join(tempDir, "plugins", "installed_plugins.json");

    await deploySkills({
      cacheDir,
      pluginsPath,
      skills: [{ name: "sk", files: [{ path: "a.md", content: "v1" }] }],
    });
    await deploySkills({
      cacheDir,
      pluginsPath,
      skills: [{ name: "sk", files: [{ path: "a.md", content: "v2" }] }],
    });

    const content = await Bun.file(join(cacheDir, "sk", "a.md")).text();
    expect(content).toBe("v2");
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/jinyh/blkcat-monitor && bun test packages/agent/src/settings-handler.test.ts`
Expected: FAIL — module not found

**Step 3: Implement settings-handler.ts**

Create `packages/agent/src/settings-handler.ts`:

```typescript
import { mkdir } from "fs/promises";
import { dirname, join } from "path";

export async function readSettings(settingsPath: string): Promise<{ settings: Record<string, unknown> }> {
  try {
    const file = Bun.file(settingsPath);
    if (await file.exists()) {
      const settings = JSON.parse(await file.text());
      return { settings };
    }
  } catch {}
  return { settings: {} };
}

export async function writeSettings(
  settingsPath: string,
  newSettings: Record<string, unknown>,
): Promise<void> {
  let existing: Record<string, unknown> = {};
  try {
    const file = Bun.file(settingsPath);
    if (await file.exists()) {
      existing = JSON.parse(await file.text());
    }
  } catch {}

  // Preserve hooks unconditionally
  const hooks = existing.hooks;
  const merged = { ...existing, ...newSettings };
  if (hooks !== undefined) {
    merged.hooks = hooks;
  }
  // Never allow incoming settings to overwrite hooks
  delete newSettings.hooks;

  await mkdir(dirname(settingsPath), { recursive: true });
  const tmpPath = settingsPath + ".tmp";
  await Bun.write(tmpPath, JSON.stringify(merged, null, 2));
  await Bun.write(settingsPath, await Bun.file(tmpPath).text());
  try { await Bun.file(tmpPath).exists() && (await import("fs/promises")).then(fs => fs.rm(tmpPath)); } catch {}
}

export async function readInstalledPlugins(pluginsPath: string): Promise<Record<string, unknown>> {
  try {
    const file = Bun.file(pluginsPath);
    if (await file.exists()) {
      return JSON.parse(await file.text());
    }
  } catch {}
  return { version: 2, plugins: {} };
}

interface DeploySkillsOptions {
  cacheDir: string;
  pluginsPath: string;
  skills: { name: string; files: { path: string; content: string }[] }[];
}

export async function deploySkills(opts: DeploySkillsOptions): Promise<void> {
  const { cacheDir, pluginsPath, skills } = opts;

  // Read existing installed_plugins.json
  let installed: Record<string, any>;
  try {
    const file = Bun.file(pluginsPath);
    if (await file.exists()) {
      installed = JSON.parse(await file.text());
    } else {
      installed = { version: 2, plugins: {} };
    }
  } catch {
    installed = { version: 2, plugins: {} };
  }

  for (const skill of skills) {
    const skillDir = join(cacheDir, skill.name);

    for (const f of skill.files) {
      const filePath = join(skillDir, f.path);
      await mkdir(dirname(filePath), { recursive: true });
      await Bun.write(filePath, f.content);
    }

    // Register in installed_plugins.json
    if (!installed.plugins) installed.plugins = {};
    installed.plugins[skill.name] = [{
      scope: "user",
      installPath: skillDir,
      version: "deployed",
      installedAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    }];
  }

  await mkdir(dirname(pluginsPath), { recursive: true });
  await Bun.write(pluginsPath, JSON.stringify(installed, null, 2));
}
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/jinyh/blkcat-monitor && bun test packages/agent/src/settings-handler.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/agent/src/settings-handler.ts packages/agent/src/settings-handler.test.ts
git commit -m "feat(agent): add settings-handler for reading/writing settings and deploying skills"
```

---

### Task 3: Wire agent message handlers for new message types

**Files:**
- Modify: `packages/agent/src/index.ts:55-128` (add handlers)
- Modify: `packages/agent/src/index.ts:130-138` (add methods to conn interface)
- Modify: `packages/agent/src/connection.ts:1-13` (options), `34-53` (message handler), `56-112` (send methods)
- Modify: `packages/agent/src/listener.ts:1-13` (options), `45-64` (message handler), `72-140` (send methods)

**Step 1: Update connection.ts**

Add to `AgentConnectionOptions` interface (after line 12):
```typescript
onDeploySkills?: (requestId: string, skills: { name: string; files: { path: string; content: string }[] }[]) => void;
onGetSettings?: (requestId: string, scope: "global" | "project", projectPath?: string) => void;
onUpdateSettings?: (requestId: string, scope: "global" | "project", settings: Record<string, unknown>, projectPath?: string) => void;
```

Add to message handler (after `list_directory` case at line 50):
```typescript
} else if (msg.type === "deploy_skills") {
  opts.onDeploySkills?.(msg.requestId, msg.skills);
} else if (msg.type === "get_settings") {
  opts.onGetSettings?.(msg.requestId, msg.scope, msg.projectPath);
} else if (msg.type === "update_settings") {
  opts.onUpdateSettings?.(msg.requestId, msg.scope, msg.settings, msg.projectPath);
}
```

Add send methods (after `sendDirectoryListing` at line 109):
```typescript
sendDeployResult(requestId: string, success: boolean, error?: string) {
  const msg: Record<string, any> = {
    type: "deploy_result",
    machineId: this.opts.machineId,
    requestId,
    success,
  };
  if (error) msg.error = error;
  this.ws.send(JSON.stringify(msg));
}

sendSettingsSnapshot(requestId: string, settings: Record<string, unknown>, scope: "global" | "project", installedPlugins?: Record<string, unknown>) {
  const msg: Record<string, any> = {
    type: "settings_snapshot",
    machineId: this.opts.machineId,
    requestId,
    settings,
    scope,
  };
  if (installedPlugins) msg.installedPlugins = installedPlugins;
  this.ws.send(JSON.stringify(msg));
}

sendSettingsResult(requestId: string, success: boolean, error?: string) {
  const msg: Record<string, any> = {
    type: "settings_result",
    machineId: this.opts.machineId,
    requestId,
    success,
  };
  if (error) msg.error = error;
  this.ws.send(JSON.stringify(msg));
}
```

**Step 2: Update listener.ts with the same changes**

Same pattern as connection.ts: add options, message handling, and send methods (using `this.broadcast()` instead of `this.ws.send()`).

**Step 3: Update index.ts**

Import the new handler module at top:
```typescript
import { readSettings, writeSettings, deploySkills, readInstalledPlugins } from "./settings-handler";
import { resolve as resolvePath } from "path";
```

Add handler functions (after `handleListDirectory` around line 128):
```typescript
async function handleDeploySkills(requestId: string, skills: { name: string; files: { path: string; content: string }[] }[]) {
  try {
    const home = process.env.HOME ?? "/root";
    await deploySkills({
      cacheDir: resolvePath(home, ".claude/plugins/cache"),
      pluginsPath: resolvePath(home, ".claude/plugins/installed_plugins.json"),
      skills,
    });
    conn.sendDeployResult(requestId, true);
    console.log(`Deployed ${skills.length} skill(s): ${skills.map(s => s.name).join(", ")}`);
  } catch (err: any) {
    conn.sendDeployResult(requestId, false, err?.message ?? "Unknown error");
  }
}

async function handleGetSettings(requestId: string, scope: "global" | "project", projectPath?: string) {
  try {
    const home = process.env.HOME ?? "/root";
    const settingsPath = scope === "global"
      ? resolvePath(home, ".claude/settings.json")
      : resolvePath(projectPath ?? ".", ".claude/settings.json");
    const { settings } = await readSettings(settingsPath);
    const installedPlugins = await readInstalledPlugins(resolvePath(home, ".claude/plugins/installed_plugins.json"));
    conn.sendSettingsSnapshot(requestId, settings, scope, installedPlugins);
  } catch (err: any) {
    conn.sendSettingsSnapshot(requestId, {}, scope);
  }
}

async function handleUpdateSettings(requestId: string, scope: "global" | "project", settings: Record<string, unknown>, projectPath?: string) {
  try {
    const home = process.env.HOME ?? "/root";
    const settingsPath = scope === "global"
      ? resolvePath(home, ".claude/settings.json")
      : resolvePath(projectPath ?? ".", ".claude/settings.json");
    await writeSettings(settingsPath, settings);
    conn.sendSettingsResult(requestId, true);
    console.log(`Updated ${scope} settings`);
  } catch (err: any) {
    conn.sendSettingsResult(requestId, false, err?.message ?? "Unknown error");
  }
}
```

Add new callbacks to both `AgentListener` and `AgentConnection` constructor calls (around lines 141-168):
```typescript
onDeploySkills: handleDeploySkills,
onGetSettings: handleGetSettings,
onUpdateSettings: handleUpdateSettings,
```

Update the `conn` interface type (lines 130-138) to include new send methods:
```typescript
sendDeployResult(requestId: string, success: boolean, error?: string): void;
sendSettingsSnapshot(requestId: string, settings: Record<string, unknown>, scope: "global" | "project", installedPlugins?: Record<string, unknown>): void;
sendSettingsResult(requestId: string, success: boolean, error?: string): void;
```

**Step 4: Run all agent tests**

Run: `cd /home/jinyh/blkcat-monitor && bun test packages/agent`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/agent/src/index.ts packages/agent/src/connection.ts packages/agent/src/listener.ts
git commit -m "feat(agent): wire deploy_skills, get_settings, update_settings message handlers"
```

---

### Task 4: Server routing for new messages

**Files:**
- Modify: `packages/server/src/server.ts:75-137` (handleAgentMessage)
- Modify: `packages/server/src/server.ts:320-388` (dashboard message handler)

**Step 1: Add agent→server→dashboard passthrough for results**

In `handleAgentMessage()`, after the `directory_listing` case (line 136):

```typescript
} else if (msg.type === "deploy_result" || msg.type === "settings_snapshot" || msg.type === "settings_result") {
  broadcastToDashboards(msg);
}
```

**Step 2: Add dashboard→server→agent forwarding for commands**

In the dashboard message handler, after the `list_directory` case (line 388):

```typescript
} else if (msg.type === "deploy_skills") {
  const machine = machines.get(msg.machineId);
  if (machine) {
    machine.agent.send(JSON.stringify({
      type: "deploy_skills",
      requestId: msg.requestId,
      skills: msg.skills,
    }));
  }
} else if (msg.type === "get_settings") {
  const machine = machines.get(msg.machineId);
  if (machine) {
    machine.agent.send(JSON.stringify({
      type: "get_settings",
      requestId: msg.requestId,
      scope: msg.scope,
      ...(msg.projectPath ? { projectPath: msg.projectPath } : {}),
    }));
  }
} else if (msg.type === "update_settings") {
  const machine = machines.get(msg.machineId);
  if (machine) {
    machine.agent.send(JSON.stringify({
      type: "update_settings",
      requestId: msg.requestId,
      scope: msg.scope,
      settings: msg.settings,
      ...(msg.projectPath ? { projectPath: msg.projectPath } : {}),
    }));
  }
}
```

**Step 3: Add REST endpoint for available skills**

In the `fetch()` handler (after `/api/agents` block, around line 288), add:

```typescript
if (url.pathname === "/api/skills" && req.method === "GET") {
  try {
    const skillsDir = opts.skillsDir;
    if (!skillsDir) {
      return Response.json({ skills: [], error: "No skills directory configured" });
    }
    const skills = await readSkillsDir(skillsDir);
    return Response.json({ skills });
  } catch (err: any) {
    return Response.json({ skills: [], error: err?.message }, { status: 500 });
  }
}
```

Add `skillsDir?: string` to `ServerOptions` interface (line 16).

Add a helper function before `createServer`:

```typescript
async function readSkillsDir(dir: string): Promise<{ name: string; files: { path: string; content: string }[] }[]> {
  const { readdir, stat } = await import("fs/promises");
  const { join, relative } = await import("path");

  const entries = await readdir(dir);
  const skills: { name: string; files: { path: string; content: string }[] }[] = [];

  for (const entry of entries) {
    const entryPath = join(dir, entry);
    const s = await stat(entryPath);
    if (!s.isDirectory()) continue;

    const files: { path: string; content: string }[] = [];
    async function walk(p: string) {
      const items = await readdir(p);
      for (const item of items) {
        const full = join(p, item);
        const st = await stat(full);
        if (st.isDirectory()) {
          await walk(full);
        } else {
          const content = await Bun.file(full).text();
          files.push({ path: relative(entryPath, full), content });
        }
      }
    }
    await walk(entryPath);
    skills.push({ name: entry, files });
  }

  return skills;
}
```

Update `packages/server/src/config.ts` to add `skillsDir`:

Add to `ServerConfig` interface:
```typescript
skillsDir?: string;
```

Add to the return object in `loadServerConfig()`:
```typescript
skillsDir: env("BLKCAT_SKILLS_DIR") ?? str(file.skillsDir),
```

Update `packages/server/src/index.ts` to pass `skillsDir` to `createServer`.

**Step 4: Run server tests**

Run: `cd /home/jinyh/blkcat-monitor && bun test packages/server`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/server/src/server.ts packages/server/src/config.ts packages/server/src/index.ts
git commit -m "feat(server): route deploy/settings messages and add /api/skills endpoint"
```

---

### Task 5: Dashboard useSettings hook

**Files:**
- Create: `packages/web/src/hooks/useSettings.ts`

**Step 1: Create the hook**

Create `packages/web/src/hooks/useSettings.ts`:

```typescript
import { useState, useEffect, useCallback, useRef } from "react";

export interface SkillInfo {
  name: string;
  files: { path: string; content: string }[];
}

export interface UseSettingsReturn {
  /** Available skills from the server's skills directory */
  availableSkills: SkillInfo[];
  loadingSkills: boolean;
  /** Fetch available skills from REST API */
  refreshSkills: () => Promise<void>;
  /** Deploy skills to a specific agent */
  deploySkills: (machineId: string, skills: SkillInfo[]) => void;
  /** Fetch settings from a specific agent */
  getSettings: (machineId: string, scope: "global" | "project", projectPath?: string) => void;
  /** Update settings on a specific agent */
  updateSettings: (machineId: string, scope: "global" | "project", settings: Record<string, unknown>, projectPath?: string) => void;
  /** Subscribe to deploy results */
  subscribeDeployResult: (cb: (msg: { requestId: string; success: boolean; error?: string }) => void) => () => void;
  /** Subscribe to settings snapshots */
  subscribeSettingsSnapshot: (cb: (msg: { machineId: string; requestId: string; settings: Record<string, unknown>; scope: string; installedPlugins?: Record<string, unknown> }) => void) => () => void;
  /** Subscribe to settings results */
  subscribeSettingsResult: (cb: (msg: { requestId: string; success: boolean; error?: string }) => void) => () => void;
}

/**
 * Hook for managing remote settings and skills deployment.
 * Sends WS messages via the provided sendFn and subscribes to results
 * via the existing useSocket message handler.
 */
export function useSettings(
  sendFn: (msg: object) => void,
): UseSettingsReturn {
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);
  const [loadingSkills, setLoadingSkills] = useState(false);

  const deployResultSubsRef = useRef(new Set<(msg: any) => void>());
  const settingsSnapshotSubsRef = useRef(new Set<(msg: any) => void>());
  const settingsResultSubsRef = useRef(new Set<(msg: any) => void>());

  const refreshSkills = useCallback(async () => {
    setLoadingSkills(true);
    try {
      const res = await fetch("/api/skills");
      if (res.ok) {
        const data = await res.json();
        setAvailableSkills(data.skills ?? []);
      }
    } catch {} finally {
      setLoadingSkills(false);
    }
  }, []);

  const deploySkills = useCallback((machineId: string, skills: SkillInfo[]) => {
    const requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    sendFn({
      type: "deploy_skills",
      machineId,
      requestId,
      skills: skills.map(s => ({ name: s.name, files: s.files })),
    });
  }, [sendFn]);

  const getSettings = useCallback((machineId: string, scope: "global" | "project", projectPath?: string) => {
    const requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const msg: Record<string, any> = { type: "get_settings", machineId, requestId, scope };
    if (projectPath) msg.projectPath = projectPath;
    sendFn(msg);
  }, [sendFn]);

  const updateSettings = useCallback((machineId: string, scope: "global" | "project", settings: Record<string, unknown>, projectPath?: string) => {
    const requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const msg: Record<string, any> = { type: "update_settings", machineId, requestId, scope, settings };
    if (projectPath) msg.projectPath = projectPath;
    sendFn(msg);
  }, [sendFn]);

  const subscribeDeployResult = useCallback((cb: (msg: any) => void) => {
    deployResultSubsRef.current.add(cb);
    return () => { deployResultSubsRef.current.delete(cb); };
  }, []);

  const subscribeSettingsSnapshot = useCallback((cb: (msg: any) => void) => {
    settingsSnapshotSubsRef.current.add(cb);
    return () => { settingsSnapshotSubsRef.current.delete(cb); };
  }, []);

  const subscribeSettingsResult = useCallback((cb: (msg: any) => void) => {
    settingsResultSubsRef.current.add(cb);
    return () => { settingsResultSubsRef.current.delete(cb); };
  }, []);

  return {
    availableSkills,
    loadingSkills,
    refreshSkills,
    deploySkills,
    getSettings,
    updateSettings,
    subscribeDeployResult,
    subscribeSettingsSnapshot,
    subscribeSettingsResult,
    // Expose notifiers for useSocket to call
    _notifyDeployResult: (msg: any) => { for (const cb of deployResultSubsRef.current) cb(msg); },
    _notifySettingsSnapshot: (msg: any) => { for (const cb of settingsSnapshotSubsRef.current) cb(msg); },
    _notifySettingsResult: (msg: any) => { for (const cb of settingsResultSubsRef.current) cb(msg); },
  } as any;
}
```

**Step 2: Wire into useSocket.ts**

In `useSocket.ts`, add message handling for the 3 new server→dashboard message types in the message handler (after `directory_listing` case around line 271):

```typescript
} else if (msg.type === "deploy_result") {
  for (const sub of deployResultSubsRef.current) sub(msg);
} else if (msg.type === "settings_snapshot") {
  for (const sub of settingsSnapshotSubsRef.current) sub(msg);
} else if (msg.type === "settings_result") {
  for (const sub of settingsResultSubsRef.current) sub(msg);
}
```

Add the subscriber refs alongside existing ones:
```typescript
const deployResultSubsRef = useRef(new Set<(msg: any) => void>());
const settingsSnapshotSubsRef = useRef(new Set<(msg: any) => void>());
const settingsResultSubsRef = useRef(new Set<(msg: any) => void>());
```

Add subscribe functions:
```typescript
const subscribeDeployResult = useCallback((cb: (msg: any) => void) => {
  deployResultSubsRef.current.add(cb);
  return () => { deployResultSubsRef.current.delete(cb); };
}, []);

const subscribeSettingsSnapshot = useCallback((cb: (msg: any) => void) => {
  settingsSnapshotSubsRef.current.add(cb);
  return () => { settingsSnapshotSubsRef.current.delete(cb); };
}, []);

const subscribeSettingsResult = useCallback((cb: (msg: any) => void) => {
  settingsResultSubsRef.current.add(cb);
  return () => { settingsResultSubsRef.current.delete(cb); };
}, []);
```

Add a `sendRaw` function to expose WS sending:
```typescript
const sendRaw = useCallback((msg: object) => {
  const ws = wsRef.current;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}, []);
```

Add all new functions to the return value and `UseSocketReturn` interface.

**Step 3: Commit**

```bash
git add packages/web/src/hooks/useSettings.ts packages/web/src/hooks/useSocket.ts
git commit -m "feat(web): add useSettings hook and wire deploy/settings WS messages"
```

---

### Task 6: Settings panel UI component

**Files:**
- Create: `packages/web/src/components/SettingsPanel.tsx`
- Modify: `packages/web/src/App.tsx`

**Step 1: Create SettingsPanel component**

Create `packages/web/src/components/SettingsPanel.tsx`. This component has 3 tabs:

**A. Skills tab** — Shows available skills from server, deploy button per machine.
**B. Plugins tab** — Toggle switches for `enabledPlugins`.
**C. Settings tab** — JSON textarea editor with save button. Hooks section shown as read-only.

The component should:
- Accept `machines` list (for target selection)
- Accept functions: `deploySkills`, `getSettings`, `updateSettings`, `refreshSkills`
- Accept `availableSkills` list
- Accept subscription functions for results
- Accept `getMachineName` for display

Key UI patterns:
- Machine selector dropdown at top
- Tab bar: Skills | Plugins | Settings
- Scope toggle: Global / Project (with path input for project scope)
- Skills tab: list of skill cards with "Deploy" button
- Plugins tab: toggle list fetched from `settings_snapshot`
- Settings tab: JSON textarea, hooks section extracted and shown separately as read-only
- Status messages for deploy/save results

**Step 2: Wire into App.tsx**

Add the SettingsPanel as a new right-panel tab option (alongside "events" and "notifications"), or as a full-page view when no session is selected.

Update the panel tab type:
```typescript
const [panelTab, setPanelTab] = useState<"events" | "notifications" | "settings" | null>(null);
```

Add a "Settings" button to the tab bar.

When `panelTab === "settings"`, render `<SettingsPanel>` with wider width (e.g., 450px instead of 320px).

Pass the necessary props from `useSocket` return values.

**Step 3: Run web tests**

Run: `cd /home/jinyh/blkcat-monitor/packages/web && bunx vitest run`
Expected: All PASS

**Step 4: Commit**

```bash
git add packages/web/src/components/SettingsPanel.tsx packages/web/src/App.tsx
git commit -m "feat(web): add SettingsPanel UI with skills manager, plugins, and settings editor"
```

---

### Task 7: Server config and integration

**Files:**
- Modify: `packages/server/src/index.ts`
- Modify: `packages/server/src/config.ts` (already done in Task 4)

**Step 1: Pass skillsDir through to createServer**

Read `packages/server/src/index.ts` and add `skillsDir` from config to the `createServer()` call.

**Step 2: Test end-to-end manually**

1. Create a test skills directory: `mkdir -p /tmp/blkcat-skills/test-skill && echo "# Test" > /tmp/blkcat-skills/test-skill/skill.md`
2. Start server with: `BLKCAT_SKILLS_DIR=/tmp/blkcat-skills bun run dev:server`
3. Start web: `bun run dev:web`
4. Verify `GET /api/skills` returns the test skill
5. Open Settings panel, verify skill appears, deploy to agent, verify files appear in `~/.claude/plugins/cache/test-skill/`
6. Test settings editor: fetch, edit model, save, verify `~/.claude/settings.json` updated with hooks preserved

**Step 3: Commit**

```bash
git add packages/server/src/index.ts
git commit -m "feat(server): wire skillsDir config for skills deployment"
```

---

### Task 8: Update README and docs

**Files:**
- Modify: `README.md`

**Step 1: Document new features**

Add to README:
- New config option: `BLKCAT_SKILLS_DIR` / `skillsDir` in server.json
- Dashboard Settings panel description
- New WS message types in protocol docs

**Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document remote skills deployment and settings management"
```
