import Image from "next/image";
import { BoardBadge } from "./board-badge";
import type { GameEndBadge, GameEndKind } from "@/lib/board-game-end";

const titles: Record<GameEndKind, string> = {
  winner: "Winner", resignation: "Resignation", checkmate: "Checkmate", timeout: "Timeout", loss: "Defeat", draw: "Draw",
};

export function BoardGameEndBadges({ badges, orientation }: { badges: GameEndBadge[]; orientation: "white" | "black" }) {
  return badges.map(badge => <BoardBadge key={`${badge.side}:${badge.square}:${badge.kind}`} square={badge.square} orientation={orientation}
    testId="board-game-end-badge" kind={badge.kind} title={titles[badge.kind]} description={badge.description} accessibleLabel={badge.description}>
    <Image src={`/icons/game-end/${badge.kind}.svg`} width={32} height={32} alt="" aria-hidden="true" draggable={false} unoptimized className="size-full" />
  </BoardBadge>);
}
