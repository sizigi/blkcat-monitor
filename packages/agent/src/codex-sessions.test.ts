import { describe, it, expect } from "bun:test";
import { findLatestCodexSessionId } from "./codex-sessions";

describe("findLatestCodexSessionId", () => {
  it("returns null when sessions dir does not exist", () => {
    const result = findLatestCodexSessionId("/nonexistent/path");
    expect(result).toBeNull();
  });
});
