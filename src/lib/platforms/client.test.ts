import { describe, expect, it, vi } from "vitest";
import { createAdapter, abortableDelay } from "./client";
import { readNdjson } from "./ndjson";
import { chessMonths, discoveryCheckpoint, lichessSince, OVERLAP_MS } from "./refresh";
import { bytes, profileFixture, wireFixture } from "./fixtures";
import type { DiscoveryEvent, DiscoveryOptions } from "./domain";

const options: DiscoveryOptions = { full: false, max: 100 };
async function collect(generator: AsyncGenerator<DiscoveryEvent>) { const events = []; for await (const event of generator) events.push(event); return events; }

describe("platform adapters and refresh", () => {
  it("fetches Chess.com months strictly sequentially and reports completed months", async () => {
    let active = 0, peak = 0; const months: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("archives")) return Response.json({ months: ["2026-08", "2026-09"] });
      active++; peak = Math.max(peak, active); months.push(url.searchParams.get("month")!);
      await new Promise((resolve) => setTimeout(resolve, 2)); active--;
      return Response.json({ games: [wireFixture], warnings: [] });
    });
    const events = await collect(createAdapter("chesscom", fetcher).discover(profileFixture, options, new AbortController().signal));
    expect(peak).toBe(1); expect(months).toEqual(["08", "09"]);
    expect(events.filter((event) => event.type === "game")).toHaveLength(2);
    expect(JSON.stringify(events)).toContain("2/2 archive months complete");
  });
  it("waits for Retry-After before retrying a 429", async () => {
    const order: string[] = [];
    const fetcher = vi.fn<typeof fetch>().mockImplementationOnce(async () => { order.push("429"); return Response.json({ error: { code: "rate_limited", message: "Wait", retryAfterSeconds: 3 } }, { status: 429 }); })
      .mockImplementationOnce(async () => { order.push("200"); return Response.json({ platform: "chesscom", username: "Alice", canonicalUsername: "alice" }); });
    const wait = vi.fn(async (ms: number) => { expect(ms).toBe(3000); order.push("wait"); });
    await createAdapter("chesscom", fetcher, wait).lookup("alice", new AbortController().signal);
    expect(order).toEqual(["429", "wait", "200"]);
  });
  it("continues after an inaccessible month without losing valid games", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ months: ["2026-08", "2026-09"] }))
      .mockResolvedValueOnce(Response.json({ error: { code: "inaccessible", message: "Archive unavailable" } }, { status: 410 }))
      .mockResolvedValueOnce(Response.json({ games: [wireFixture], warnings: [] }));
    const events = await collect(createAdapter("chesscom", fetcher).discover(profileFixture, options, new AbortController().signal));
    expect(events.filter((event) => event.type === "game")).toHaveLength(1);
    expect(events.at(-1)).toEqual({ type: "complete", limited: true });
  });
  it("cancels before requesting the next archive", async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ months: ["2026-08", "2026-09"] })).mockResolvedValue(Response.json({ games: [wireFixture], warnings: [] }));
    const iterator = createAdapter("chesscom", fetcher).discover(profileFixture, options, controller.signal);
    await expect((async () => { for await (const event of iterator) { if (event.type === "game") controller.abort(); } })()).rejects.toMatchObject({ name: "AbortError" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("cancels a rate-limit wait promptly", async () => {
    const controller = new AbortController(); const waiting = abortableDelay(60_000, controller.signal); controller.abort();
    await expect(waiting).rejects.toMatchObject({ name: "AbortError" });
  });
  it("refetches the checkpoint month and newer months; full refresh includes history", () => {
    const profile = { ...profileFixture, discoveryCheckpoint: "2026-08-15T00:00:00.000Z" };
    const months = ["2025-12", "2026-07", "2026-08", "2026-09"];
    expect(chessMonths(months, profile, options, Date.parse("2026-09-21"))).toEqual(["2026-08", "2026-09"]);
    expect(chessMonths(months, profile, { ...options, full: true })).toEqual(months);
    expect(chessMonths(months, profileFixture, options)).toEqual(months);
  });
  it("uses a 48-hour Lichess overlap and respects explicit ranges", () => {
    const latest = Date.parse("2026-09-20T12:00:00Z");
    const profile = { ...profileFixture, latestImportedGameAt: latest, discoveryCheckpoint: "2026-09-21T00:00:00.000Z" };
    expect(lichessSince(profile, options)).toBe(latest - OVERLAP_MS);
    expect(lichessSince(profile, { ...options, full: true })).toBeUndefined();
    expect(lichessSince(profile, { ...options, since: latest })).toBe(latest);
    expect(lichessSince({ ...profileFixture, latestImportedGameAt: latest }, options)).toBe(latest - OVERLAP_MS);
  });
  it("historical discovery does not skip newer months on the next refresh", () => {
    const startedAt = "2026-09-21T10:00:00.000Z";
    const checkpoint = discoveryCheckpoint("chesscom", startedAt, { ...options, toMonth: "2026-07" });
    expect(checkpoint).toBe("2026-07-31T23:59:59.999Z");
    expect(chessMonths(["2026-07", "2026-08", "2026-09"], { ...profileFixture, discoveryCheckpoint: checkpoint }, options)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(discoveryCheckpoint("chesscom", startedAt, { ...options, toMonth: "2026-09" })).toBe(startedAt);
  });
});

describe("bounded NDJSON reader", () => {
  it("handles chunk boundaries, UTF-8, blank lines, malformed lines and a final unterminated line", async () => {
    const lines = []; for await (const line of readNdjson(bytes('{"name":"Müller"}\r\n\nbroken\n{"last":true}', [1, 2]), new AbortController().signal)) lines.push(line);
    expect(lines).toEqual([{ value: { name: "Müller" }, line: 1 }, { error: "Malformed record at line 2; skipped.", line: 2 }, { value: { last: true }, line: 3 }]);
  });
  it("aborts a pending stream read and cancels the upstream reader", async () => {
    const cancel = vi.fn(); const stream = new ReadableStream<Uint8Array>({ cancel }); const controller = new AbortController();
    const pending = readNdjson(stream, controller.signal).next(); controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" }); expect(cancel).toHaveBeenCalled();
  });
  it("enforces an upper byte bound", async () => {
    await expect(readNdjson(bytes('{"large":"data"}'), new AbortController().signal, 2).next()).rejects.toThrow("limit");
  });
});


describe("recent-five discovery", () => {
  it("requests newest Chess.com months first, stops at five, sorts and deduplicates", async () => {
    const requested: string[] = [];
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input), "http://localhost");
      if (url.pathname.endsWith("archives")) return Response.json({ months: ["2026-07", "2026-08", "2026-09"] });
      const month = url.searchParams.get("month")!; requested.push(month);
      const dates = month === "09" ? [9, 10] : [5, 6, 7, 8];
      return Response.json({ games: dates.map((date) => ({ ...wireFixture, externalId: String(date), playedAtMs: date })), warnings: [] });
    });
    const events = await collect(createAdapter("chesscom", fetcher).discover({ ...profileFixture, discoveryCheckpoint: "2026-09-23T00:00:00.000Z" }, { full: true, max: 5, recent: true }, new AbortController().signal));
    expect(requested).toEqual(["09", "08"]);
    expect(events.filter((event) => event.type === "game").map((event) => event.game.externalId)).toEqual(["10", "9", "8", "7", "6"]);
    expect(events.at(-1)).toEqual({ type: "complete", limited: false });
  });
  it("requests the latest five Lichess games without an incremental lower bound", async () => {
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const url = new URL(String(input), "http://localhost"); expect(url.searchParams.get("max")).toBe("5"); expect(url.searchParams.has("since")).toBe(false);
      return new Response(bytes(JSON.stringify({ type: "complete", count: 0, limited: false })));
    });
    const events = await collect(createAdapter("lichess", fetcher).discover({ ...profileFixture, platform: "lichess", latestImportedGameAt: Date.now() }, { full: false, max: 50, recent: true }, new AbortController().signal));
    expect(events.at(-1)).toMatchObject({ type: "complete" });
  });
});
