import { formatClock, sideName, type PlayerState } from "@/lib/workspace-position";
const symbols = { q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const names = { q: "queen", r: "rook", b: "bishop", n: "knight", p: "pawn" };
export function PlayerPanel({ player }: { player: PlayerState }) {
  const side = sideName[player.color], clock = formatClock(player.clock);
  return <div data-testid={`player-${player.color}`} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2" aria-label={`${side} player`}>
    <div className="min-w-0 space-y-1">
      <p className="break-words text-sm font-medium"><span role="img" aria-label={player.toMove ? `${side} to move` : `${side} waiting`} className={`mr-2 inline-block size-2 rounded-full ${player.toMove ? "bg-primary" : "border border-muted-foreground"}`} />{player.name}{player.rating !== null && <span className="text-xs text-muted-foreground"> ({player.rating})</span>}</p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span role="img" aria-label={`${side} captured: ${player.captured.length ? player.captured.map((piece) => names[piece]).join(", ") : "none"}`}><span aria-hidden="true" className="text-lg leading-none">{player.captured.map((piece) => symbols[piece]).join("") || "—"}</span></span>
        {player.advantage > 0 && <span aria-label={`${side} material advantage ${player.advantage}`} className="font-mono text-primary">+{player.advantage}</span>}
      </div>
    </div>
    <span role="img" className="max-w-[45%] shrink-0 overflow-x-auto whitespace-nowrap rounded bg-background px-2 py-1 font-mono text-sm tabular-nums" aria-label={`${side} clock: ${player.clock ? clock : "unavailable"}`}>{clock}</span>
  </div>;
}
