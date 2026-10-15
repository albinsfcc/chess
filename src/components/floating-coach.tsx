"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Volume2, VolumeX, RotateCcw, Sparkles } from "lucide-react";
import { useWorkspace } from "@/store/workspace";
import { useAnalysis } from "@/store/analysis";
import { useGameAnalysis } from "@/store/game-analysis";
import { useComputer } from "@/store/computer";
import { useCoach } from "@/store/coach";
import { coachById } from "@/lib/coach-personas";
import { positionFen } from "@/lib/game";
import { classifyMove } from "@/lib/game-analysis/move-quality";
import { moveCommentary } from "@/lib/move-commentary";
import { connectCoachSpeech, speakCoach, stopCoachSpeech, useCoachSpeech } from "@/lib/coach-speech";
import { displayedAnalysis } from "@/lib/position-evaluation";
import { CoachAvatar } from "./coach-avatar";
import { Button } from "./ui/button";
import "./floating-coach.css";

export function FloatingCoach({ onExplain, hidden = false }: { onExplain: () => void; hidden?: boolean }) {
  const { game, imported, selectedPath } = useWorkspace();
  const analysis = useAnalysis(), review = useGameAnalysis(), computer = useComputer();
  const { preferences, hydrate, update } = useCoach();
  const { supported, speaking, error } = useCoachSpeech();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const activated = useRef(false);
  const fen = positionFen(game), previousFen = game.cursor ? positionFen({ ...game, cursor: game.cursor - 1 }) : undefined;
  const key = `${imported?.game.id ?? game.initialFen}:${selectedPath.join(".")}:${game.cursor}:${fen}`;
  const available = !computer.active || computer.assisted || !!computer.result;
  const visible = preferences.enabled && available && !hidden;
  const open = dismissed !== key;
  const coach = coachById(preferences.avatar);
  const assessment = useMemo(() => {
    if (!previousFen) return null;
    if (computer.active && available) return computer.feedback[game.cursor]?.assessment ?? null;
    if (analysis.fen === fen && analysis.result?.fen === fen && analysis.status === "ready" && analysis.assessment) return analysis.assessment;
    const before = displayedAnalysis(previousFen, imported?.game.id, selectedPath.slice(0, -1), null, null, review.selected, review.positions);
    const after = displayedAnalysis(fen, imported?.game.id, selectedPath, null, null, review.selected, review.positions);
    const move = game.moves[game.cursor - 1];
    return before && after ? classifyMove(before, after, `${move.from}${move.to}${move.promotion ?? ""}`) : null;
  }, [previousFen, computer.active, computer.feedback, available, game, analysis.fen, analysis.result, analysis.status, analysis.assessment, fen, imported?.game.id, selectedPath, review.selected, review.positions]);
  const comment = useMemo(() => moveCommentary(fen, previousFen, assessment, preferences.avatar), [fen, previousFen, assessment, preferences.avatar]);
  useEffect(() => { hydrate(); return connectCoachSpeech(); }, [hydrate]);
  useEffect(() => {
    const activate = () => { activated.current = true; };
    document.addEventListener("pointerdown", activate, true); document.addEventListener("keydown", activate, true);
    return () => { document.removeEventListener("pointerdown", activate, true); document.removeEventListener("keydown", activate, true); };
  }, []);
  useEffect(() => {
    stopCoachSpeech();
    if (!visible || !open || !preferences.spoken || !activated.current || !game.cursor) return;
    // Debounce rapid review navigation; never queue commentary for old positions.
    const timer = window.setTimeout(() => {
      if (!document.hidden) speakCoach(comment.speech, preferences.avatar, preferences.voices[preferences.avatar]);
    }, 650);
    return () => { window.clearTimeout(timer); stopCoachSpeech(); };
  }, [key, visible, open, preferences.spoken, preferences.avatar, preferences.voices, comment.speech, game.cursor]);
  if (!visible) return null;
  const toggleVoice = () => {
    stopCoachSpeech();
    update({ spoken: !preferences.spoken });
    if (!preferences.spoken && !game.cursor) speakCoach(`Hi, I'm ${coach.name}. I'll talk you through the moves.`, coach.id, preferences.voices[coach.id]);
  };
  return <aside className="floating-coach" aria-label="Move commentary coach" style={{ "--coach-accent": coach.accent } as React.CSSProperties}>
    {open && <section className="coach-bubble" aria-label={`${coach.name}'s move commentary`}>
      <div className="coach-bubble-header"><div><span className="coach-eyebrow">YOUR CHESS COACH</span><h2>{coach.name} <span>{speaking ? "Speaking" : coach.style}</span></h2></div>
        <button type="button" className="coach-icon-button" aria-label="Minimize coach commentary" onClick={() => { stopCoachSpeech(); setDismissed(key); }}><ChevronDown size={17} /></button>
      </div>
      <p className="coach-comment" role="status" aria-live="polite" aria-atomic="true" data-testid="coach-comment">{comment.text}</p>
      <div className="coach-comment-source"><span className={`coach-mood-dot ${comment.mood}`} />{comment.source}{analysis.status === "analyzing" && analysis.fen === fen ? " · Looking deeper…" : ""}</div>
      <div className="coach-bubble-actions">
        {!computer.active ? <Button variant="ghost" size="sm" onClick={() => { stopCoachSpeech(); setDismissed(key); onExplain(); }}><Sparkles size={14} />Explain position</Button> : <span className="text-xs text-muted-foreground">Assisted commentary</span>}
        <div className="flex items-center gap-1"><button type="button" className="coach-icon-button" disabled={!supported} aria-label={preferences.spoken ? "Mute coach voice" : "Enable coach voice"} aria-pressed={preferences.spoken} onClick={toggleVoice}>{preferences.spoken ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
          <button type="button" className="coach-icon-button" disabled={!supported} aria-label="Replay coach comment" onClick={() => speakCoach(comment.speech, coach.id, preferences.voices[coach.id])}><RotateCcw size={15} /></button></div>
      </div>
      {error && <p className="coach-voice-error" role="status">{error}</p>}
    </section>}
    <button type="button" className="coach-avatar-launcher" aria-label={`${open ? "Minimize" : "Open"} ${coach.name}'s commentary`} aria-expanded={open} onClick={() => { stopCoachSpeech(); setDismissed(open ? key : null); }}>
      <CoachAvatar avatar={coach.id} mood={comment.mood} speaking={speaking} />
      <span className="coach-name-tag">{coach.name}<span aria-hidden="true">✦</span></span>
    </button>
  </aside>;
}
