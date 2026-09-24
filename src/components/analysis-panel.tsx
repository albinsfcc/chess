"use client";

import { useState } from "react";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { formatScore } from "@/lib/engine/normalize";
import { PRESETS } from "@/lib/engine/domain";
import { useAnalysis } from "@/store/analysis";
import { ThreatPanel } from "./threat-panel";
import { TOP_MOVE_COLORS } from "@/lib/engine/arrows";

export function AnalysisPanel() {
  const analysis = useAnalysis();
  const [open, setOpen] = useState(false);
  const primary = analysis.result?.lines[0];
  return <section className="min-w-0 rounded-xl border bg-card p-5" aria-labelledby="analysis-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="analysis-heading" className="flex items-center gap-2 font-semibold"><Activity size={18} className="text-primary" /> Engine analysis</h2>
      <span role="status" data-testid="engine-status" className="text-xs capitalize text-muted-foreground">{analysis.status}</span>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">{analysis.version ?? "Stockfish 19 · local WASM"} · {analysis.preferences.preset} ({PRESETS[analysis.preferences.preset]} ms) · {analysis.preferences.multiPv} lines</p>
    <p className="mt-2 text-xs text-muted-foreground">{analysis.preferences.automatic ? "Assisted analysis" : "Free play"} · Evaluations favor White when positive.</p>
    {analysis.result ? <div className="mt-4 space-y-3" aria-label="Current position analysis">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-2xl font-semibold text-primary" aria-label="Position evaluation">{primary ? `${primary.lowerBound ? "≥ " : primary.upperBound ? "≤ " : ""}${formatScore(primary.score)}` : "—"}</p>
        <span className="text-xs text-muted-foreground">Depth {primary?.depth ?? "—"}{primary?.selectiveDepth !== undefined ? ` / selective ${primary.selectiveDepth}` : ""}{analysis.cached ? " · Saved result" : ""}</span>
      </div>
      {primary?.score.type === "mate" && <p className="text-sm">{primary.score.moves === 0 ? "Checkmate position." : `${primary.score.moves > 0 ? "White" : "Black"} has mate in ${Math.abs(primary.score.moves)}.`}</p>}
      <p className="text-sm" data-testid="engine-best-move">Best move: <strong className="font-mono">{analysis.result.bestMoveSan ?? "No legal move"}</strong></p>
      <ol className="space-y-2" aria-label="Principal variations">
        {analysis.result.lines.slice(0, analysis.preferences.multiPv).map((line) => <li key={line.multiPv} style={{ borderLeftColor: TOP_MOVE_COLORS[line.multiPv - 1], borderLeftWidth: 3 }} className="rounded-md border bg-background/40 p-3 text-sm">
          <div className="flex items-center justify-between gap-2"><span className="font-mono text-primary">#{line.multiPv} · {line.lowerBound ? "≥ " : line.upperBound ? "≤ " : ""}{formatScore(line.score)}</span><span className="text-xs text-muted-foreground">Depth {line.depth}</span></div>
          <p className="mt-2 break-words font-mono leading-relaxed">{line.pvSan.join(" ") || "No continuation"}</p>
          {!line.replayComplete && <p className="mt-1 text-xs text-muted-foreground">Showing the legal prefix of this line.</p>}
        </li>)}
      </ol>
      {primary?.nodes !== undefined && <p className="text-xs text-muted-foreground">{primary.nodes.toLocaleString()} nodes{primary.nodesPerSecond !== undefined ? ` · ${primary.nodesPerSecond.toLocaleString()} nodes/s` : ""}{primary.timeMs !== undefined ? ` · ${primary.timeMs} ms` : ""}</p>}
    </div> : <p className="my-4 text-sm leading-relaxed text-muted-foreground">{analysis.status === "loading" ? "Loading the local engine. You can keep using the board." : analysis.status === "analyzing" ? "Analyzing this position…" : "Explore freely, analyze one position, or enable assistance after each move. The engine never moves your pieces."}</p>}
    <ThreatPanel />
    {analysis.assessment && <p className="mt-3 text-sm" title={analysis.assessment.reason}>Last move: <strong>{analysis.assessment.label}</strong><span className="block text-xs text-muted-foreground">{analysis.assessment.reason}</span></p>}
    {analysis.error && <p role="alert" className="my-3 text-sm text-destructive">{analysis.error}</p>}
    {analysis.storageError && <p role="alert" className="my-3 text-xs text-amber-200">{analysis.storageError}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button variant="outline"><Activity /> Start analysis</Button></DialogTrigger>
        <DialogContent><DialogHeader><DialogTitle>Choose your analysis mode</DialogTitle><DialogDescription>Analyze only the current position. You control the moves and navigation.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border p-4"><h3 className="font-medium">Free play</h3><p className="my-2 text-sm text-muted-foreground">Play legal moves without automatic recommendations. Analyze Position remains available.</p><Button variant="outline" onClick={() => { analysis.start(false); setOpen(false); }}>Use free play</Button></div>
            <div className="rounded-lg border p-4"><h3 className="font-medium">Assisted analysis</h3><p className="my-2 text-sm text-muted-foreground">Analyze after each move or selected game position, with evaluation, variations and a best-move arrow.</p><Button onClick={() => { analysis.start(true); setOpen(false); }}>Use assisted analysis</Button></div>
          </div>
        </DialogContent>
      </Dialog>
      <Button onClick={() => void analysis.analyze(true)}>Analyze Position</Button>
      {analysis.enabled ? <Button variant="outline" onClick={analysis.stop}>Stop analysis</Button> : <Button variant="outline" onClick={() => void analysis.analyze()}>Resume analysis</Button>}
      <Button variant="ghost" disabled={analysis.status === "loading"} onClick={() => void analysis.restart()}>Restart engine</Button>
    </div>
  </section>;
}
