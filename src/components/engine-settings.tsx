"use client";
import { GlassSelect } from "./ui/glass-select";

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
      <label className="text-sm">Analysis preset<GlassSelect aria-label="Analysis preset" className="mt-2 h-10 w-full rounded-md border bg-background px-2" value={preferences.preset} onValueChange={(value) => update({ preset: value as AnalysisConfig["preset"] })}>
        <option value="quick">Quick · 250 ms</option><option value="standard">Standard · 750 ms</option><option value="deep">Deep · 2000 ms</option>
      </GlassSelect></label>
      <label className="text-sm">Top moves to show<GlassSelect aria-label="Principal variations count" className="mt-2 h-10 w-full rounded-md border bg-background px-2" value={preferences.multiPv} onValueChange={(value) => update({ multiPv: Number(value) })}>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}</GlassSelect></label>
    </div>
    <p className="text-xs text-muted-foreground">Start analysis in the Engine tab to follow moves and navigation continuously. Stop analysis pauses it for all positions.</p>
    <div className="flex items-center justify-between gap-3"><label htmlFor="engine-arrow" className="text-sm">Show best-move arrow</label><Switch id="engine-arrow" checked={preferences.showArrow} onCheckedChange={(showArrow) => update({ showArrow })} /></div>
    <p className="text-xs text-muted-foreground">Show 1-5 engine choices. Blue arrows fade from the strongest to weaker choices. Saved analysis may contain fewer lines; reanalyze for more.</p>
    <div className="flex items-center justify-between gap-3"><label htmlFor="show-threats" className="text-sm">Show threats</label><Switch id="show-threats" checked={preferences.showThreats} onCheckedChange={(showThreats) => update({ showThreats })} /></div>
    <p className="text-xs text-muted-foreground">Red: the opponent’s current checks, mate in one or estimated winning captures if ignored. This bounded tactical check does not find every threat.</p>
    <Licenses />
  </div>;
}
