import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  readSettings,
  writeSettings,
  readInstalledPlugins,
  deploySkills,
} from "./settings-handler";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("readSettings", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "blkcat-settings-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("reads and parses existing settings file", async () => {
    const settingsPath = join(tempDir, "settings.json");
    await Bun.write(
      settingsPath,
      JSON.stringify({ theme: "dark", verbose: true })
    );

    const result = await readSettings(settingsPath);
    expect(result.settings).toEqual({ theme: "dark", verbose: true });
  });

  it("returns empty object when file does not exist", async () => {
    const settingsPath = join(tempDir, "nonexistent.json");

    const result = await readSettings(settingsPath);
    expect(result.settings).toEqual({});
  });

  it("returns empty object when file contains invalid JSON", async () => {
    const settingsPath = join(tempDir, "settings.json");
    await Bun.write(settingsPath, "not valid json {{{");

    const result = await readSettings(settingsPath);
    expect(result.settings).toEqual({});
  });
});

describe("writeSettings", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "blkcat-settings-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("merges new settings into existing file", async () => {
    const settingsPath = join(tempDir, "settings.json");
    await Bun.write(
      settingsPath,
      JSON.stringify({ theme: "dark", fontSize: 14 })
    );

    await writeSettings(settingsPath, { fontSize: 16, newOption: true });

    const result = JSON.parse(await Bun.file(settingsPath).text());
    expect(result.theme).toBe("dark");
    expect(result.fontSize).toBe(16);
    expect(result.newOption).toBe(true);
  });

  it("preserves hooks section unconditionally", async () => {
    const settingsPath = join(tempDir, "settings.json");
    const existingHooks = {
      PreToolUse: [
        {
          matcher: "Bash",
          hooks: [{ type: "command", command: "echo existing" }],
        },
      ],
    };
    await Bun.write(
      settingsPath,
      JSON.stringify({ theme: "dark", hooks: existingHooks })
    );

    // Attempt to overwrite hooks via newSettings
    await writeSettings(settingsPath, {
      theme: "light",
      hooks: { PreToolUse: [] },
    });

    const result = JSON.parse(await Bun.file(settingsPath).text());
    expect(result.theme).toBe("light");
    // Hooks must be preserved from original, not overwritten
    expect(result.hooks).toEqual(existingHooks);
  });

  it("strips hooks from incoming newSettings before merging", async () => {
    const settingsPath = join(tempDir, "settings.json");
    await Bun.write(settingsPath, JSON.stringify({ theme: "dark" }));

    await writeSettings(settingsPath, {
      verbose: true,
      hooks: { Stop: [] },
    });

    const result = JSON.parse(await Bun.file(settingsPath).text());
    expect(result.verbose).toBe(true);
    // No hooks should be written since the original had none
    // and the incoming hooks should have been stripped
    expect(result.hooks).toBeUndefined();
  });

  it("creates parent directory and file if missing", async () => {
    const settingsPath = join(tempDir, "nested", "dir", "settings.json");

    await writeSettings(settingsPath, { created: true });

    const result = JSON.parse(await Bun.file(settingsPath).text());
    expect(result.created).toBe(true);
  });

  it("creates file with settings when file does not exist", async () => {
    const settingsPath = join(tempDir, "new-settings.json");

    await writeSettings(settingsPath, { brand: "new" });

    const result = JSON.parse(await Bun.file(settingsPath).text());
    expect(result.brand).toBe("new");
  });
});

describe("readInstalledPlugins", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "blkcat-plugins-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("reads existing installed_plugins.json", async () => {
    const pluginsPath = join(tempDir, "installed_plugins.json");
    const existing = {
      version: 2,
      plugins: {
        "my-plugin": { scope: "user", version: "1.0.0" },
      },
    };
    await Bun.write(pluginsPath, JSON.stringify(existing));

    const result = await readInstalledPlugins(pluginsPath);
    expect(result).toEqual(existing);
  });

  it("returns default structure when file is missing", async () => {
    const pluginsPath = join(tempDir, "nonexistent.json");

    const result = await readInstalledPlugins(pluginsPath);
    expect(result).toEqual({ version: 2, plugins: {} });
  });
});

