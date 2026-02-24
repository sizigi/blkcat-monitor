import { describe, it, expect } from "bun:test";
import { findLatestGeminiSessionId } from "./gemini-sessions";

describe("findLatestGeminiSessionId", () => {
  it("returns null when gemini dir does not exist", () => {
    const result = findLatestGeminiSessionId("/nonexistent/path");
    expect(result).toBeNull();
  });
});
