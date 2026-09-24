"use client";
import { useThreats } from "@/store/threats";
import { useAnalysis } from "@/store/analysis";
export function ThreatPanel() {
  const enabled = useAnalysis((state) => state.preferences.showThreats), { result, loading, error } = useThreats();
  if (!enabled) return null;
  return <div className="mt-4 space-y-2 border-t pt-3 text-sm" aria-label="Opponent threats">
    <h3 className="font-medium">Opponent’s immediate threats</h3>
    <p className="text-xs text-muted-foreground">Red arrows: current checks, mate in one, or estimated winning captures if ignored. Deeper combinations are not covered.</p>
    {loading && <p role="status">Checking threats…</p>}
    {error && <p role="alert">{error}</p>}
    {result && <div aria-live="polite">{result.threats.length ? <ul className="space-y-1">{result.threats.map((threat, index) => <li key={`${threat.from}${threat.to}${index}`}><strong>{threat.san}</strong> — {threat.kind === "mate" ? "mate in one if ignored" : threat.kind === "check" ? "king is in check" : `winning capture, estimated +${threat.gain} material after exchanges`}</li>)}</ul> : <p>No immediate tactical threat found.</p>}{result.limited && <p className="text-xs text-muted-foreground">Showing a limited tactical scan.</p>}</div>}
  </div>;
}
