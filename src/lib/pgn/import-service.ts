import { gamesRepository, type GamesRepository } from "@/lib/db/games";
import type { ImportResult } from "./domain";
import { runDataTask } from "@/lib/data/client";
export { validatePgn } from "./validate";

export async function previewImport(input: string, repository: GamesRepository = gamesRepository(), signal?: AbortSignal): Promise<ImportResult> {
  // Probe storage first, then compare only the bounded candidate batch using indexes.
  await repository.page(0, 1);
  const result = await runDataTask("validate", { input, existing: [] }, signal);
  for (const key of ["validGames", "unsupportedGames"] as const) {
    const fresh = [];
    for (const candidate of result[key]) { signal?.throwIfAborted(); if (await repository.contains(candidate.game)) result.duplicateGames.push(candidate); else fresh.push(candidate); }
    result[key] = fresh;
  }
  return result;
}

export async function commitImport(result: ImportResult, repository: GamesRepository = gamesRepository()) {
  return repository.save([...result.validGames, ...result.unsupportedGames]);
}
