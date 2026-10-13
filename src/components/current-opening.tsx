"use client";
import { useEffect, useMemo } from "react";
import { BookOpen } from "lucide-react";
import { openingHistory } from "@/lib/openings";
import { useOpenings } from "@/store/openings";
import { useWorkspace } from "@/store/workspace";

export function CurrentOpening() {
  const { index, load, loading, error } = useOpenings();
  const game = useWorkspace(state => state.game);
  const playable = useWorkspace(state => state.imported?.tree.playable !== false);
  useEffect(() => { void load(); }, [load]);
  const history = useMemo(() => index && playable ? openingHistory(game, index) : null, [game, index, playable]);
  if (!playable) return null;
  const name = history?.match?.name;
  const colon = name?.indexOf(":") ?? -1;
  return <div className="current-opening" aria-label="Current opening" aria-live="polite">
    <BookOpen size={16} aria-hidden="true" />
    <div>{name ? <>
      <p><span className="opening-eco">{history!.match!.eco}</span> {colon < 0 ? name : name.slice(0, colon)}</p>
      {colon >= 0 && <p className="opening-variation">{name.slice(colon + 1).trim()}</p>}
      {!history!.current && <span className="opening-note">Last recognized · ply {history!.matchedPly}</span>}
    </> : <p className="opening-note">{!game.cursor ? "Starting position" : loading ? "Identifying opening…" : error ? "Opening database unavailable" : "No named opening yet"}</p>}</div>
  </div>;
}
