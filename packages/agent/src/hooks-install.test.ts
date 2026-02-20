import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { installHooks, uninstallHooks } from "./hooks-install";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("installHooks", () => {
  let tempDir: string;
  let settingsPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "blkcat-hooks-test-"));
    settingsPath = join(tempDir, "settings.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("creates settings.json with hooks when file does not exist", async () => {
    await installHooks({ settingsPath, hooksPort: 3001, scriptPath: "/usr/bin/blkcat-hook.sh" });

    const settings = JSON.parse(await Bun.file(settingsPath).text());
    expect(settings.hooks).toBeDefined();
    expect(settings.hooks.PreToolUse).toBeDefined();
    expect(settings.hooks.PostToolUse).toBeDefined();
    expect(settings.hooks.SessionStart).toBeDefined();

    // Check hook structure
    const hook = settings.hooks.PreToolUse[0].hooks[0];
    expect(hook.type).toBe("command");
    expect(hook.command).toContain("blkcat-hook.sh");
    expect(hook.async).toBe(true);
  });

  it("preserves existing settings and hooks", async () => {
    await Bun.write(settingsPath, JSON.stringify({
      someOtherSetting: true,
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "echo existing" }] }
        ],
      },
    }));

    await installHooks({ settingsPath, hooksPort: 3001, scriptPath: "/usr/bin/blkcat-hook.sh" });

    const settings = JSON.parse(await Bun.file(settingsPath).text());
    expect(settings.someOtherSetting).toBe(true);
    // Existing hook preserved
    expect(settings.hooks.PreToolUse.length).toBe(2);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe("echo existing");
    // blkcat hook appended
    expect(settings.hooks.PreToolUse[1].hooks[0].command).toContain("blkcat-hook.sh");
  });

  it("is idempotent — does not duplicate hooks on second run", async () => {
    await installHooks({ settingsPath, hooksPort: 3001, scriptPath: "/usr/bin/blkcat-hook.sh" });
    await installHooks({ settingsPath, hooksPort: 3001, scriptPath: "/usr/bin/blkcat-hook.sh" });

    const settings = JSON.parse(await Bun.file(settingsPath).text());
    // Each event should have exactly one blkcat hook entry
    expect(settings.hooks.PreToolUse.length).toBe(1);
    expect(settings.hooks.SessionStart.length).toBe(1);
  });

  it("sets BLKCAT_HOOKS_PORT in hook command", async () => {
    await installHooks({ settingsPath, hooksPort: 4567, scriptPath: "/usr/bin/blkcat-hook.sh" });

    const settings = JSON.parse(await Bun.file(settingsPath).text());
    const hook = settings.hooks.PreToolUse[0].hooks[0];
    expect(hook.command).toContain("BLKCAT_HOOKS_PORT=4567");
  });
});

describe("uninstallHooks", () => {
  let tempDir: string;
  let settingsPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "blkcat-hooks-test-"));
    settingsPath = join(tempDir, "settings.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true });
  });

  it("removes blkcat hooks but preserves user hooks", async () => {
    await Bun.write(settingsPath, JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: "Bash", hooks: [{ type: "command", command: "echo user" }] },
          { matcher: "", hooks: [{ type: "command", command: "BLKCAT_HOOKS_PORT=3001 /usr/bin/blkcat-hook.sh" }] },
        ],
        SessionStart: [
          { matcher: "", hooks: [{ type: "command", command: "BLKCAT_HOOKS_PORT=3001 /usr/bin/blkcat-hook.sh" }] },
        ],
      },
    }));

    await uninstallHooks({ settingsPath, scriptPath: "/usr/bin/blkcat-hook.sh" });

    const settings = JSON.parse(await Bun.file(settingsPath).text());
    expect(settings.hooks.PreToolUse.length).toBe(1);
    expect(settings.hooks.PreToolUse[0].hooks[0].command).toBe("echo user");
    expect(settings.hooks.SessionStart).toBeUndefined();
  });
});
