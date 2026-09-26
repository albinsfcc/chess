import { Chess } from "chess.js";
import { ENGINE_BUILD, type EngineResult, type WorkerCommand, type WorkerEvent } from "../../src/lib/engine/domain";

const scope = globalThis as unknown as { onmessage: (event: MessageEvent<WorkerCommand>) => void; postMessage: (event: WorkerEvent) => void };
scope.onmessage = ({ data }) => {
  if (data.type === "initialize") scope.postMessage({ type: "ready", engineVersion: "Stockfish Queue Test" });
  if (data.type !== "search") return;
  const request = data.request, chess = new Chess(request.fen);
  const preferred = request.bot ? (chess.get("e7") ? "e7e5" : "d8h4") : "";
  const moves = chess.moves({ verbose: true }).sort((a, b) => Number(b.lan === preferred) - Number(a.lan === preferred)).slice(0, request.config.multiPv);
  const best = moves[0];
  const result: EngineResult = { ...request, engineBuild: ENGINE_BUILD, engineVersion: "Stockfish Queue Test", bestMove: best ? `${best.from}${best.to}${best.promotion ?? ""}` : null, bestMoveSan: best?.san ?? null,
    lines: moves.map((move, index) => ({ multiPv: index + 1, depth: 12, nodes: 1250, timeMs: 250, score: { type: "cp" as const, value: chess.turn() === "w" ? 30 - index : -10 - index }, lowerBound: false, upperBound: false,
      pvUci: [`${move.from}${move.to}${move.promotion ?? ""}`], pvSan: [move.san], replayComplete: true })) };
  setTimeout(() => scope.postMessage({ type: "result", result, complete: false }), 70);
  // Late results intentionally survive stop to test service-side stale rejection.
  setTimeout(() => scope.postMessage({ type: "result", result, complete: true }), 900);
};
