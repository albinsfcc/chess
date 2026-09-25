"use client";

import { Switch } from "@/components/ui/switch";
import { type AnalysisConfig } from "@/lib/engine/domain";
import { useAnalysis } from "@/store/analysis";
import { Licenses } from "./licenses";

export function EngineSettings() {
  const preferences = useAnalysis((state) => state.preferences);
  const update = useAnalysis((state) => state.updatePreferences);
  return <div className="space-y-4 border-t pt-4">
    <h3 className="font-medium">Analysis & game review settings</h3>
    <p className="text-xs text-muted-foreground">Game reviews use this preset and MultiPV count for the entire main line. Changes apply to the next review; saved results keep their original configuration.</p>
    <div className="grid grid-cols-2 gap-3">
      <label className="text-sm">Analysis preset<select aria-label="Analysis preset" className="mt-2 h-10 w-full rounded-md border bg-background px-2" value={preferences.preset} onChange={(event) => update({ preset: event.target.value as AnalysisConfig["preset"] })}>
        <option value="quick">Quick · 250 ms</option><option value="standard">Standard · 750 ms</option><option value="deep">Deep · 2000 ms</option>
      </select></label>
      <label className="text-sm">Top moves to show<select aria-label="Principal variations count" className="mt-2 h-10 w-full rounded-md border bg-background px-2" value={preferences.multiPv} onChange={(event) => update({ multiPv: Number(event.target.value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
    </div>
    <div className="flex items-center justify-between gap-3"><label htmlFor="automatic-analysis" className="text-sm">Automatic assisted analysis</label><Switch id="automatic-analysis" checked={preferences.automatic} onCheckedChange={(automatic) => update({ automatic })} /></div>
    <p className="text-xs text-muted-foreground">When analysis is running, automatically analyze after moves and navigation. Resume to start a stopped session.</p>
    <div className="flex items-center justify-between gap-3"><label htmlFor="engine-arrow" className="text-sm">Show best-move arrow</label><Switch id="engine-arrow" checked={preferences.showArrow} onCheckedChange={(showArrow) => update({ showArrow })} /></div>
    <p className="text-xs text-muted-foreground">Show 1-5 engine choices. Blue arrows fade from the strongest to weaker choices. Saved analysis may contain fewer lines; reanalyze for more.</p>
    <div className="flex items-center justify-between gap-3"><label htmlFor="show-threats" className="text-sm">Show threats</label><Switch id="show-threats" checked={preferences.showThreats} onCheckedChange={(showThreats) => update({ showThreats })} /></div>
    <p className="text-xs text-muted-foreground">Red: the opponent’s current checks, mate in one or estimated winning captures if ignored. This bounded tactical check does not find every threat.</p>
    <Licenses />
  </div>;
}
