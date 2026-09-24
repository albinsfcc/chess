import { validateUserBranches } from "@/lib/pgn/user-variation";
import { backupSchema, BACKUP_MAX_BYTES, type LocalBackup } from "./backup-format";
import { byteLength, PGN_LIMITS } from "@/lib/pgn/limits";
import { parsePgnEntries } from "@/lib/pgn/parse";
import { normalizeGame } from "@/lib/pgn/normalize";
import { hashGame } from "@/lib/pgn/hash";
import { generatePositions, positionRange, validateAssociations } from "@/lib/game-analysis/positions";
import { configurationHash } from "@/lib/engine/configuration";
import { ENGINE_BUILD } from "@/lib/engine/domain";
import { validatePosition } from "@/lib/engine/normalize";
import { evaluationChange } from "@/lib/game-analysis/evaluation";

function unique(values: string[], name: string) { if (new Set(values).size !== values.length) throw new Error(`Backup contains duplicate ${name}.`); }
/** Reject excessive JSON nesting before JSON.parse/Zod's recursive tree validation. */
function checkJson(text: string) {
  if (text.length > BACKUP_MAX_BYTES || byteLength(text) > BACKUP_MAX_BYTES) throw new Error("Backup exceeds the 50 MB restore limit.");
  let depth = 0, quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]; if (quoted && char === "\\") { i++; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && (char === "{" || char === "[")) { if (++depth > 128) throw new Error("Backup nesting exceeds the supported limit."); }
    if (!quoted && (char === "}" || char === "]")) depth--;
  }
}
const canonical = (value: unknown): string => JSON.stringify(value, (_key, item: unknown) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
export async function validateBackup(text: string): Promise<LocalBackup> {
  checkJson(text);
  let unknown: unknown; try { unknown = JSON.parse(text); } catch { throw new Error("This file is not valid backup JSON. Existing data was not changed."); }
  const checked = backupSchema.safeParse(unknown);
  if (!checked.success) throw new Error("Unsupported backup version or invalid backup records. Use a Chess Review version 1 backup; existing data was not changed.");
  const backup = checked.data;
  unique(backup.documents.map((doc) => doc.game.id), "game IDs"); unique(backup.profiles.map((profile) => profile.platform), "platform profiles");
  unique(backup.sessions.map((session) => session.id), "session IDs"); unique(backup.positions.map((row) => row.id), "position IDs"); unique(backup.cache.map((row) => row.key), "cache keys");
  const documents = new Map(backup.documents.map((doc) => [doc.game.id, doc]));
  let totalMoves = 0;
  for (const document of backup.documents) {
    const parsed = parsePgnEntries(document.game.rawPgn);
    if (parsed.errors.length || parsed.entries.length !== 1) throw new Error("Backup contains an invalid original PGN.");
    const raw = parsed.entries[0];
    if (document.game.variant !== "Standard") raw.parsed.tags = { ...raw.parsed.tags, Variant: document.game.variant } as NonNullable<typeof raw.parsed.tags>;
    const rebuilt = await normalizeGame(raw.rawPgn, raw.parsed);
    if (canonical(rebuilt.tree) !== canonical({ ...document.tree, userBranches: undefined }) || document.game.initialFen !== document.tree.initialFen || document.game.result !== document.tree.result || (document.game.analysisStatus === "unsupported") === document.tree.playable) throw new Error("Backup game tree or supported-variant status does not match its PGN.");
    if (await hashGame(document.game, document.tree) !== document.game.normalizedPgnHash) throw new Error("Backup game identity is invalid.");
    validateUserBranches(document.tree);
    const pending = [...document.tree.mainLine, ...(document.tree.userBranches ?? []).flatMap((branch) => branch.moves)];
    while (pending.length) { const node = pending.pop()!; totalMoves++; if (totalMoves > PGN_LIMITS.moves * 10) throw new Error("Backup exceeds 200,000 total moves."); for (const branch of node.variations) pending.push(...branch); }
  }
  const sessions = new Map(backup.sessions.map((session) => [session.id, session]));
  const grouped = new Map<string, LocalBackup["positions"]>();
  for (const row of backup.positions) { const rows = grouped.get(row.analysisId) ?? []; rows.push(row); grouped.set(row.analysisId, rows); }
  for (const session of backup.sessions) {
    const document = documents.get(session.gameId); if (!document) throw new Error("Backup analysis references a missing game.");
    const positions = grouped.get(session.id) ?? [];
    const plan = positionRange(generatePositions(document.tree, session.selectedTreePath), session.configuration);
    if (session.configurationHash !== await configurationHash(session.configuration) || session.totalPositions !== plan.length || session.completedPositions !== positions.length || (session.status === "completed" && positions.length !== plan.length)) throw new Error("Backup analysis progress or configuration is inconsistent.");
    validateAssociations(session, plan, positions);
    const byPly = new Map(positions.map((row) => [row.ply, row]));
    for (const row of positions) {
      const line = row.result.lines.find((item) => item.multiPv === 1), after = byPly.get(row.ply + 1);
      const afterLine = after?.result.lines.find((item) => item.multiPv === 1);
      const scoreAfter = after?.scoreBefore ?? null;
      const change = evaluationChange(line?.score ?? null, scoreAfter, row.mover, !!(line?.lowerBound || line?.upperBound || afterLine?.lowerBound || afterLine?.upperBound));
      if (canonical(row.scoreBefore) !== canonical(line?.score ?? null) || canonical(row.scoreAfter) !== canonical(scoreAfter) || canonical(row.evaluationChange) !== canonical(change) || row.bestMoveUci !== row.result.bestMove || row.bestMoveSan !== row.result.bestMoveSan) throw new Error("Backup contains inconsistent evaluation records.");
    }
  }
  for (const row of backup.positions) if (!sessions.has(row.analysisId)) throw new Error("Backup contains an orphaned position analysis.");
  for (const cached of backup.cache) {
    const chess = validatePosition(cached.result.fen);
    if (cached.result.bestMove) {
      const uci = cached.result.bestMove;
      let san: string; try { san = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san; } catch { throw new Error("Backup contains an illegal cached best move."); }
      if (san !== cached.result.bestMoveSan) throw new Error("Backup cached move notation is inconsistent.");
    }
    const hash = await configurationHash(cached.result.config);
    if (cached.configurationHash !== hash || cached.key !== JSON.stringify([ENGINE_BUILD, cached.result.engineVersion, cached.result.fen, hash])) throw new Error("Backup cache identity is invalid.");
  }
  return backup;
}
