import { PlatformError, platformName, type Platform } from "../domain";

export function retryAfter(value: string | null, now = Date.now()): number {
  if (!value) return 60;
  if (/^\d+$/.test(value)) return Number.isSafeInteger(Number(value)) ? Math.max(1, Number(value)) : 60;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(1, Math.ceil((date - now) / 1000)) : 60;
}

export async function upstream(url: URL, platform: Platform, signal: AbortSignal, accept = "application/json", fetcher: typeof fetch = fetch): Promise<Response> {
  signal.throwIfAborted();
  let response: Response;
  try {
    response = await fetcher(url, { signal, cache: "no-store", redirect: "error",
      headers: { Accept: accept, "User-Agent": "ChessReview/0.3 (local-first public-game importer; no account credentials)" } });
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof PlatformError) throw error;
    throw new PlatformError("network", `${platformName[platform]} could not be reached. Try again shortly.`);
  }
  if (response.ok) return response;
  const name = platformName[platform];
  const status = response.status;
  await response.body?.cancel();
  if (status === 404) throw new PlatformError("not_found", `${name}: username or games not found. Check the username.`, 404);
  if (status === 410 || status === 403) throw new PlatformError("inaccessible", `${name}: this account or archive is closed or inaccessible.`, status);
  if (status === 429) {
    const seconds = retryAfter(response.headers.get("retry-after"));
    throw new PlatformError("rate_limited", `${name} rate limit reached. Retry after ${seconds} seconds.`, 429, seconds);
  }
  throw new PlatformError("upstream", `${name} is temporarily unavailable. Please try again later.`, 502);
}

export async function boundedJson(response: Response, limit = 20_000_000, signal?: AbortSignal): Promise<unknown> {
  if (!response.body) throw new PlatformError("invalid_response", "The platform returned an empty response.");
  if (Number(response.headers.get("Content-Length")) > limit) { await response.body.cancel(); throw new PlatformError("too_large", "The platform response exceeds the size limit."); }
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder();
  let length = 0, text = "";
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read(); signal?.throwIfAborted(); if (done) break;
      length += value.byteLength;
      if (length > limit) throw new PlatformError("too_large", "This archive is too large for one request. Try a smaller date range.");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    try { return JSON.parse(text); }
    catch { throw new PlatformError("invalid_response", "The platform returned an invalid response. Try again later."); }
  } catch (error) { signal?.throwIfAborted(); throw error; }
  finally { signal?.removeEventListener("abort", cancel); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
