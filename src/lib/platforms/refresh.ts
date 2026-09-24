import type { DiscoveryOptions, PlatformProfile } from "./domain";

export const OVERLAP_MS = 48 * 60 * 60 * 1000;
export function discoveryCheckpoint(platform: PlatformProfile["platform"], startedAt: string, options: DiscoveryOptions): string {
  // A historical upper bound must not mark newer archive months as covered.
  if (platform !== "chesscom" || !options.toMonth) return startedAt;
  const rangeEnd = new Date(Date.UTC(Number(options.toMonth.slice(0, 4)), Number(options.toMonth.slice(5, 7)), 0, 23, 59, 59, 999)).toISOString();
  return rangeEnd < startedAt ? rangeEnd : startedAt;
}
export function chessMonths(months: string[], profile: PlatformProfile, options: DiscoveryOptions, now = Date.now()): string[] {
  const checkpoint = !options.full && profile.discoveryCheckpoint ? profile.discoveryCheckpoint.slice(0, 7) : undefined;
  const current = new Date(now).toISOString().slice(0, 7);
  return [...new Set(months)].sort().filter((month) =>
    (!options.fromMonth || month >= options.fromMonth) && (!options.toMonth || month <= options.toMonth) &&
    (!checkpoint || month >= checkpoint || month === current));
}
export function lichessSince(profile: PlatformProfile, options: DiscoveryOptions): number | undefined {
  const boundary = profile.latestImportedGameAt;
  const recent = !options.full && boundary ? Math.max(1356998400070, boundary - OVERLAP_MS) : undefined;
  return options.since === undefined ? recent : Math.max(options.since, recent ?? options.since);
}
