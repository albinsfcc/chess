import { Chess, DEFAULT_POSITION } from "chess.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ENGINE_BUILD, type EngineResult, type WorkerCommand, type WorkerEvent } from "./domain";
import { EngineClient, type EngineWorker } from "./client";
import { normalizeInfo, pvToSan, toPlayerScore, toWhiteScore, validatePosition } from "./normalize";
import { parseUci } from "./uci";
import { UciSession } from "./session";

const info = "info depth 17 seldepth 23 multipv 2 score cp -38 upperbound nodes 178094 nps 701157 hashfull 42 tbhits 0 time 254 pv e2e4 e7e5 g1f3";
const config = { preset: "quick", multiPv: 3 } as const;
const request = { requestId: "first", fen: DEFAULT_POSITION, config };
afterEach(() => { vi.useRealTimers(); });

describe("UCI parsing and normalized evaluations", () => {
  it("recognizes readiness, engine identity, best and ponder moves", () => {
    expect(parseUci("uciok")).toEqual({ type: "uciok" });
    expect(parseUci("readyok")).toEqual({ type: "readyok" });
    expect(parseUci("id name Stockfish 19 Lite WASM")).toEqual({ type: "name", name: "Stockfish 19 Lite WASM" });
    expect(parseUci("bestmove e2e4 ponder e7e5")).toEqual({ type: "bestmove", move: "e2e4", ponder: "e7e5" });
    expect(parseUci("bestmove (none)")).toEqual({ type: "bestmove", move: null });
    expect(parseUci("bestmove 0000")).toEqual({ type: "bestmove", move: null });
  });
  it("parses MultiPV, cp, selective depth, nodes, speed, elapsed time and bounds", () => {
    expect(parseUci(info)).toMatchObject({ type: "info", multiPv: 2, depth: 17, selectiveDepth: 23, score: { type: "cp", value: -38 }, nodes: 178094, nodesPerSecond: 701157, timeMs: 254, lowerBound: false, upperBound: true, pvUci: ["e2e4", "e7e5", "g1f3"] });
  });
  it.each([3, -4, 0])("preserves mate distance %s as mate, never cp", (moves) => {
    expect(parseUci(`info depth 12 score mate ${moves} pv h5f7`)).toMatchObject({ score: { type: "mate", moves } });
  });
  it("preserves terminal scores even when there is no PV", () => {
    expect(parseUci("info depth 0 score mate 0 nodes 0")).toMatchObject({ score: { type: "mate", moves: 0 }, pvUci: [] });
  });
  it("normalizes scores and bounds to White, and back to the current player", () => {
    expect(toWhiteScore({ type: "cp", value: 38 }, "b")).toEqual({ type: "cp", value: -38 });
    expect(toWhiteScore({ type: "mate", moves: -4 }, "b")).toEqual({ type: "mate", moves: 4 });
    expect(toPlayerScore({ type: "mate", moves: 4 }, "b")).toEqual({ type: "mate", moves: -4 });
    expect(toWhiteScore({ type: "cp", value: 38 }, "w")).toEqual({ type: "cp", value: 38 });
    const chess = new Chess(); chess.move("e4");
    const parsed = parseUci(info.replace("e2e4 e7e5 g1f3", "e7e5 g1f3"));
    if (parsed?.type !== "info") throw new Error("Fixture parse failed");
    expect(normalizeInfo(chess.fen(), parsed)).toMatchObject({ score: { type: "cp", value: 38 }, lowerBound: true, upperBound: false, pvSan: ["e5", "Nf3"] });
  });
  it.each(["", "info string NNUE loaded", "info depth", "info depth 5 nodes 3", "info depth 3 score cp nope pv e2e4", "info depth -1 score cp 2 pv e2e4", "bestmove bad", "readyok unexpected"])("ignores incomplete or irrelevant output: %s", (text) => expect(parseUci(text)).toBeNull());
  it("replays UCI variations, stopping gracefully at the first illegal move", () => {
    expect(pvToSan(DEFAULT_POSITION, ["e2e4", "e7e5", "g1f3"])).toEqual({ san: ["e4", "e5", "Nf3"], complete: true });
    expect(pvToSan(DEFAULT_POSITION, ["e2e4", "e7e4", "g1f3"])).toEqual({ san: ["e4"], complete: false });
    expect(pvToSan("invalid", ["e2e4"])).toEqual({ san: [], complete: false });
    const parsed = parseUci("info depth 4 score cp 20 pv e2e4 invalid");
    if (parsed?.type !== "info") throw new Error("Fixture parse failed");
    expect(normalizeInfo(DEFAULT_POSITION, parsed)).toMatchObject({ pvUci: ["e2e4", "invalid"], pvSan: ["e4"], replayComplete: false });
  });
  it("replays promotion, castling and en passant PVs", () => {
    expect(pvToSan("7k/P7/8/8/8/8/8/7K w - - 0 1", ["a7a8q"]).san).toEqual(["a8=Q+"]);
    expect(pvToSan("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", ["e1g1", "e8c8"]).san).toEqual(["O-O", "O-O-O"]);
    const chess = new Chess(); for (const move of ["e4", "a6", "e5", "d5"]) chess.move(move);
    expect(pvToSan(chess.fen(), ["e5d6"]).san).toEqual(["exd6"]);
  });
  it("rejects malformed FEN and non-moving kings left in check", () => {
    expect(() => validatePosition("invalid")).toThrow("Invalid position");
    expect(() => validatePosition("7k/8/8/8/8/8/8/K6R w - - 0 1")).toThrow("left its king in check");
    expect(validatePosition(DEFAULT_POSITION).fen()).toBe(DEFAULT_POSITION);
  });
});

