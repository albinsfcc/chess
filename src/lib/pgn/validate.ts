import type { ImportCandidate, ImportResult } from "./domain";
import { identityKeys, isDuplicate, type GameIdentity } from "./hash";
import { normalizeGame } from "./normalize";
import { errorMessage, parsePgnEntries } from "./parse";

export async function validatePgn(input: string, existing: GameIdentity[] = []): Promise<ImportResult> {
  const parsed = parsePgnEntries(input);
  const result: ImportResult = {
    validGames: [], duplicateGames: [], unsupportedGames: [],
    invalidEntries: [...parsed.errors], parseErrors: parsed.errors,
  };
  const known = new Set(existing.flatMap(identityKeys));
  for (const entry of parsed.entries) {
    try {
      const document = await normalizeGame(entry.rawPgn, entry.parsed);
      const candidate: ImportCandidate = { ...document, entryIndex: entry.entryIndex };
      if (isDuplicate(document.game, known)) result.duplicateGames.push(candidate);
      else {
        identityKeys(document.game).forEach((key) => known.add(key));
        (document.tree.playable ? result.validGames : result.unsupportedGames).push(candidate);
      }
    } catch (error) {
      result.invalidEntries.push({ entryIndex: entry.entryIndex, rawPgn: entry.rawPgn, message: errorMessage(error), line: entry.startLine });
    }
    // Yield between games so a multi-game validation does not monopolize the UI.
    if (entry.entryIndex % 10 === 0) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  result.invalidEntries.sort((a, b) => a.entryIndex - b.entryIndex);
  return result;
}

