import { Chess } from "chess.js";
import { ENGINE_BUILD, type EngineResult, type WorkerCommand, type WorkerEvent } from "../../src/lib/engine/domain";
const scope = globalThis as unknown as { onmessage: (event: MessageEvent<WorkerCommand>) => void; postMessage: (event: WorkerEvent) => void };
scope.onmessage = ({ data }) => {
  if (data.type === "initialize") scope.postMessage({ type: "ready", engineVersion: "Strength fixture" });
  if (data.type !== "search") return;
  const request = data.request, chess = new Chess(request.fen), sacrifice = chess.get("a1")?.type === "r" && !chess.get("b1");
  const move = chess.moves({ verbose: true }).find((move) => sacrifice ? move.from === "a1" && move.to === "a7" : move.from === "d2" && move.to === "d4") ?? chess.moves({ verbose: true })[0];
  const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
  // Deliberately synthetic scores exercise rendering, not real engine judgments.
  const score = chess.get("e4")?.type === "p" ? -400 : 100;
  const result: EngineResult = { ...request, engineBuild: ENGINE_BUILD, engineVersion: "Strength fixture", bestMove: uci, bestMoveSan: move.san,
    lines: [{ multiPv: 1, depth: 16, score: { type: "cp", value: score }, lowerBound: false, upperBound: false, pvUci: sacrifice ? [uci, "a8a7"] : [uci], pvSan: sacrifice ? [move.san, "Rxa7"] : [move.san], replayComplete: true }] };
  setTimeout(() => scope.postMessage({ type: "result", result, complete: true }), 30);
};
