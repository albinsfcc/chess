import { gamesRepository, ProfilesRepository, type GamesRepository } from "@/lib/db/games";
import { cancelled, type DiscoveryGame, type PlatformProfile } from "./domain";
export { normalizePlatformGame } from "./normalize-game";

export type ImportReport = { imported: number; duplicates: number; failed: number; cancelled: boolean; errors: string[]; profile: PlatformProfile | null };
export async function importDiscovered(
  rows: DiscoveryGame[], profile: PlatformProfile, checkpoint: string | undefined, signal: AbortSignal,
  progress: (completed: number) => void, repository: GamesRepository = gamesRepository(), profiles = new ProfilesRepository(),
): Promise<ImportReport> {
  const report: ImportReport = { imported: 0, duplicates: 0, failed: 0, cancelled: false, errors: [], profile };
  let latest = profile.latestImportedGameAt ?? 0;
  for (const [index, row] of rows.entries()) {
    if (signal.aborted) { report.cancelled = true; break; }
    try {
      // One existing repository transaction per game: later failures cannot undo
      // games already imported. The repository rechecks source/ID/hash identity.
      const saved = await repository.save([{ ...row.document, game: { ...row.document.game, importedAt: new Date().toISOString() } }]);
      report.imported += saved.imported; report.duplicates += saved.duplicates;
      latest = Math.max(latest, row.playedAtMs);
    } catch (error) {
      if (cancelled(error)) { report.cancelled = true; break; }
      report.failed++; report.errors.push(`Game ${index + 1} could not be saved. Check local storage and retry.`);
    }
    progress(index + 1);
  }
  report.cancelled ||= signal.aborted;
  if (report.imported + report.duplicates > 0) {
    const now = new Date().toISOString();
    const covered = checkpoint && !report.failed && !report.cancelled;
    try {
      report.profile = await profiles.updateSync(profile, {
        lastSyncedAt: now, updatedAt: now, ...(latest ? { latestImportedGameAt: latest } : {}),
        ...(covered ? { discoveryCheckpoint: checkpoint } : {}),
      });
    } catch { report.errors.push("Games were saved, but the profile sync checkpoint could not be updated. Refresh will safely deduplicate them."); }
  }
  return report;
}

export type DiscoveryFilters = { since: string; until: string; result: string; timeCategory: string; rated: string; imported: string };
export const defaultFilters: DiscoveryFilters = { since: "", until: "", result: "all", timeCategory: "all", rated: "all", imported: "all" };
export function filterGames(rows: DiscoveryGame[], filters: DiscoveryFilters): DiscoveryGame[] {
  const since = filters.since ? Date.parse(`${filters.since}T00:00:00Z`) : 0;
  const until = filters.until ? Date.parse(`${filters.until}T23:59:59.999Z`) : Infinity;
  return rows.filter((row) => {
    const game = row.document.game;
    return (!since || row.playedAtMs >= since) && (until === Infinity || (row.playedAtMs > 0 && row.playedAtMs <= until)) &&
      (filters.result === "all" || game.result === filters.result) &&
      (filters.timeCategory === "all" || game.timeCategory === filters.timeCategory) &&
      (filters.rated === "all" || (filters.rated === "rated" ? game.rated === true : game.rated === false)) &&
      (filters.imported === "all" || row.alreadyImported === (filters.imported === "imported"));
  });
}
