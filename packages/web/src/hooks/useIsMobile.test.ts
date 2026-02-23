import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIsMobile } from "./useIsMobile";

describe("useIsMobile", () => {
  let listeners: Array<(e: { matches: boolean }) => void>;
  let matchesMock: boolean;

  beforeEach(() => {
    listeners = [];
    matchesMock = false;
    vi.stubGlobal("matchMedia", vi.fn((query: string) => ({
      matches: matchesMock,
      media: query,
      addEventListener: (_: string, cb: any) => { listeners.push(cb); },
      removeEventListener: (_: string, cb: any) => {
        listeners = listeners.filter((l) => l !== cb);
      },
    })));
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns false when viewport is wider than 768px", () => {
    matchesMock = false;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it("returns true when viewport is 768px or narrower", () => {
    matchesMock = true;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it("updates when media query changes", () => {
    matchesMock = false;
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      listeners.forEach((cb) => cb({ matches: true }));
    });
    expect(result.current).toBe(true);
  });
});
