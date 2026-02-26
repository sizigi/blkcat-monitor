import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCwdGroupOrder } from "./useCwdGroupOrder";

beforeEach(() => {
  localStorage.clear();
});

describe("useCwdGroupOrder", () => {
  it("returns groups in default order when no saved order", () => {
    const { result } = renderHook(() => useCwdGroupOrder());
    const groups = [
      { cwdRoot: "/a", sessions: [] },
      { cwdRoot: "/b", sessions: [] },
    ];
    expect(result.current.getOrderedGroups("m1", groups)).toEqual(groups);
  });

  it("reorders groups based on saved order", () => {
    const { result } = renderHook(() => useCwdGroupOrder());

    act(() => {
      result.current.setGroupOrder("m1", ["/b", "/a"]);
    });

    const groups = [
      { cwdRoot: "/a", sessions: [] },
      { cwdRoot: "/b", sessions: [] },
    ];
    const ordered = result.current.getOrderedGroups("m1", groups);
    expect(ordered[0].cwdRoot).toBe("/b");
    expect(ordered[1].cwdRoot).toBe("/a");
  });

  it("places unknown groups at the end", () => {
    const { result } = renderHook(() => useCwdGroupOrder());

    act(() => {
      result.current.setGroupOrder("m1", ["/b"]);
    });

    const groups = [
      { cwdRoot: "/a", sessions: [] },
      { cwdRoot: "/b", sessions: [] },
      { cwdRoot: "/c", sessions: [] },
    ];
    const ordered = result.current.getOrderedGroups("m1", groups);
    expect(ordered[0].cwdRoot).toBe("/b");
    // /a and /c both have Infinity index — stable among themselves
    expect(ordered.map((g) => g.cwdRoot)).toContain("/a");
    expect(ordered.map((g) => g.cwdRoot)).toContain("/c");
  });

  it("persists to localStorage", () => {
    const { result } = renderHook(() => useCwdGroupOrder());

    act(() => {
      result.current.setGroupOrder("m1", ["/b", "/a"]);
    });

    const stored = JSON.parse(localStorage.getItem("blkcat:cwdGroupOrder")!);
    expect(stored.m1).toEqual(["/b", "/a"]);
  });

  it("handles per-machine ordering independently", () => {
    const { result } = renderHook(() => useCwdGroupOrder());

    act(() => {
      result.current.setGroupOrder("m1", ["/b", "/a"]);
      result.current.setGroupOrder("m2", ["/x", "/y"]);
    });

    const groups1 = [{ cwdRoot: "/a", sessions: [] }, { cwdRoot: "/b", sessions: [] }];
    const groups2 = [{ cwdRoot: "/y", sessions: [] }, { cwdRoot: "/x", sessions: [] }];

    expect(result.current.getOrderedGroups("m1", groups1)[0].cwdRoot).toBe("/b");
    expect(result.current.getOrderedGroups("m2", groups2)[0].cwdRoot).toBe("/x");
  });
});