describe("worker UCI lifecycle", () => {
  function initialized() {
    const commands: string[] = [], events: WorkerEvent[] = [];
    const session = new UciSession((cmd) => commands.push(cmd), (event) => events.push(event));
    session.command({ type: "initialize" }); session.receive("id name Stockfish 19 Lite WASM\nuciok"); session.receive("readyok");
    return { session, commands, events };
  }
  it("initializes once, applies MultiPV and handles new-game readiness", () => {
    const { session, commands, events } = initialized();
    session.command({ type: "initialize" });
    expect(commands).toEqual(["uci", "isready", "setoption name MultiPV value 3"]);
    expect(events[0]).toEqual({ type: "ready", engineVersion: "Stockfish 19 Lite WASM" });
    session.command({ type: "new-game" }); session.command({ type: "search", request });
    expect(commands.at(-1)).toBe("isready"); session.receive("readyok");
    expect(commands.slice(-3)).toEqual(["setoption name MultiPV value 3", `position fen ${DEFAULT_POSITION}`, "go movetime 250"]);
    session.dispose();
  });
  it("drains cancelled output and the readiness barrier before starting the replacement", () => {
    const { session, commands, events } = initialized();
    session.command({ type: "search", request });
    session.receive(info);
    session.command({ type: "search", request: { ...request, requestId: "second" } });
    expect(commands.at(-1)).toBe("stop");
    session.receive("info depth 22 score cp 80 pv e2e4\nbestmove e2e4");
    expect(events.filter((event) => event.type === "result")).toHaveLength(0);
    expect(commands.at(-1)).toBe("isready"); session.receive("readyok");
    session.receive("info depth 10 multipv 1 score cp 20 pv d2d4 d7d5\nbestmove d2d4 ponder d7d5");
    expect(events.at(-1)).toMatchObject({ type: "result", complete: true, result: { requestId: "second", bestMove: "d2d4", bestMoveSan: "d4", ponderMove: "d7d5" } });
    session.dispose();
  });
  it("throttles progressive messages and publishes completion immediately", () => {
    vi.useFakeTimers(); const { session, events } = initialized(); session.command({ type: "search", request });
    for (let i = 0; i < 100; i++) session.receive(info);
    expect(events).toHaveLength(1); vi.advanceTimersByTime(125); expect(events).toHaveLength(2);
    session.receive("bestmove e2e4"); expect(events.at(-1)).toMatchObject({ complete: true }); session.dispose();
  });
  it("cancels searches, ignores their final result and times out an engine that won't stop", () => {
    vi.useFakeTimers(); const { session, events } = initialized(); session.command({ type: "search", request }); session.command({ type: "stop" });
    vi.advanceTimersByTime(2000); expect(events.at(-1)).toMatchObject({ type: "error" }); session.dispose();
  });
});

