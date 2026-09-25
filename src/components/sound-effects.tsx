"use client";
import { useEffect } from "react";
import { disposeSound, moveSound, playSound, unlockSound } from "@/lib/sound";
import { useSound } from "@/store/sound";
import { useWorkspace } from "@/store/workspace";
import { useGameAnalysis } from "@/store/game-analysis";
import { useAnalysis } from "@/store/analysis";

export function SoundEffects() {
  useEffect(() => {
    useSound.getState().hydrate();
    const click = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest('[data-testid="chessboard"]')) return;
      const button = target.closest('button, [role="button"]');
      if (button && !button.matches(':disabled, [aria-disabled="true"]')) playSound("click");
    };
    document.addEventListener("pointerdown", unlockSound, true);
    document.addEventListener("keydown", unlockSound, true);
    document.addEventListener("click", click, true);
    const offMoves = useWorkspace.subscribe((next, previous) => {
      if (next.game === previous.game || next.boardTransition === "replace") return;
      const move = next.game.moves[next.game.cursor - 1];
      if (move && (next.boardTransition === "move" || next.game.cursor === previous.game.cursor + 1)) playSound(moveSound(move.san));
    });
    const offAnalysis = useGameAnalysis.subscribe((next, previous) => {
      if (next.active?.status === "completed" && previous.active?.id === next.active.id && previous.active.status !== "completed") playSound("complete");
    });
    const offPosition = useAnalysis.subscribe((next, previous) => {
      if (!next.preferences.automatic && next.enabled && next.result && next.status === "ready" && previous.status !== "ready" && !useGameAnalysis.getState().busy) playSound("complete");
    });
    return () => {
      offMoves(); offAnalysis(); offPosition(); disposeSound();
      document.removeEventListener("pointerdown", unlockSound, true);
      document.removeEventListener("keydown", unlockSound, true);
      document.removeEventListener("click", click, true);
    };
  }, []);
  return null;
}
