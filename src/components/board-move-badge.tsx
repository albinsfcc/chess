"use client";
import { BoardBadge } from "./board-badge";
import { MoveStrengthIcon } from "./move-strength-icon";
import type { MoveAssessment } from "@/lib/game-analysis/move-quality";

export function BoardMoveBadge({ square, orientation, assessment, san }: { square: string; orientation: "white" | "black"; assessment: MoveAssessment; san: string }) {
  return <BoardBadge square={square} orientation={orientation} testId="board-move-badge"
    title={`${san}: ${assessment.label}`} description={assessment.reason} accessibleLabel={`${san}: ${assessment.label}. ${assessment.reason}`}>
    <MoveStrengthIcon label={assessment.label} className="size-full" />
  </BoardBadge>;
}