class MockWorker implements EngineWorker {
  onmessage: EngineWorker["onmessage"] = null;
  onerror: EngineWorker["onerror"] = null;
  onmessageerror: EngineWorker["onmessageerror"] = null;
  messages: WorkerCommand[] = [];
  terminate = vi.fn();
  postMessage(message: WorkerCommand) { this.messages.push(message); }
  emit(event: WorkerEvent) { this.onmessage?.({ data: event } as MessageEvent<WorkerEvent>); }
  result(id: string): EngineResult { return { requestId: id, fen: DEFAULT_POSITION, config, engineVersion: "Stockfish 19 Lite WASM", engineBuild: ENGINE_BUILD, lines: [], bestMove: "e2e4", bestMoveSan: "e4" }; }
  get id() { const cmd = this.messages.findLast((message) => message.type === "search"); return cmd?.type === "search" ? cmd.request.requestId : ""; }
}
describe("engine service", () => {
  async function clientReady() {
    const worker = new MockWorker(), client = new EngineClient(() => worker);
    const ready = client.ready(); worker.emit({ type: "ready", engineVersion: "Stockfish 19 Lite WASM" }); await ready;
    return { client, worker };
  }
  it("rejects stale request IDs while settling a replacement search", async () => {
    const { client, worker } = await clientReady();
    const first = client.analyze(DEFAULT_POSITION, config); const rejected = expect(first).rejects.toMatchObject({ name: "AbortError" }); await Promise.resolve(); const oldId = worker.id;
    const second = client.analyze(DEFAULT_POSITION, config); await rejected; await Promise.resolve();
    const listener = vi.fn(); client.subscribe(listener);
    worker.emit({ type: "result", result: worker.result(oldId), complete: true }); expect(listener).not.toHaveBeenCalled();
    worker.emit({ type: "result", result: worker.result(worker.id), complete: true }); await expect(second).resolves.toMatchObject({ bestMove: "e2e4" }); client.terminate();
  });
  it("cancels the active promise and ignores late results", async () => {
    const { client, worker } = await clientReady(); const pending = client.analyze(DEFAULT_POSITION, config); const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" }); await Promise.resolve();
    const id = worker.id; client.stop(); await rejected;
    const listener = vi.fn(); client.subscribe(listener); worker.emit({ type: "result", result: worker.result(id), complete: true }); expect(listener).not.toHaveBeenCalled(); client.terminate();
  });
  it("reserves the existing worker for a queue and survives live navigation and unmount cleanup", async () => {
    const { client, worker } = await clientReady();
    const release = client.acquire("queue");
    expect(() => client.acquire("another-queue")).toThrow();
    await expect(client.analyze(DEFAULT_POSITION, config)).rejects.toThrow();
    const pending = client.analyze(DEFAULT_POSITION, config, "queue"); await Promise.resolve();
    const id = worker.id, commands = worker.messages.length;
    client.stop(); client.newGame(); client.terminate();
    expect(worker.messages).toHaveLength(commands); expect(worker.terminate).not.toHaveBeenCalled();
    worker.emit({ type: "result", result: worker.result(id), complete: true }); await pending;
    release(); expect(client.reserved).toBe(false);
    const live = client.analyze(DEFAULT_POSITION, config); await Promise.resolve();
    worker.emit({ type: "result", result: worker.result(worker.id), complete: true }); await live;
    client.terminate(); expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("terminates a failed worker and creates exactly one replacement on restart", async () => {
    const workers: MockWorker[] = []; const factory = () => { const worker = new MockWorker(); workers.push(worker); return worker; }; const client = new EngineClient(factory);
    const ready = client.ready(); workers[0].emit({ type: "ready", engineVersion: "Stockfish 19" }); await ready;
    workers[0].onerror?.({} as ErrorEvent); expect(workers[0].terminate).toHaveBeenCalledOnce();
    const restarted = client.restart(); expect(workers).toHaveLength(2);
    workers[0].emit({ type: "ready", engineVersion: "OLD" }); workers[1].emit({ type: "ready", engineVersion: "Stockfish 19" });
    await expect(restarted).resolves.toBe("Stockfish 19"); client.terminate();
  });
  it("times out initialization and active requests", async () => {
    vi.useFakeTimers(); const client = new EngineClient(() => new MockWorker(), 50); const rejected = expect(client.ready()).rejects.toThrow("initialization timed out"); vi.advanceTimersByTime(50); await rejected;
    const running = await clientReady(); const pending = expect(running.client.analyze(DEFAULT_POSITION, config)).rejects.toThrow("search timed out"); await Promise.resolve(); vi.advanceTimersByTime(7250); await pending; running.client.terminate();
  });
  it("settles a search immediately when sending to its worker fails", async () => {
    const { client, worker } = await clientReady();
    const original = worker.postMessage.bind(worker);
    worker.postMessage = (message) => { if (message.type === "search") throw new Error("Worker unavailable"); original(message); };
    await expect(client.analyze(DEFAULT_POSITION, config)).rejects.toThrow("communication failed");
    expect(worker.terminate).toHaveBeenCalledOnce();
    client.terminate();
  });
});
