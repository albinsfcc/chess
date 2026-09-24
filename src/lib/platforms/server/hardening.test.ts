import { afterEach, describe, expect, it, vi } from "vitest";
import { PlatformThrottle, platformThrottle } from "./throttle";
import { handleProfile, handleLichessGames } from "./routes";
import { boundedJson } from "./upstream";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); platformThrottle.clear(); });
describe("import request hardening", () => {
  it("throttles bursts per platform and replenishes requests over time", () => {
    let now = 0; const throttle = new PlatformThrottle(() => now, 2, 1000);
    throttle.take("chesscom"); throttle.take("chesscom"); expect(() => throttle.take("chesscom")).toThrow("Too many");
    throttle.take("lichess"); now += 1000; expect(() => throttle.take("chesscom")).not.toThrow();
  });
  it("normalizes request timeouts without exposing internal details", async () => {
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(AbortSignal.abort(new DOMException("private", "TimeoutError")));
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const result = await handleProfile(new Request("http://localhost/api?username=alice"), "chesscom");
    expect(result.status).toBe(504); expect(await result.text()).not.toContain("private"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("aborts a hanging response body and rejects excessive Content-Length", async () => {
    const cancel = vi.fn(), controller = new AbortController();
    const response = new Response(new ReadableStream({ cancel })); const pending = boundedJson(response, 100, controller.signal);
    controller.abort(new DOMException("Timed out", "TimeoutError"));
    await expect(pending).rejects.toMatchObject({ name: "TimeoutError" }); expect(cancel).toHaveBeenCalled();
    await expect(boundedJson(new Response("{}", { headers: { "Content-Length": "1000" } }), 100)).rejects.toThrow("size limit");
  });
  it("rejects numeric overflow and unknown parameters before fetching", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    for (const query of ["since=Infinity", "until=999999999999999", "max=NaN", "max=1&url=http://127.0.0.1"]) expect((await handleLichessGames(new Request(`http://localhost/api?username=alice&${query}`))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
