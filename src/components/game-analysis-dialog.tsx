"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PRESETS, type AnalysisConfig } from "@/lib/engine/domain";
import { generatePositions, selectedBranch } from "@/lib/game-analysis/positions";
import { useWorkspace } from "@/store/workspace";
import { useAnalysis } from "@/store/analysis";
import { useGameAnalysis } from "@/store/game-analysis";

export function GameAnalysisDialog() {
  const document = useWorkspace((state) => state.imported), path = useWorkspace((state) => state.selectedPath);
  const busy = useGameAnalysis((state) => state.busy), start = useGameAnalysis((state) => state.start);
  const [open, setOpen] = useState(false), [scope, setScope] = useState("main");
  const [preset, setPreset] = useState<AnalysisConfig["preset"]>("standard"), [multiPv, setMultiPv] = useState(3);
  const [startPly, setStartPly] = useState(0), [endPly, setEndPly] = useState(0);
  const branch = scope === "main" ? "main" : selectedBranch(path);
  const generated = useMemo(() => {
    try { return { positions: document ? generatePositions(document.tree, branch) : [], error: null }; }
    catch (error) { return { positions: [], error: error instanceof Error ? error.message : "Invalid game tree." }; }
  }, [document, branch]);
  const max = generated.positions.length - 1;
  const invalid = !!generated.error || startPly < 0 || endPly > max || startPly > endPly || !Number.isInteger(startPly) || !Number.isInteger(endPly);
  const count = invalid ? 0 : endPly - startPly + 1;
  if (!document) return null;
  return <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (value) { setScope("main"); setStartPly(0); setEndPly(document.tree.mainLine.length); setPreset(useAnalysis.getState().preferences.preset); setMultiPv(3); } }}>
    <DialogTrigger asChild><Button disabled={busy || !document.tree.playable}>Analyze game</Button></DialogTrigger>
    <DialogContent><DialogHeader><DialogTitle>Analyze this game</DialogTitle><DialogDescription>Analyze one position at a time on this device. Completed positions are saved so you can pause and resume.</DialogDescription></DialogHeader>
      <label className="text-sm">Line to analyze<select aria-label="Line to analyze" className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={scope} onChange={(event) => {
        setScope(event.target.value); setStartPly(0);
        try { setEndPly(generatePositions(document.tree, event.target.value === "main" ? "main" : selectedBranch(path)).length - 1); } catch { setEndPly(0); }
      }}><option value="main">Analyze main line</option><option value="variation" disabled={path.length < 3}>Analyze selected variation</option></select></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">Preset<select aria-label="Game analysis preset" className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={preset} onChange={(event) => setPreset(event.target.value as AnalysisConfig["preset"])}>{Object.entries(PRESETS).map(([key, ms]) => <option key={key} value={key}>{key} · {ms} ms</option>)}</select></label>
        <label className="text-sm">MultiPV<select aria-label="Game analysis MultiPV" className="mt-1 h-10 w-full rounded-md border bg-background px-2" value={multiPv} onChange={(event) => setMultiPv(Number(event.target.value))}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select></label>
        <label className="text-sm">Starting ply<input aria-label="Starting ply" className="mt-1 h-10 w-full rounded-md border bg-background px-2" type="number" min={0} max={max} value={startPly} onChange={(event) => setStartPly(Number(event.target.value))} /></label>
        <label className="text-sm">Ending ply<input aria-label="Ending ply" className="mt-1 h-10 w-full rounded-md border bg-background px-2" type="number" min={0} max={max} value={endPly} onChange={(event) => setEndPly(Number(event.target.value))} /></label>
      </div>
      <p className="text-sm" aria-label="Approximate workload">{count} positions · Approximate search time: {(count * PRESETS[preset] / 1000).toFixed(1)} seconds. Loading and saving add time; cached positions may finish sooner.</p>
      <p className="text-xs text-muted-foreground">Ply 0 is the starting position; ply {max} is the final position of this line. A selected branch includes its shared prefix. No other variations are scanned. The queue stops if this tab closes.</p>
      {invalid && <p role="alert" className="text-sm text-destructive">{generated.error ?? `Choose an ordered range between 0 and ${max}.`}</p>}
      <Button disabled={busy || invalid} onClick={() => { void start(branch, { preset, multiPv, startPly, endPly }); setOpen(false); }}>Start game analysis</Button>
    </DialogContent>
  </Dialog>;
}
