import { platformThrottle } from "./throttle";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { handleArchives, handleChessMonth, handleLichessGames, handleProfile } from "./routes";
import { normalizeArchives, normalizeChessGame, normalizeLichessGame, normalizeProfile } from "./normalize";
import { retryAfter } from "./upstream";
import { bytes, platformPgn } from "../fixtures";
import { readNdjson } from "../ndjson";

beforeEach(() => platformThrottle.clear());
afterEach(() => vi.unstubAllGlobals());
const request = (query: string) => new Request(`http://localhost/api?${query}`);

describe("safe platform routes and normalization", () => {
  it("validates profiles and returns canonical identities", () => {
    expect(normalizeProfile("chesscom", { username: "Alice", player_id: 42, name: "A Player" })).toMatchObject({ platform: "chesscom", canonicalUsername: "alice", platformUserId: "42", displayName: "A Player" });
    expect(normalizeProfile("lichess", { username: "Alice", id: "alice", profile: { firstName: "Alice", lastName: "Player" } })).toMatchObject({ canonicalUsername: "alice", displayName: "Alice Player" });
    expect(() => normalizeProfile("lichess", { username: "Alice", id: "alice", disabled: true })).toThrow("closed");
    expect(() => normalizeProfile("chesscom", { username: "Alice", status: "closed:abuse" })).toThrow("closed");
  });
  it.each(["username=../../admin", "username=https://evil.test", "username=alice&url=https://evil.test", "username=alice&username=bob"])("rejects unsafe request %s without upstream access", async (query) => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await handleProfile(request(query), "chesscom")).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects invalid platform, dates, max and month parameters", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    expect((await handleProfile(request("username=alice"), "unknown")).status).toBe(400);
    expect((await handleChessMonth(request("username=alice&year=2026&month=13"))).status).toBe(400);
    expect((await handleLichessGames(request("username=alice&max=1000000"))).status).toBe(400);
    expect((await handleLichessGames(request("username=alice&since=1800000000000&until=1700000000000"))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("constructs profile URLs server-side and supplies a meaningful User-Agent", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ username: "Alice", player_id: 42 })); vi.stubGlobal("fetch", fetcher);
    const response = await handleProfile(request("username=alice"), "chesscom");
    expect(response.status).toBe(200);
    const [url, options] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://api.chess.com/pub/player/alice");
    expect(new Headers(options?.headers).get("User-Agent")).toContain("ChessReview");
    expect(options?.redirect).toBe("error");
  });
  it.each([404, 410, 429, 500])("returns sanitized errors for upstream %s", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("SECRET INTERNAL DETAILS", { status, headers: { "Retry-After": "7" } })));
    const response = await handleProfile(request("username=alice"), "chesscom");
    expect(response.status).toBe(status === 500 ? 502 : status);
    expect(await response.text()).not.toContain("SECRET");
    if (status === 429) expect(response.headers.get("Retry-After")).toBe("7");
  });
  it("sanitizes thrown network exceptions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret internal hostname")));
    const response = await handleProfile(request("username=alice"), "lichess");
    expect(response.status).toBe(502); expect(await response.text()).not.toContain("secret");
  });
  it("normalizes archive months without passing upstream URLs to clients", async () => {
    const data = { archives: ["https://api.chess.com/pub/player/alice/games/2026/09", "https://api.chess.com/pub/player/alice/games/2026/08"] };
    expect(normalizeArchives(data, "alice")).toEqual(["2026-08", "2026-09"]);
    expect(() => normalizeArchives({ archives: ["https://evil.test/pub/player/alice/games/2026/09"] }, "alice")).toThrow();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
    expect(await (await handleArchives(request("username=alice"))).json()).toEqual({ months: ["2026-08", "2026-09"] });
  });
  it("extracts stable game IDs and discards unsafe public links", () => {
    const game = normalizeChessGame({ pgn: platformPgn, url: "https://www.chess.com/game/live/123", end_time: 1700000000, rules: "chess", rated: true });
    expect(game).toMatchObject({ externalId: "live:123", source: "chesscom", playedAtMs: 1700000000000, variant: "Standard" });
    expect(normalizeChessGame({ pgn: platformPgn, url: "https://evil.test/game/live/123" }).externalUrl).toBeUndefined();
    expect(normalizeLichessGame({ id: "abcdefgh", pgn: platformPgn, variant: "atomic" })).toMatchObject({ externalId: "abcdefgh", externalUrl: "https://lichess.org/abcdefgh", variant: "atomic" });
  });
  it("keeps good monthly records when one is malformed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ games: [{ pgn: platformPgn }, { bad: true }] })));
    const response = await handleChessMonth(request("username=alice&year=2026&month=9"));
    const data = await response.json(); expect(data.games).toHaveLength(1); expect(data.warnings).toHaveLength(1);
  });
  it("streams normalized Lichess games across split chunks and malformed records", async () => {
    const raw = `${JSON.stringify({ id: "abcdefgh", pgn: platformPgn, rated: true })}\nnot-json\n${JSON.stringify({ id: "ijklmnop", pgn: platformPgn })}\n`;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes(raw))); vi.stubGlobal("fetch", fetcher);
    const response = await handleLichessGames(request("username=alice&max=10&since=1700000000000&until=1800000000000"));
    expect(response.headers.get("Content-Type")).toBe("application/x-ndjson");
    const values = []; for await (const line of readNdjson(response.body!, new AbortController().signal)) values.push(line);
    expect(values.filter((line) => "value" in line && (line.value as { type: string }).type === "game")).toHaveLength(2);
    expect(JSON.stringify(values)).toContain("Malformed record");
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.searchParams.get("pgnInJson")).toBe("true"); expect(url.searchParams.get("max")).toBe("10");
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("Accept")).toBe("application/x-ndjson");
  });
  it("supports Retry-After as delta seconds and HTTP date", () => {
    expect(retryAfter("20", 0)).toBe(20);
    expect(retryAfter("Thu, 01 Jan 1970 00:01:00 GMT", 0)).toBe(60);
    expect(retryAfter(null, 0)).toBe(60);
  });
});
