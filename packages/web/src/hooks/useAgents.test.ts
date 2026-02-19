import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAgents } from "./useAgents";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ agents: [] }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAgents", () => {
  it("fetches agents on mount", async () => {
    const agents = [{ address: "localhost:4000", status: "connected", source: "api" }];
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ agents }),
    });

    const { result } = renderHook(() => useAgents());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.agents).toEqual(agents);
    expect(fetchMock).toHaveBeenCalledWith("/api/agents");
  });

  it("addAgent calls POST and refreshes", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ agents: [] }) }) // initial fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) }) // POST
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          agents: [{ address: "localhost:4000", status: "connecting", source: "api" }],
        }),
      }); // refresh after POST

    const { result } = renderHook(() => useAgents());

    await waitFor(() => expect(result.current.loading).toBe(false));

    let addResult: any;
    await act(async () => {
      addResult = await result.current.addAgent("localhost:4000");
    });

    expect(addResult).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/agents", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ address: "localhost:4000" }),
    }));
    expect(result.current.agents).toHaveLength(1);
  });

  it("removeAgent calls DELETE and refreshes", async () => {
    const agents = [{ address: "localhost:4000", status: "connected", source: "api" }];
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ agents }) }) // initial fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ ok: true }) }) // DELETE
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ agents: [] }) }); // refresh after DELETE

    const { result } = renderHook(() => useAgents());

    await waitFor(() => expect(result.current.agents).toHaveLength(1));

    await act(async () => {
      await result.current.removeAgent("localhost:4000");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/agents/${encodeURIComponent("localhost:4000")}`,
      { method: "DELETE" },
    );
    expect(result.current.agents).toHaveLength(0);
  });
});
