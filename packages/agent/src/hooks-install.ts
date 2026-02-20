const HOOK_EVENTS = [
  "SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse",
  "PostToolUseFailure", "Notification", "SubagentStart", "SubagentStop",
  "Stop", "SessionEnd", "PermissionRequest", "TeammateIdle",
  "TaskCompleted", "ConfigChange", "PreCompact",
];

interface InstallOptions {
  settingsPath: string;
  hooksPort: number;
  scriptPath: string;
}

interface UninstallOptions {
  settingsPath: string;
  scriptPath: string;
}

function isBlkcatHook(entry: any, scriptPath: string): boolean {
  if (!entry?.hooks || !Array.isArray(entry.hooks)) return false;
  return entry.hooks.some((h: any) => typeof h.command === "string" && h.command.includes(scriptPath));
}

export async function installHooks(opts: InstallOptions): Promise<void> {
  const { settingsPath, hooksPort, scriptPath } = opts;

  let settings: Record<string, any> = {};
  try {
    const file = Bun.file(settingsPath);
    if (await file.exists()) {
      settings = JSON.parse(await file.text());
    }
  } catch {}

  if (!settings.hooks) settings.hooks = {};

  const command = `BLKCAT_HOOKS_PORT=${hooksPort} ${scriptPath}`;

  for (const eventName of HOOK_EVENTS) {
    if (!settings.hooks[eventName]) {
      settings.hooks[eventName] = [];
    }

    const entries: any[] = settings.hooks[eventName];
    const existingIdx = entries.findIndex((e) => isBlkcatHook(e, scriptPath));

    const blkcatEntry = {
      matcher: "",
      hooks: [
        {
          type: "command",
          command,
          timeout: 10,
          async: true,
        },
      ],
    };

    if (existingIdx >= 0) {
      // Update existing entry in place
      entries[existingIdx] = blkcatEntry;
    } else {
      // Append new entry
      entries.push(blkcatEntry);
    }
  }

  await Bun.write(settingsPath, JSON.stringify(settings, null, 2));
}

export async function uninstallHooks(opts: UninstallOptions): Promise<void> {
  const { settingsPath, scriptPath } = opts;

  let settings: Record<string, any> = {};
  try {
    const file = Bun.file(settingsPath);
    if (await file.exists()) {
      settings = JSON.parse(await file.text());
    }
  } catch {
    return;
  }

  if (!settings.hooks) return;

  for (const eventName of Object.keys(settings.hooks)) {
    const entries: any[] = settings.hooks[eventName];
    if (!Array.isArray(entries)) continue;

    const filtered = entries.filter((e) => !isBlkcatHook(e, scriptPath));
    if (filtered.length > 0) {
      settings.hooks[eventName] = filtered;
    } else {
      delete settings.hooks[eventName];
    }
  }

  // Clean up empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  await Bun.write(settingsPath, JSON.stringify(settings, null, 2));
}
