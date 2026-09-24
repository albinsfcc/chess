import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DataRequest, DataResponse } from "./protocol";
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: { data: DataResponse }) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  postMessage = vi.fn<(value: DataRequest) => void>(); terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  reply() { const request = this.postMessage.mock.calls.at(-1)![0]; this.onmessage?.({ data: { id: request.id, ok: true, value: { validGames: [], duplicateGames: [], unsupportedGames: [], invalidEntries: [], parseErrors: [] } } }); }
}
beforeEach(() => { vi.resetModules(); vi.useFakeTimers(); FakeWorker.instances = []; vi.stubGlobal("Worker", FakeWorker); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("bounded data worker lifecycle", () => {
  it("serializes work, cancels safely and rejects stale worker errors", async () => {
    const { runDataTask } = await import("./client"), controller = new AbortController();
    const first = runDataTask("validate", { input: "*", existing: [] }, controller.signal);
    const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const second = runDataTask("validate", { input: "*", existing: [] });
    expect(FakeWorker.instances).toHaveLength(1); expect(FakeWorker.instances[0].postMessage).toHaveBeenCalledTimes(1);
    controller.abort(); await rejected; expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    FakeWorker.instances[0].onerror?.(); FakeWorker.instances[0].reply();
    FakeWorker.instances[1].reply(); await expect(second).resolves.toMatchObject({ validGames: [] });
    vi.advanceTimersByTime(5000); expect(FakeWorker.instances[1].terminate).toHaveBeenCalledOnce();
  });
  it("times out a stuck parser and permits a fresh retry", async () => {
    const { runDataTask } = await import("./client");
    const rejected = expect(runDataTask("validate", { input: "*", existing: [] })).rejects.toThrow("timed out");
    vi.advanceTimersByTime(60_000); await rejected;
    const retry = runDataTask("validate", { input: "*", existing: [] }); FakeWorker.instances[1].reply(); await expect(retry).resolves.toMatchObject({ validGames: [] });
  });
});
