import { afterEach, expect, it, vi } from "vitest";
import { runDataTask } from "@/lib/data/client";
import type { ThreatResult } from "@/lib/engine/threats";
import { useThreats } from "./threats";
vi.mock("@/lib/data/client", () => ({ runDataTask: vi.fn() }));
afterEach(async () => { await useThreats.getState().update(null); vi.resetAllMocks(); });
it("aborts superseded work and rejects late threat results", async () => {
  const pending: ((value: ThreatResult) => void)[] = [];
  vi.mocked(runDataTask).mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
  const old = useThreats.getState().update("old"), current = useThreats.getState().update("current");
  expect(vi.mocked(runDataTask).mock.calls[0][2]?.aborted).toBe(true);
  pending[1]({ fen: "current", threats: [], limited: false }); await current;
  pending[0]({ fen: "old", threats: [], limited: false }); await old;
  expect(useThreats.getState().result?.fen).toBe("current");
  await useThreats.getState().update(null);
  expect(useThreats.getState()).toMatchObject({ result: null, loading: false });
});
it("offers a retry after worker failure", async () => {
  vi.mocked(runDataTask).mockRejectedValueOnce(new Error("worker unavailable"));
  await useThreats.getState().update("position"); expect(useThreats.getState().error).toContain("retry");
  vi.mocked(runDataTask).mockResolvedValue({ fen: "position", threats: [], limited: false });
  await useThreats.getState().update("position"); expect(useThreats.getState()).toMatchObject({ error: null, loading: false, result: { fen: "position" } });
});
