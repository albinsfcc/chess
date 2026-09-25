import { gamesRepository } from "@/lib/db/games";
import type { GameDocument } from "@/lib/pgn/domain";
import { useWorkspace } from "./workspace";
import { useReviewDialog } from "./game-review";
import { useGameAnalysis } from "./game-analysis";
/** Reopen the persisted identity, including a previously imported game's local branches. */
export async function reviewImportedGame(document: GameDocument, isCurrent: () => boolean = () => true) {
  const saved = await gamesRepository().findIdentity(document.game);
  if (!isCurrent()) return;
  if (!saved) throw new Error("The game could not be found in local storage. Open the library and retry.");
  if (!saved.tree.playable) return;
  if (useGameAnalysis.getState().busy) await useGameAnalysis.getState().pause();
  if (!isCurrent()) return;
  useWorkspace.getState().openGame(saved);
  useReviewDialog.setState({automaticGameId: saved.game.id, pendingGameId: saved.game.id});
}
