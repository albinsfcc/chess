import { useMemo } from "react";
import { savedMoveAssessment } from "@/lib/board-assessment";
import { useAnalysis } from "@/store/analysis";
import { useGameAnalysis } from "@/store/game-analysis";
import { useWorkspace } from "@/store/workspace";

export function useMoveAssessment(fen: string) {
  const gameId = useWorkspace((state) => state.imported?.game.id), path = useWorkspace((state) => state.selectedPath);
  const playable = useWorkspace((state) => state.imported?.tree.playable !== false);
  const records = useGameAnalysis((state) => state.positions);
  const live = useAnalysis((state) => state.assessment), liveFen = useAnalysis((state) => state.fen);
  const resultFen = useAnalysis((state) => state.result?.fen);
  const saved = useMemo(() => savedMoveAssessment(fen, gameId, path, records), [fen, gameId, path, records]);
  return playable ? (liveFen === fen && resultFen === fen ? live : null) ?? saved : null;
}
