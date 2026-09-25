import { Chess } from "chess.js";
import sacrifices from "./sacrifice-engine-output.json";
import quiet from "./quiet-move-engine-output.json";
import critical from "./critical-engine-output.json";
import { parseUci } from "../../src/lib/engine/uci";
import { normalizeInfo } from "../../src/lib/engine/normalize";
import { ENGINE_BUILD, type WorkerCommand, type WorkerEvent } from "../../src/lib/engine/domain";
const scope = globalThis as unknown as { onmessage: (event: MessageEvent<WorkerCommand>) => void; postMessage: (event: WorkerEvent) => void };
scope.onmessage = ({ data }) => {
  if (data.type === "initialize") scope.postMessage({ type: "ready", engineVersion: "Recorded Stockfish 19" });
  if (data.type !== "search") return;
  const row = [...sacrifices, ...critical, ...quiet].find((row) => row.fen === data.request.fen);
  const chess = new Chess(data.request.fen), move = chess.moves({ verbose: true })[0];
  const bestMove = row ? row.best.split(" ")[1] : move ? `${move.from}${move.to}${move.promotion ?? ""}` : null;
  const lines = row ? row.lines.flatMap((raw) => { const parsed = parseUci(raw); return parsed?.type === "info" ? [normalizeInfo(row.fen, parsed)] : []; }) : [{ multiPv: 1, depth: 18, score: { type: "cp" as const, value: 0 }, lowerBound: false, upperBound: false, pvUci: bestMove ? [bestMove] : [], pvSan: move ? [move.san] : [], replayComplete: true }];
  setTimeout(() => scope.postMessage({ type: "result", complete: true, result: { ...data.request, engineBuild: ENGINE_BUILD, engineVersion: "Recorded Stockfish 19", bestMove, bestMoveSan: null, lines } }), 20);
};
