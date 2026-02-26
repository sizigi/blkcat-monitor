import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAttachedTerminals } from "./useAttachedTerminals";

beforeEach(() => {
  localStorage.clear();
});

describe("useAttachedTerminals", () => {
  it("attaches and detaches a terminal", () => {
    const { result } = renderHook(() => useAttachedTerminals());

    act(() => {
      result.current.attachTerminal("m1", "term1", "cli1");
    });

    expect(result.current.isAttached("m1", "term1")).toBe(true);
    expect(result.current.getAttachedTo("m1", "term1")).toBe("cli1");

    act(() => {
      result.current.detachTerminal("m1", "term1");
    });

    expect(result.current.isAttached("m1", "term1")).toBe(false);
    expect(result.current.getAttachedTo("m1", "term1")).toBeNull();
  });

  it("persists to localStorage", () => {
    const { result } = renderHook(() => useAttachedTerminals());

    act(() => {
      result.current.attachTerminal("m1", "term1", "cli1");
    });

    const stored = JSON.parse(localStorage.getItem("blkcat:attachedTerminals")!);
    expect(stored["m1:term1"]).toBe("cli1");
  });

  it("hides and shows any terminal", () => {
    const { result } = renderHook(() => useAttachedTerminals());

    act(() => {
      result.current.hideTerminal("m1", "term1");
    });

    expect(result.current.isHidden("m1", "term1")).toBe(true);

    act(() => {
      result.current.showTerminal("m1", "term1");
    });

    expect(result.current.isHidden("m1", "term1")).toBe(false);
  });

  it("hiding works independently of attach state", () => {
    const { result } = renderHook(() => useAttachedTerminals());

    // Hide a terminal that is NOT attached
    act(() => {
      result.current.hideTerminal("m1", "term1");
    });

    expect(result.current.isHidden("m1", "term1")).toBe(true);
    expect(result.current.isAttached("m1", "term1")).toBe(false);
  });

  it("getHiddenList returns all hidden keys", () => {
    const { result } = renderHook(() => useAttachedTerminals());

    act(() => {
      result.current.hideTerminal("m1", "t1");
      result.current.hideTerminal("m1", "t2");
    });

    expect(result.current.getHiddenList()).toEqual(["m1:t1", "m1:t2"]);
  });
});
