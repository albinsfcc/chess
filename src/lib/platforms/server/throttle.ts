import { PlatformError, type Platform } from "../domain";
/** Process-local courtesy limit; deployments still need infrastructure rate limiting. */
export class PlatformThrottle {
  private buckets = new Map<Platform, { tokens: number; at: number }>();
  constructor(private readonly now = Date.now, private readonly burst = 6, private readonly intervalMs = 1000) {}
  take(platform: Platform) {
    const now = this.now(), previous = this.buckets.get(platform) ?? { tokens: this.burst, at: now };
    const tokens = Math.min(this.burst, previous.tokens + Math.max(0, now - previous.at) / this.intervalMs);
    if (tokens < 1) throw new PlatformError("rate_limited", "Too many import requests. Wait briefly before refreshing again.", 429, Math.max(1, Math.ceil((1 - tokens) * this.intervalMs / 1000)));
    this.buckets.set(platform, { tokens: tokens - 1, at: now });
  }
  clear() { this.buckets.clear(); }
}
export const platformThrottle = new PlatformThrottle();