describe("deploySkills", () => {
  let tempDir: string;
  let cacheDir: string;
  let pluginsPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "blkcat-deploy-test-"));
    cacheDir = join(tempDir, "cache");
    pluginsPath = join(tempDir, "installed_plugins.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("writes skill files to correct directories", async () => {
    await deploySkills({
      cacheDir,
      pluginsPath,
      skills: [
        {
          name: "my-skill",
          files: [
            { path: "index.js", content: "console.log('hello');" },
            { path: "lib/utils.js", content: "export const x = 1;" },
          ],
        },
      ],
    });

    const indexContent = await Bun.file(
      join(cacheDir, "my-skill", "index.js")
    ).text();
    expect(indexContent).toBe("console.log('hello');");

    const utilsContent = await Bun.file(
      join(cacheDir, "my-skill", "lib", "utils.js")
    ).text();
    expect(utilsContent).toBe("export const x = 1;");
  });

  it("updates installed_plugins.json with skill entries", async () => {
    await deploySkills({
      cacheDir,
      pluginsPath,
      skills: [
        {
          name: "skill-a",
          files: [{ path: "main.ts", content: "// skill a" }],
        },
        {
          name: "skill-b",
          files: [{ path: "main.ts", content: "// skill b" }],
        },
      ],
    });

    const plugins = JSON.parse(await Bun.file(pluginsPath).text());
    expect(plugins.version).toBe(2);
    expect(plugins.plugins["skill-a"]).toBeDefined();
    expect(plugins.plugins["skill-a"].scope).toBe("user");
    expect(plugins.plugins["skill-a"].installPath).toBe(
      join(cacheDir, "skill-a")
    );
    expect(plugins.plugins["skill-a"].version).toBe("deployed");
    expect(plugins.plugins["skill-a"].installedAt).toBeDefined();
    expect(plugins.plugins["skill-a"].lastUpdated).toBeDefined();

    expect(plugins.plugins["skill-b"]).toBeDefined();
    expect(plugins.plugins["skill-b"].installPath).toBe(
      join(cacheDir, "skill-b")
    );
  });

  it("handles overwrites by updating existing skills", async () => {
    // First deploy
    await deploySkills({
      cacheDir,
      pluginsPath,
      skills: [
        {
          name: "my-skill",
          files: [{ path: "index.js", content: "v1" }],
        },
      ],
    });

    const firstPlugins = JSON.parse(await Bun.file(pluginsPath).text());
    const firstInstalledAt = firstPlugins.plugins["my-skill"].installedAt;

    // Small delay to ensure timestamps differ
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Second deploy — overwrite
    await deploySkills({
      cacheDir,
      pluginsPath,
      skills: [
        {
          name: "my-skill",
          files: [{ path: "index.js", content: "v2" }],
        },
      ],
    });

    const content = await Bun.file(
      join(cacheDir, "my-skill", "index.js")
    ).text();
    expect(content).toBe("v2");

    const plugins = JSON.parse(await Bun.file(pluginsPath).text());
    // installedAt should be preserved from first deploy
    expect(plugins.plugins["my-skill"].installedAt).toBe(firstInstalledAt);
    // lastUpdated should be newer
    expect(plugins.plugins["my-skill"].lastUpdated).not.toBe(firstInstalledAt);
  });

  it("preserves existing plugins in installed_plugins.json", async () => {
    // Write pre-existing plugins
    await Bun.write(
      pluginsPath,
      JSON.stringify({
        version: 2,
        plugins: {
          "existing-plugin": {
            scope: "user",
            installPath: "/some/path",
            version: "1.0.0",
            installedAt: "2024-01-01T00:00:00.000Z",
            lastUpdated: "2024-01-01T00:00:00.000Z",
          },
        },
      })
    );

    await deploySkills({
      cacheDir,
      pluginsPath,
      skills: [
        {
          name: "new-skill",
          files: [{ path: "index.js", content: "new" }],
        },
      ],
    });

    const plugins = JSON.parse(await Bun.file(pluginsPath).text());
    expect(plugins.plugins["existing-plugin"]).toBeDefined();
    expect(plugins.plugins["existing-plugin"].version).toBe("1.0.0");
    expect(plugins.plugins["new-skill"]).toBeDefined();
  });

  it("rejects path traversal in file paths", async () => {
    await expect(
      deploySkills({
        cacheDir,
        pluginsPath,
        skills: [{ name: "evil", files: [{ path: "../../etc/passwd", content: "bad" }] }],
      })
    ).rejects.toThrow("Path traversal");
  });

  it("rejects invalid skill names", async () => {
    await expect(
      deploySkills({
        cacheDir,
        pluginsPath,
        skills: [{ name: "../escape", files: [{ path: "a.md", content: "x" }] }],
      })
    ).rejects.toThrow("Invalid skill name");
  });
});
