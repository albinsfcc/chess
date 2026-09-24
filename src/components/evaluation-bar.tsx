"use client";
import { evaluationBar } from "@/lib/position-evaluation";
import { usePositionAnalysis } from "./use-position-analysis";
export function EvaluationBar({ fen }: { fen: string }) {
  const result = usePositionAnalysis(fen), primary = result?.lines.find((line) => line.multiPv === 1);
  const display = evaluationBar(primary?.score ?? null, fen.split(" ")[1] === "b" ? "b" : "w");
  const bound = primary?.lowerBound ? "≥ " : primary?.upperBound ? "≤ " : "";
  return <div className="evaluation-bar relative overflow-hidden rounded border border-muted-foreground bg-[#20262b]" role="img" aria-label={`Evaluation: ${bound}${display.description}`} data-testid="evaluation-bar" data-white-percentage={display.whitePercentage} style={{ "--white-percentage": `${display.whitePercentage}%` } as React.CSSProperties}>
    <div className="evaluation-white absolute bottom-0 left-0 bg-[#edf2f3]" />
    <span className="absolute inset-0 flex items-center justify-center"><span className="max-w-full break-all rounded bg-background/95 px-1 py-0.5 text-center font-mono text-xs leading-tight text-foreground">{bound}{display.label}</span></span>
  </div>;
}
