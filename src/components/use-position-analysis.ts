import { displayedAnalysis } from "@/lib/position-evaluation";
import { useAnalysis } from "@/store/analysis";
import { useGameAnalysis } from "@/store/game-analysis";
import { useWorkspace } from "@/store/workspace";
export function usePositionAnalysis(fen: string) {
  const live = useAnalysis((state) => state.result), liveFen = useAnalysis((state) => state.fen);
  const review = useGameAnalysis((state) => state.selected), positions = useGameAnalysis((state) => state.positions);
  const gameId = useWorkspace((state) => state.imported?.game.id), path = useWorkspace((state) => state.selectedPath);
  return displayedAnalysis(fen, gameId, path, live, liveFen, review, positions);
}
