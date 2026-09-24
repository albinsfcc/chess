import { z } from "zod";
import { PlatformError, platformSchema, usernameSchema, type Platform, type StreamEvent } from "../domain";
import { readNdjson } from "../ndjson";
import { boundedJson, upstream } from "./upstream";
import { normalizeArchives, normalizeChessGame, normalizeLichessGame, normalizeProfile } from "./normalize";

import { platformThrottle } from "./throttle";
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
function query<T>(request: Request, schema: z.ZodType<T>): T {
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => params.getAll(key).length !== 1)) throw new PlatformError("invalid_request", "Duplicate request parameters are not allowed.", 400);
  const parsed = schema.safeParse(Object.fromEntries(params));
  if (!parsed.success) throw new PlatformError("invalid_request", "Invalid username, date range, month or game limit. Check your inputs.", 400);
  return parsed.data;
}
function apiError(error: unknown): Response {
  const safe = error instanceof Error && error.name === "TimeoutError" ? new PlatformError("timeout", "The platform request timed out. Discovered games are kept; narrow the date range and retry.", 504) : error instanceof Error && error.name === "AbortError" ? new PlatformError("cancelled", "The request was cancelled.", 499) : error instanceof PlatformError ? error : new PlatformError("upstream", "The platform returned an unavailable or invalid response. Please retry.");
  return Response.json({ error: { code: safe.code, message: safe.message, retryAfterSeconds: safe.retryAfterSeconds } }, {
    status: safe.status, headers: { ...headers, ...(safe.retryAfterSeconds ? { "Retry-After": String(safe.retryAfterSeconds) } : {}) },
  });
}
async function guarded(work: () => Promise<Response>): Promise<Response> { try { return await work(); } catch (error) { return apiError(error); } }
function signal(request: Request, timeout = 30_000) { return AbortSignal.any([request.signal, AbortSignal.timeout(timeout)]); }
function playerUrl(platform: Platform, username: string): URL {
  return new URL(platform === "chesscom" ? `https://api.chess.com/pub/player/${encodeURIComponent(username)}` : `https://lichess.org/api/user/${encodeURIComponent(username)}`);
}

export function handleProfile(request: Request, platformValue: string): Promise<Response> {
  return guarded(async () => {
    const platform = platformSchema.safeParse(platformValue);
    if (!platform.success) throw new PlatformError("invalid_request", "Unknown platform.", 400);
    const { username } = query(request, z.object({ username: usernameSchema }).strict());
    platformThrottle.take(platform.data); const pending = signal(request);
    const data = await boundedJson(await upstream(playerUrl(platform.data, username), platform.data, pending), 1_000_000, pending);
    return Response.json(normalizeProfile(platform.data, data), { headers });
  });
}
export function handleArchives(request: Request): Promise<Response> {
  return guarded(async () => {
    const { username } = query(request, z.object({ username: usernameSchema }).strict());
    platformThrottle.take("chesscom"); const pending = signal(request);
    const data = await boundedJson(await upstream(new URL(`${playerUrl("chesscom", username)}/games/archives`), "chesscom", pending), 1_000_000, pending);
    return Response.json({ months: normalizeArchives(data, username) }, { headers });
  });
}
export function handleChessMonth(request: Request): Promise<Response> {
  return guarded(async () => {
    const { username, year, month } = query(request, z.object({ username: usernameSchema, year: z.coerce.number().int().min(2007).max(2100), month: z.coerce.number().int().min(1).max(12) }).strict());
    const url = new URL(`${playerUrl("chesscom", username)}/games/${year}/${String(month).padStart(2, "0")}`);
    platformThrottle.take("chesscom"); const pending = signal(request);
    const data = z.object({ games: z.array(z.unknown()).max(50_000) }).parse(await boundedJson(await upstream(url, "chesscom", pending), 20_000_000, pending));
    const games = [], warnings: string[] = [];
    for (const [index, value] of data.games.entries()) {
      try { games.push(normalizeChessGame(value)); }
      catch { if (warnings.length < 100) warnings.push(`Archive record ${index + 1} is missing valid game data or PGN and was skipped.`); }
    }
    return Response.json({ games, warnings }, { headers });
  });
}

const timestamp = z.coerce.number().int().min(1356998400070).max(4_102_444_800_000);
export function handleLichessGames(request: Request): Promise<Response> {
  return guarded(async () => {
    const options = query(request, z.object({ username: usernameSchema, since: timestamp.optional(), until: timestamp.optional(), max: z.coerce.number().int().min(1).max(1000).default(100) }).strict().refine((value) => !value.since || !value.until || value.since <= value.until));
    const url = new URL(`https://lichess.org/api/games/user/${encodeURIComponent(options.username)}`);
    for (const [key, value] of Object.entries({ since: options.since, until: options.until, max: options.max, pgnInJson: true, tags: true, moves: true, clocks: true, opening: true, evals: false, ongoing: false, finished: true, sort: "dateDesc" })) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    platformThrottle.take("lichess");
    const controller = new AbortController();
    const requestSignal = AbortSignal.any([signal(request, 180_000), controller.signal]);
    const response = await upstream(url, "lichess", requestSignal, "application/x-ndjson");
    if (!response.body) throw new PlatformError("invalid_response", "Lichess returned no game stream.");
    const body = response.body;
    async function* events(): AsyncGenerator<StreamEvent> {
      let count = 0, records = 0;
      try {
        for await (const item of readNdjson(body, requestSignal)) {
          records++;
          if ("error" in item) yield { type: "warning", message: item.error };
          else {
            try { yield { type: "game", game: normalizeLichessGame(item.value) }; count++; }
            catch { yield { type: "warning", message: `Lichess record ${item.line} has invalid game data or no PGN; skipped.` }; }
          }
          if (records >= options.max) break;
        }
        yield { type: "complete", count, limited: records >= options.max };
      } catch {
        if (requestSignal.reason instanceof Error && requestSignal.reason.name === "TimeoutError") yield { type: "warning", message: "Lichess export timed out. Discovered games are kept; narrow the date range and retry." };
        if (!requestSignal.aborted) yield { type: "warning", message: "Lichess game stream was interrupted or exceeded the size limit. Discovered games are available; narrow the range and retry." };
        yield { type: "complete", count, limited: true };
      }
    }
    const iterator = events();
    let stopped = false;
    const stream = new ReadableStream<Uint8Array>({
      async pull(sink) {
        const next = await iterator.next();
        if (stopped) return;
        if (next.done) sink.close();
        else sink.enqueue(new TextEncoder().encode(`${JSON.stringify(next.value)}\n`));
      },
      async cancel() { stopped = true; controller.abort(); await iterator.return(undefined); },
    });
    return new Response(stream, { headers: { ...headers, "Content-Type": "application/x-ndjson", "X-Content-Type-Options": "nosniff" } });
  });
}
