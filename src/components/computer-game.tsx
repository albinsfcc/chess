"use client";
import { useEffect, useId, useState } from "react";
import { Bot, Check, Crown, Shuffle, Sparkles } from "lucide-react";
import { BOTS, type Side } from "@/lib/computer";
import { useComputer } from "@/store/computer";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { AnalysisPanel } from "./analysis-panel";
import { Switch } from "./ui/switch";

const sides = [
  { value: "white", name: "White", description: "You move first", icon: Crown },
  { value: "random", name: "Random", description: "Let chance decide", icon: Shuffle },
  { value: "black", name: "Black", description: "Bot moves first", icon: Crown },
] as const;

function AssistedToggle({ checked, onChange, disabled, compact = false }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean; compact?: boolean }) {
  const id = useId();
  return <div className={`computer-assistance-toggle ${compact ? "is-compact" : ""}`} data-enabled={checked}>
    <span className="assistance-icon" aria-hidden="true"><Sparkles size={20} /></span>
    <label htmlFor={id} className="assistance-copy"><span className="assistance-title">Assisted game <span className="assistance-state" aria-hidden="true">{checked ? "On" : "Off"}</span></span>
      {!compact && <span id={`${id}-description`} className="assistance-description">Evaluation, move suggestions and attacked-piece highlights on your turn. You stay in control.</span>}
    </label>
    <Switch id={id} aria-label="Assisted game" aria-describedby={compact ? undefined : `${id}-description`} className="computer-assistance-switch" checked={checked} disabled={disabled} onCheckedChange={onChange} />
  </div>;
}

export function ComputerGame() {
  const session = useComputer();
  const [open, setOpen] = useState(false), [bot, setBot] = useState(BOTS[0]), [side, setSide] = useState<Side>("white"), [assisted, setAssisted] = useState(false);
  const [abandon, setAbandon] = useState<"new" | "exit" | null>(null);
  const [showFeedback, setShowFeedback] = useState(true);
  const setup = () => { setAssisted(false); setShowFeedback(true); setOpen(true); };
  const leave = (action: "new" | "exit") => {
    if (session.active && !session.result) { setAbandon(action); return; }
    session.exit(); if (action === "new") setup();
  };
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => { if (useComputer.getState().active) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", handler);
    return () => { window.removeEventListener("beforeunload", handler); if (useComputer.getState().active) useComputer.getState().exit(); };
  }, []);
  return <>
    <Button className="header-play-computer" onClick={() => session.active ? leave("new") : setup()}><Bot aria-hidden="true" />Play Computer</Button>
    {session.active && <div className="flex flex-wrap items-center gap-2" aria-label="Computer game controls">
      <span className="text-sm">{session.bot.name} · {session.bot.level} · You play {session.human === "w" ? "White" : "Black"}</span>
      <AssistedToggle compact checked={session.assisted} disabled={!!session.result} onChange={session.setAssisted} />
      <span role="status" data-testid="computer-status">{session.result ? `Result: ${session.result}` : session.error ? "Game paused" : session.reviewingMove ? (session.feedbackPly !== null ? "Move feedback" : "Reviewing your move…") : session.thinking ? "Bot is thinking…" : "Your turn"}</span>
      <Button variant="outline" disabled={!!session.result} onClick={session.resign}>Resign</Button>
      <Button variant="outline" onClick={() => leave("new")}>New Game</Button>
      <Button variant="ghost" onClick={() => leave("exit")}>Exit</Button>
    </div>}
    {session.error && <div role="alert">{session.error} {session.active && <Button onClick={session.retry}>Retry computer game</Button>}</div>}
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="computer-setup-dialog max-h-[90dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader><DialogTitle>Play vs Computer</DialogTitle><DialogDescription>Choose your opponent. Strength ratings are approximate, not official Elo. Games run locally; unfinished games are not restored after reload.</DialogDescription></DialogHeader>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" aria-label="Choose bot">
        {BOTS.map((profile) => <Button key={profile.name} variant={bot === profile ? "default" : "outline"} className="h-auto flex-col p-4" aria-pressed={bot === profile} onClick={() => setBot(profile)}><strong>{profile.name}</strong><span>{profile.level}</span><span>≈ {profile.rating}</span></Button>)}
      </div>
      <fieldset className="computer-side-fieldset">
        <legend>Choose your side</legend>
        <div className="computer-side-options">
          {sides.map(({ value, name, description, icon: Icon }) => <label className="computer-side-option" key={value}>
            <input type="radio" name="computer-side" value={value} aria-label={name} checked={side === value} onChange={() => setSide(value)} />
            <span className="side-card"><span className={`side-icon side-icon-${value}`} aria-hidden="true"><Icon size={23} /></span><span className="side-name">{name}</span><span className="side-description">{description}</span><span className="side-check" aria-hidden="true"><Check size={12} strokeWidth={3} /></span></span>
          </label>)}
        </div>
      </fieldset>
      <AssistedToggle checked={assisted} onChange={setAssisted} />
      <div className="computer-assistance-toggle" data-enabled={showFeedback}><label htmlFor="computer-feedback" className="assistance-copy"><span className="assistance-title">Show move feedback</span><span id="computer-feedback-description" className="assistance-description">Grade your moves after you play. Separate from pre-move assistance; only your moves receive feedback.</span></label><Switch id="computer-feedback" className="computer-assistance-switch" checked={showFeedback} onCheckedChange={setShowFeedback} aria-describedby="computer-feedback-description" /></div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={session.starting} onClick={async () => { await session.start(bot, side, assisted, Math.random, showFeedback); if (useComputer.getState().active) setOpen(false); }}>Start Game</Button></div>
    </DialogContent></Dialog>
    <Dialog open={!!abandon} onOpenChange={(value) => { if (!value) setAbandon(null); }}><DialogContent>
      <DialogHeader><DialogTitle>Abandon unfinished game?</DialogTitle><DialogDescription>This unfinished game will not be saved.</DialogDescription></DialogHeader>
      <Button variant="outline" onClick={() => setAbandon(null)}>Keep playing</Button><Button variant="destructive" onClick={() => { const action = abandon; setAbandon(null); session.exit(); if (action === "new") setup(); }}>Abandon game</Button>
    </DialogContent></Dialog>
  </>;
}
export function ComputerAssistance() {
  const session = useComputer();
  if (!session.active) return null;
  return session.assisted ? <><p className="text-xs text-muted-foreground">Orange outlines mark your pieces currently attacked by opposing pieces, including pinned attackers. Arrows show engine candidates.</p><AnalysisPanel /></> : <p className="p-4 text-sm text-muted-foreground">Assistance is off. Enable Assisted game for evaluations and candidate moves.</p>;
}
