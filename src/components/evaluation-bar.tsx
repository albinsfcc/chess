"use client";
import { evaluationBar } from "@/lib/position-evaluation";
import { usePositionAnalysis } from "./use-position-analysis";
export function EvaluationBar({ fen }: { fen: string }) {
  const result = usePositionAnalysis(fen), primary = result?.lines.find((line) => line.multiPv === 1);
  const display = evaluationBar(primary?.score ?? null, fen.split(" ")[1] === "b" ? "b" : "w");
  const bound = primary?.lowerBound ? "≥ " : primary?.upperBound ? "≤ " : "";
  return <div className="evaluation-column" role="img" aria-label={`Evaluation: ${bound}${display.description}`} data-testid="evaluation-bar" data-white-percentage={display.whitePercentage} style={{ "--white-percentage": `${display.whitePercentage}%` } as React.CSSProperties}>
    <span className="evaluation-label font-mono text-xs text-foreground">{bound}{display.label}</span>
    <div className="evaluation-track relative overflow-hidden rounded border border-muted-foreground bg-[#20262b]" aria-hidden="true"><div className="evaluation-white absolute bottom-0 left-0 bg-[#edf2f3]" /></div>
  </div>;
}
