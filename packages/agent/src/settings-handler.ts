import { mkdir, rename } from "fs/promises";
import { dirname, join, resolve } from "path";

/**
 * Read and parse settings.json from the given path.
 * Returns an empty object if the file doesn't exist or parsing fails.
 */
export async function readSettings(
  settingsPath: string
): Promise<{ settings: Record<string, unknown> }> {
  try {
    const file = Bun.file(settingsPath);
    if (await file.exists()) {
      const parsed = JSON.parse(await file.text());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { settings: parsed };
      }
    }
  } catch {}
  return { settings: {} };
}

/**
 * Merge newSettings into the existing settings.json at settingsPath.
 *
 * - Strips `hooks` from incoming newSettings before merging.
 * - Preserves the existing `hooks` section unconditionally.
 * - Creates parent directories if needed.
 * - Writes atomically via temp file then rename.
 */
export async function writeSettings(
  settingsPath: string,
  newSettings: Record<string, unknown>
): Promise<void> {
  // Read existing settings
  let existing: Record<string, unknown> = {};
  try {
    const file = Bun.file(settingsPath);
    if (await file.exists()) {
      existing = JSON.parse(await file.text());
    }
  } catch {}

  // Preserve existing hooks
  const existingHooks = existing.hooks;

  // Strip hooks from incoming settings
  const { hooks: _stripped, ...cleanNewSettings } = newSettings;

  // Merge: existing spread with clean new settings
  const merged: Record<string, unknown> = { ...existing, ...cleanNewSettings };

  // Restore hooks if they existed
  if (existingHooks !== undefined) {
    merged.hooks = existingHooks;
  } else {
    // If existing had no hooks, make sure we don't introduce any
    delete merged.hooks;
  }

  // Ensure parent directory exists
  await mkdir(dirname(settingsPath), { recursive: true });

  // Write atomically: write to temp file, then rename
  const tempPath = settingsPath + ".tmp";
  await Bun.write(tempPath, JSON.stringify(merged, null, 2));
  await rename(tempPath, settingsPath);
}

/**
 * Read installed_plugins.json from the given path.
 * Returns default structure `{ version: 2, plugins: {} }` if missing.
 */
export async function readInstalledPlugins(
  pluginsPath: string
): Promise<Record<string, unknown>> {
  try {
    const file = Bun.file(pluginsPath);
    if (await file.exists()) {
      return JSON.parse(await file.text());
    }
  } catch {}
  return { version: 2, plugins: {} };
}

interface SkillFile {
  path: string;
  content: string;
}

interface Skill {
  name: string;
  files: SkillFile[];
}

interface DeploySkillsOptions {
  cacheDir: string;
  pluginsPath: string;
  skills: Skill[];
}

/**
 * Deploy skill files to disk and update installed_plugins.json.
 *
 * For each skill:
 *   - Creates `cacheDir/<skill.name>/` and writes all files (creating subdirs as needed)
 *   - Updates installed_plugins.json with an entry per skill
 */
export async function deploySkills(opts: DeploySkillsOptions): Promise<void> {
  const { cacheDir, pluginsPath, skills } = opts;

  // Read existing plugins manifest
  const manifest = (await readInstalledPlugins(pluginsPath)) as {
    version: number;
    plugins: Record<string, any>;
  };

  const now = new Date().toISOString();

  const resolvedCacheDir = resolve(cacheDir);

  for (const skill of skills) {
    // Validate skill name (no path traversal)
    if (skill.name.includes("/") || skill.name.includes("\\") || skill.name === ".." || skill.name === ".") {
      throw new Error(`Invalid skill name: ${skill.name}`);
    }
    const skillDir = join(cacheDir, skill.name);

    // Write all files for this skill
    for (const file of skill.files) {
      const filePath = join(skillDir, file.path);
      const resolvedPath = resolve(filePath);
      if (!resolvedPath.startsWith(resolvedCacheDir + "/")) {
        throw new Error(`Path traversal detected: ${file.path} resolves outside cache directory`);
      }
      await mkdir(dirname(filePath), { recursive: true });
      await Bun.write(filePath, file.content);
    }

    // Update or create plugin entry
    const existing = manifest.plugins[skill.name];
    manifest.plugins[skill.name] = {
      scope: "user",
      installPath: skillDir,
      version: "deployed",
      installedAt: existing?.installedAt ?? now,
      lastUpdated: now,
    };
  }

  // Write updated manifest
  await mkdir(dirname(pluginsPath), { recursive: true });
  await Bun.write(pluginsPath, JSON.stringify(manifest, null, 2));
}
