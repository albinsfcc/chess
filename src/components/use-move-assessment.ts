import { useMemo } from "react";
import { savedMoveAssessment } from "@/lib/board-assessment";
import { useAnalysis } from "@/store/analysis";
import { useGameAnalysis } from "@/store/game-analysis";
import { useWorkspace } from "@/store/workspace";
import { useOpenings } from "@/store/openings";
import { chessAt } from "@/lib/game";
import { bookContinuation } from "@/lib/openings";
import { intrinsicAssessment } from "@/lib/game-analysis/move-quality";

export function useMoveAssessment(fen: string) {
  const gameId = useWorkspace((state) => state.imported?.game.id), path = useWorkspace((state) => state.selectedPath);
  const playable = useWorkspace((state) => state.imported?.tree.playable !== false);
  const records = useGameAnalysis((state) => state.positions);
  const index = useOpenings((state) => state.index), game = useWorkspace((state) => state.game);
  const live = useAnalysis((state) => state.assessment), liveFen = useAnalysis((state) => state.fen);
  const resultFen = useAnalysis((state) => state.result?.fen);
  const saved = useMemo(() => { void index; return savedMoveAssessment(fen, gameId, path, records); }, [fen, gameId, path, records, index]);
  const intrinsic = useMemo(() => {
    if (!playable || !game.cursor) return null;
    const before = chessAt({ ...game, cursor: game.cursor - 1 }), move = game.moves[game.cursor - 1], uci = `${move.from}${move.to}${move.promotion ?? ""}`;
    return intrinsicAssessment(before.fen(), uci, index ? bookContinuation(before.fen(), uci, index)?.name : undefined);
  }, [game, index, playable]);
  return playable ? intrinsic ?? (liveFen === fen && resultFen === fen ? live : null) ?? saved : null;
}
