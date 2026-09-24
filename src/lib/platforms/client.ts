import { z } from "zod";
import { cancelled, monthSchema, PlatformError, platformName, profileSummarySchema, streamEventSchema, wireGameSchema, type DiscoveryEvent, type Platform, type PlatformAdapter } from "./domain";
import { readNdjson } from "./ndjson";
import { chessMonths, lichessSince } from "./refresh";

export function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string(), retryAfterSeconds: z.number().optional() }) });
const cooldowns = new Map<Platform, number>();

export function createAdapter(platform: Platform, fetcher: typeof fetch = fetch, wait = abortableDelay): PlatformAdapter {
  function address(action: string, values: Record<string, string | number | undefined>) {
    const params = new URLSearchParams();
    Object.entries(values).forEach(([key, value]) => { if (value !== undefined) params.set(key, String(value)); });
    return `/api/platforms/${platform}/${action}?${params}`;
  }
  async function request(action: string, values: Record<string, string | number | undefined>, signal: AbortSignal): Promise<Response> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = (cooldowns.get(platform) ?? 0) - Date.now();
      if (remaining > 300_000) throw new PlatformError("rate_limited", "The platform requested a longer cooldown. Try again later.", 429, Math.ceil(remaining / 1000));
      if (remaining > 0) await wait(remaining, signal);
      signal.throwIfAborted();
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new PlatformError("network", "You appear to be offline. Local games and saved analysis remain available; reconnect to import public games.");
      let response;
      try { response = await fetcher(address(action, values), { signal, cache: "no-store" }); }
      catch (error) { if (cancelled(error)) throw error; throw new PlatformError("network", "Network interruption. Discovered games are kept; retry when connected."); }
      if (response.ok) return response;
      const parsed = errorSchema.safeParse(await response.json().catch(() => null));
      const detail = parsed.success ? parsed.data.error : { code: "service", message: `${platformName[platform]} is unavailable. Please retry.` };
      if (response.status === 429) {
        const seconds = Math.max(1, detail.retryAfterSeconds ?? (Number(response.headers.get("Retry-After")) || 60));
        cooldowns.set(platform, Date.now() + seconds * 1000);
        if (attempt === 0 && seconds <= 300) { await wait(seconds * 1000, signal); cooldowns.delete(platform); continue; }
      }
      throw new PlatformError(detail.code, detail.message, response.status, detail.retryAfterSeconds);
    }
    throw new PlatformError("rate_limited", "Rate limit reached. Try again later.", 429);
  }
  return {
    platform,
    async lookup(username, signal) { return profileSummarySchema.parse(await (await request("profile", { username }, signal)).json()); },
    async months(username, signal) {
      if (platform !== "chesscom") return [];
      return z.object({ months: z.array(monthSchema) }).parse(await (await request("archives", { username }, signal)).json()).months;
    },
    async *discover(profile, options, signal): AsyncGenerator<DiscoveryEvent> {
      if (platform === "chesscom") {
        const available = await this.months(profile.canonicalUsername, signal);
        yield { type: "archives", months: [...available].sort() };
        const months = options.recent ? [...new Set(available)].sort().reverse() : chessMonths(available, profile, options);
        let found = 0; const seen = new Set<string>();
        let completed = 0;
        for (const month of months) {
          signal.throwIfAborted();
          yield { type: "progress", message: `Fetching ${month} · ${completed}/${months.length} months complete. Rate limits may pause this request; Cancel remains available.` };
          try {
            const [year, number] = month.split("-");
            const data = z.object({ games: z.array(wireGameSchema), warnings: z.array(z.string()) }).parse(await (await request("games", { username: profile.canonicalUsername, year, month: number }, signal)).json());
            for (const message of data.warnings) yield { type: "warning", message: `${month}: ${message}` };
            for (const game of options.recent ? [...data.games].sort((a, b) => (b.playedAtMs ?? 0) - (a.playedAtMs ?? 0)) : data.games) {
              signal.throwIfAborted();
              if (options.recent) { const key = game.externalId ?? game.pgn; if (seen.has(key)) continue; seen.add(key); }
              yield { type: "game", game }; found++;
              if (options.recent && found >= 5) { yield { type: "complete", limited: false }; return; }
            }
            completed++;
            yield { type: "progress", message: `${completed}/${months.length} archive months complete (${month}).` };
          } catch (error) {
            if (cancelled(error)) throw error;
            yield { type: "warning", message: error instanceof PlatformError ? `${month}: ${error.message}` : `${month}: invalid archive response; skipped.` };
            if (error instanceof PlatformError && error.status === 429) break;
          }
        }
        yield { type: "complete", limited: completed < months.length };
      } else {
        yield { type: "progress", message: "Streaming public games from Lichess. Rate limits may pause this request; Cancel remains available." };
        const response = await request("games", { username: profile.canonicalUsername, since: options.recent ? undefined : lichessSince(profile, options), until: options.recent ? undefined : options.until, max: options.recent ? 5 : options.max }, signal);
        if (!response.body) throw new PlatformError("service", "Lichess returned no games stream.");
        let complete = false;
        for await (const item of readNdjson(response.body, signal)) {
          if ("error" in item) { yield { type: "warning", message: item.error }; continue; }
          const event = streamEventSchema.safeParse(item.value);
          if (!event.success) { yield { type: "warning", message: "An invalid discovery record was skipped." }; continue; }
          if (event.data.type === "complete") complete = true;
          yield event.data;
        }
        if (!complete) yield { type: "warning", message: "The game stream ended early. Retry to discover remaining games." };
      }
    },
  };
}
