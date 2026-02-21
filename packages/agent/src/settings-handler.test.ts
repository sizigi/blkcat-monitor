import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import {
  readSettings,
  writeSettings,
  readInstalledPlugins,
  deploySkills,
  listDeployedSkills,
  removeSkills,
} from "./settings-handler";
import { mkdtemp, rm, mkdir } from "fs/promises";
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
  let skillsDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "blkcat-deploy-test-"));
    skillsDir = join(tempDir, "skills");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("writes skill files to ~/.claude/skills/<name>/", async () => {
    await deploySkills({
      skillsDir,
      skills: [
        {
          name: "my-skill",
          files: [
            { path: "SKILL.md", content: "---\nname: my-skill\n---\n# My Skill" },
            { path: "lib/utils.js", content: "export const x = 1;" },
          ],
        },
      ],
    });

    const skillMd = await Bun.file(
      join(skillsDir, "my-skill", "SKILL.md")
    ).text();
    expect(skillMd).toContain("# My Skill");

    const utilsContent = await Bun.file(
      join(skillsDir, "my-skill", "lib", "utils.js")
    ).text();
    expect(utilsContent).toBe("export const x = 1;");
  });

  it("deploys multiple skills", async () => {
    await deploySkills({
      skillsDir,
      skills: [
        {
          name: "skill-a",
          files: [{ path: "SKILL.md", content: "# A" }],
        },
        {
          name: "skill-b",
          files: [{ path: "SKILL.md", content: "# B" }],
        },
      ],
    });

    const a = await Bun.file(join(skillsDir, "skill-a", "SKILL.md")).text();
    expect(a).toBe("# A");

    const b = await Bun.file(join(skillsDir, "skill-b", "SKILL.md")).text();
    expect(b).toBe("# B");
  });

  it("overwrites existing skill files on re-deploy", async () => {
    await deploySkills({
      skillsDir,
      skills: [
        {
          name: "my-skill",
          files: [{ path: "SKILL.md", content: "v1" }],
        },
      ],
    });

    await deploySkills({
      skillsDir,
      skills: [
        {
          name: "my-skill",
          files: [{ path: "SKILL.md", content: "v2" }],
        },
      ],
    });

    const content = await Bun.file(
      join(skillsDir, "my-skill", "SKILL.md")
    ).text();
    expect(content).toBe("v2");
  });

  it("rejects path traversal in file paths", async () => {
    await expect(
      deploySkills({
        skillsDir,
        skills: [{ name: "evil", files: [{ path: "../../etc/passwd", content: "bad" }] }],
      })
    ).rejects.toThrow("Path traversal");
  });

  it("rejects invalid skill names", async () => {
    await expect(
      deploySkills({
        skillsDir,
        skills: [{ name: "../escape", files: [{ path: "SKILL.md", content: "x" }] }],
      })
    ).rejects.toThrow("Invalid skill name");
  });
});

describe("listDeployedSkills", () => {
  let tempDir: string;
  let skillsDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "blkcat-list-test-"));
    skillsDir = join(tempDir, "skills");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("returns empty array when directory does not exist", async () => {
    const result = await listDeployedSkills(skillsDir);
    expect(result).toEqual([]);
  });

  it("returns skill names that have SKILL.md", async () => {
    // Create valid skills
    await mkdir(join(skillsDir, "detect-env"), { recursive: true });
    await Bun.write(join(skillsDir, "detect-env", "SKILL.md"), "# Detect Env");

    await mkdir(join(skillsDir, "install-bwrap"), { recursive: true });
    await Bun.write(join(skillsDir, "install-bwrap", "SKILL.md"), "# Install");

    // Create directory without SKILL.md (should be excluded)
    await mkdir(join(skillsDir, "not-a-skill"), { recursive: true });
    await Bun.write(join(skillsDir, "not-a-skill", "README.md"), "# Not a skill");

    const result = await listDeployedSkills(skillsDir);
    expect(result).toEqual(["detect-env", "install-bwrap"]);
  });

  it("returns sorted names", async () => {
    await mkdir(join(skillsDir, "zzz-skill"), { recursive: true });
    await Bun.write(join(skillsDir, "zzz-skill", "SKILL.md"), "# Z");

    await mkdir(join(skillsDir, "aaa-skill"), { recursive: true });
    await Bun.write(join(skillsDir, "aaa-skill", "SKILL.md"), "# A");

    const result = await listDeployedSkills(skillsDir);
    expect(result).toEqual(["aaa-skill", "zzz-skill"]);
  });
});

describe("removeSkills", () => {
  let tempDir: string;
  let skillsDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "blkcat-remove-test-"));
    skillsDir = join(tempDir, "skills");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("removes deployed skill directories", async () => {
    await mkdir(join(skillsDir, "skill-a"), { recursive: true });
    await Bun.write(join(skillsDir, "skill-a", "SKILL.md"), "# A");
    await mkdir(join(skillsDir, "skill-b"), { recursive: true });
    await Bun.write(join(skillsDir, "skill-b", "SKILL.md"), "# B");

    await removeSkills(skillsDir, ["skill-a"]);

    const remaining = await listDeployedSkills(skillsDir);
    expect(remaining).toEqual(["skill-b"]);
  });

  it("does not error when skill does not exist", async () => {
    await mkdir(skillsDir, { recursive: true });
    await removeSkills(skillsDir, ["nonexistent"]);
  });

  it("rejects invalid skill names", async () => {
    await mkdir(skillsDir, { recursive: true });
    await expect(
      removeSkills(skillsDir, ["../escape"])
    ).rejects.toThrow("Invalid skill name");
  });
});
