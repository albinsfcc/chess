"use client";
import { useEffect, useRef } from "react";
import { assessmentSound, boardChangeSound, disposeSound, playSound, unlockSound } from "@/lib/sound";
import { positionFen } from "@/lib/game";
import { useMoveAssessment } from "./use-move-assessment";
import { useSound } from "@/store/sound";
import { useWorkspace } from "@/store/workspace";
import { useGameAnalysis } from "@/store/game-analysis";
import { useAnalysis } from "@/store/analysis";

export function SoundEffects() {
  const workspace = useWorkspace();
  const assessment = useMoveAssessment(positionFen(workspace.game));
  const previousBoard = useRef(workspace);
  const pendingAssessment = useRef(false);

  useEffect(() => {
    const previous = previousBoard.current;
    previousBoard.current = workspace;
    const effect = boardChangeSound(workspace, previous);
    const special = assessmentSound(assessment?.label);
    if (workspace.game !== previous.game) {
      pendingAssessment.current = !!effect && !(workspace.boardTransition === "navigate" && workspace.game.cursor < previous.game.cursor);
    }
    if (pendingAssessment.current && special) {
      playSound(special);
      pendingAssessment.current = false;
    } else if (effect) playSound(effect);
  }, [workspace, assessment]);

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
    const offAnalysis = useGameAnalysis.subscribe((next, previous) => {
      if (next.active?.status === "completed" && previous.active?.id === next.active.id && previous.active.status !== "completed") playSound("complete");
    });
    const offPosition = useAnalysis.subscribe((next, previous) => {
      if (!next.preferences.automatic && next.enabled && next.result && next.status === "ready" && previous.status !== "ready" && !useGameAnalysis.getState().busy) playSound("complete");
    });
    return () => {
      offAnalysis(); offPosition(); disposeSound();
      document.removeEventListener("pointerdown", unlockSound, true);
      document.removeEventListener("keydown", unlockSound, true);
      document.removeEventListener("click", click, true);
    };
  }, []);
  return null;
}
