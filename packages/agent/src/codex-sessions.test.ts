import { describe, it, expect } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { findLatestCodexSessionId } from "./codex-sessions";

describe("findLatestCodexSessionId", () => {
  it("returns null when sessions dir does not exist", () => {
    const result = findLatestCodexSessionId("/nonexistent/path");
    expect(result).toBeNull();
  });

  it("extracts UUID from codex session filename", () => {
    const tmp = mkdtempSync("/tmp/codex-test-");
    const dayDir = join(tmp, "2026", "02", "27");
    mkdirSync(dayDir, { recursive: true });
    writeFileSync(
      join(dayDir, "rollout-2026-02-27T06-52-09-019c9dde-7b38-7ea1-8b24-7cf96e948aad.jsonl"),
      "",
    );
    const result = findLatestCodexSessionId(tmp);
    expect(result).toBe("019c9dde-7b38-7ea1-8b24-7cf96e948aad");
    rmSync(tmp, { recursive: true });
  });

  it("returns latest session when multiple exist", () => {
    const tmp = mkdtempSync("/tmp/codex-test-");
    const dayDir = join(tmp, "2026", "02", "27");
    mkdirSync(dayDir, { recursive: true });
    writeFileSync(
      join(dayDir, "rollout-2026-02-27T05-42-17-019c9d9e-82d5-7fc1-a24f-25889814b316.jsonl"),
      "",
    );
    writeFileSync(
      join(dayDir, "rollout-2026-02-27T06-52-09-019c9dde-7b38-7ea1-8b24-7cf96e948aad.jsonl"),
      "",
    );
    const result = findLatestCodexSessionId(tmp);
    // Reverse sort picks the later file
    expect(result).toBe("019c9dde-7b38-7ea1-8b24-7cf96e948aad");
    rmSync(tmp, { recursive: true });
  });
});
