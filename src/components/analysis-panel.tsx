"use client";
import { visibleLines } from "@/lib/engine/alternatives";

import { useComputer } from "@/store/computer";
import { Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatScore } from "@/lib/engine/normalize";
import { PRESETS } from "@/lib/engine/domain";
import { useAnalysis } from "@/store/analysis";
import { ThreatPanel } from "./threat-panel";
import { TOP_MOVE_COLORS } from "@/lib/engine/arrows";
import { MoveStrengthIcon } from "./move-strength-icon";

export function AnalysisPanel() {
  const analysis = useAnalysis();
  const computer = useComputer((state) => state.active);
  const reviewConfig = useComputer((state) => state.reviewConfig);
  const displayConfig = computer ? reviewConfig : analysis.preferences;
  const primary = analysis.result?.lines[0];
  return <section className="min-w-0 rounded-xl border bg-card p-5" aria-labelledby="analysis-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="analysis-heading" className="flex items-center gap-2 font-semibold"><Activity size={18} className="text-primary" /> Engine analysis</h2>
      <span role="status" data-testid="engine-status" className="text-xs capitalize text-muted-foreground">{analysis.status}</span>
    </div>
    <p className="mt-3 text-xs text-muted-foreground">{analysis.version ?? "Stockfish 19 · local WASM"} · {displayConfig.preset} ({PRESETS[displayConfig.preset]} ms) · {displayConfig.multiPv} lines</p>
    <p className="mt-2 text-xs text-muted-foreground">{computer ? "Assisted analysis" : analysis.enabled ? "Following every position" : "Analysis paused"} · Evaluations favor White when positive.</p>
    {analysis.result ? <div className="mt-4 space-y-3" aria-label="Current position analysis">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-2xl font-semibold text-primary" aria-label="Position evaluation">{primary ? `${primary.lowerBound ? "≥ " : primary.upperBound ? "≤ " : ""}${formatScore(primary.score)}` : "—"}</p>
        <span className="text-xs text-muted-foreground">Depth {primary?.depth ?? "—"}{primary?.selectiveDepth !== undefined ? ` / selective ${primary.selectiveDepth}` : ""}{analysis.cached ? " · Saved result" : ""}</span>
      </div>
      {primary?.score.type === "mate" && <p className="text-sm">{primary.score.moves === 0 ? "Checkmate position." : `${primary.score.moves > 0 ? "White" : "Black"} has mate in ${Math.abs(primary.score.moves)}.`}</p>}
      <p className="text-sm" data-testid="engine-best-move">Best move: <strong className="font-mono">{analysis.result.bestMoveSan ?? "No legal move"}</strong></p>
      <ol className="space-y-2" aria-label="Principal variations">
        {visibleLines(analysis.result, displayConfig.multiPv).map((line) => <li key={line.multiPv} style={{ borderLeftColor: TOP_MOVE_COLORS[line.multiPv - 1], borderLeftWidth: 3 }} className="rounded-md border bg-background/40 p-3 text-sm">
          <div className="flex items-center justify-between gap-2"><span className="font-mono text-primary">#{line.multiPv} · {line.lowerBound ? "≥ " : line.upperBound ? "≤ " : ""}{formatScore(line.score)}</span><span className="text-xs text-muted-foreground">Depth {line.depth}</span></div>
          <p className="mt-2 break-words font-mono leading-relaxed">{line.pvSan.join(" ") || "No continuation"}</p>
          {!line.replayComplete && <p className="mt-1 text-xs text-muted-foreground">Showing the legal prefix of this line.</p>}
        </li>)}
      </ol>
      {primary?.nodes !== undefined && <p className="text-xs text-muted-foreground">{primary.nodes.toLocaleString()} nodes{primary.nodesPerSecond !== undefined ? ` · ${primary.nodesPerSecond.toLocaleString()} nodes/s` : ""}{primary.timeMs !== undefined ? ` · ${primary.timeMs} ms` : ""}</p>}
    </div> : <p className="my-4 text-sm leading-relaxed text-muted-foreground">{analysis.status === "loading" ? "Loading the local engine. You can keep using the board." : analysis.status === "analyzing" ? "Analyzing this position…" : "Start analysis once to follow every move and variation automatically. Stop it whenever you want to explore without guidance."}</p>}
    {!computer && <ThreatPanel />}
    {analysis.assessment && <div className="mt-3 flex items-start gap-2 text-sm" title={analysis.assessment.reason}><MoveStrengthIcon label={analysis.assessment.label} className="size-7 shrink-0" /><p>Last move: <strong>{analysis.assessment.label}</strong><span className="block text-xs text-muted-foreground">{analysis.assessment.reason}</span></p></div>}
    {analysis.error && <p role="alert" className="my-3 text-sm text-destructive">{analysis.error}</p>}
    {analysis.storageError && <p role="alert" className="my-3 text-xs text-amber-200">{analysis.storageError}</p>}
    {!computer && <div className="mt-4 flex flex-wrap gap-2">
      {analysis.enabled ? <Button variant="outline" onClick={analysis.stop}>Stop analysis</Button> : <Button onClick={() => analysis.start(true)}><Activity />Start analysis</Button>}
      {analysis.enabled && <Button variant="outline" disabled={analysis.status === "loading" || analysis.status === "analyzing"} onClick={() => void analysis.analyze(true)}>Reanalyze position</Button>}
      <Button variant="ghost" disabled={analysis.status === "loading"} onClick={() => void analysis.restart()}>Restart engine</Button>
    </div>}
  </section>;
}
