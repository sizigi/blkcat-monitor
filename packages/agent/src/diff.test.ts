import { describe, it, expect } from "bun:test";
import { hasChanged } from "./diff";

describe("hasChanged", () => {
  it("returns true when lines differ", () => {
    expect(hasChanged(["a", "b"], ["a", "c"])).toBe(true);
  });

  it("returns false when lines are identical", () => {
    expect(hasChanged(["a", "b"], ["a", "b"])).toBe(false);
  });

  it("returns true when length differs", () => {
    expect(hasChanged(["a"], ["a", "b"])).toBe(true);
  });

  it("returns true when prev is empty", () => {
    expect(hasChanged([], ["a"])).toBe(true);
  });
});
