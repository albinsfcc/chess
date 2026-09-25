import { ENGINE_BUILD, PRESETS, searchSchema, type EngineResult, type SearchRequest, type WorkerCommand, type WorkerEvent } from "./domain";
import { normalizeInfo, pvToSan, validatePosition } from "./normalize";
import { parseUci, type UciInfo } from "./uci";
import { withTerminalScore } from "./result-quality";

/** UCI state machine, executed only in the worker. Drains bestmove + readyok
 * before changing positions: UCI output itself has no request identifiers. */
export class UciSession {
  private initialized = false;
  private ready = false;
  private barrier = false;
  private version = "Stockfish 19";
  private active: { request: SearchRequest; lines: Map<number, UciInfo>; exact: Map<number, UciInfo>; cancelled: boolean } | null = null;
  private pending: SearchRequest | null = null;
  private resetPending = false;
  private publishTimer: ReturnType<typeof setTimeout> | undefined;
  private stopTimer: ReturnType<typeof setTimeout> | undefined;
  private failed = false;
  constructor(private readonly send: (command: string) => void, private readonly emit: (event: WorkerEvent) => void) {}

  command(command: WorkerCommand) {
    if (this.failed) return;
    if (command.type === "initialize") {
      if (!this.initialized) { this.initialized = true; this.send("uci"); }
    } else if (command.type === "stop") { this.pending = null; this.cancelActive(); }
    else if (command.type === "new-game") { this.pending = null; this.resetPending = true; this.cancelActive(); this.advance(); }
    else {
      try { searchSchema.parse(command.request); validatePosition(command.request.fen); }
      catch (error) { this.emit({ type: "error", requestId: command.request.requestId, message: error instanceof Error ? error.message : "Invalid analysis request." }); return; }
      this.pending = command.request; this.cancelActive(); this.advance();
    }
  }
  private cancelActive() {
    if (!this.active || this.active.cancelled) return;
    this.active.cancelled = true; this.clearPublish();
    this.stopTimer = setTimeout(() => this.fail("The engine did not stop in time. Restart the engine to continue."), 2000);
    this.send("stop");
  }
  private advance() {
    if (!this.ready || this.barrier || this.active || this.failed) return;
    if (this.resetPending) {
      this.resetPending = false; this.barrier = true; this.send("ucinewgame"); this.send("isready"); return;
    }
    const request = this.pending; if (!request) return;
    this.pending = null;
    this.active = { request, lines: new Map(), exact: new Map(), cancelled: false };
    this.send(`setoption name MultiPV value ${request.config.multiPv}`);
    this.send(`position fen ${request.fen}`);
    this.send(`go movetime ${PRESETS[request.config.preset]}`);
  }
  receive(raw: string) {
    if (this.failed) return;
    for (const text of raw.split(/\r?\n/)) {
      const event = parseUci(text); if (!event) continue;
      if (event.type === "name") this.version = event.name;
      else if (event.type === "uciok") {
        if (this.ready || this.barrier) continue;
        this.barrier = true; this.send("isready");
      } else if (event.type === "readyok") {
        if (!this.barrier) continue;
        this.barrier = false;
        if (!this.ready) { this.ready = true; this.send("setoption name MultiPV value 3"); this.emit({ type: "ready", engineVersion: this.version }); }
        this.advance();
      } else if (event.type === "info") {
        if (!this.active || this.active.cancelled || event.multiPv > this.active.request.config.multiPv) continue;
        const previous = this.active.lines.get(event.multiPv);
        if (!event.lowerBound && !event.upperBound) this.active.exact.set(event.multiPv, event);
        if (!previous || event.depth >= previous.depth) this.active.lines.set(event.multiPv, event);
        // Convert SAN and publish at most 8 times/sec; never forward raw UCI.
        this.publishTimer ??= setTimeout(() => { this.publishTimer = undefined; this.publish(false); }, 125);
      } else if (event.type === "bestmove" && this.active) {
        this.clearPublish(); clearTimeout(this.stopTimer); this.stopTimer = undefined;
        if (!this.active.cancelled) this.publish(true, event.move, event.ponder);
        this.active = null; this.barrier = true; this.send("isready");
      }
    }
  }
  private publish(complete: boolean, best?: string | null, ponder?: string) {
    const active = this.active; if (!active || active.cancelled) return;
    const { request } = active;
    const lines = [...active.lines.values()].sort((a, b) => a.multiPv - b.multiPv).map((info) => normalizeInfo(request.fen, complete && (info.lowerBound || info.upperBound) ? active.exact.get(info.multiPv) ?? info : info));
    const move = best === undefined ? lines[0]?.pvUci[0] ?? null : best;
    const san = move ? pvToSan(request.fen, [move]).san[0] ?? null : null;
    const result: EngineResult = { ...request, engineBuild: ENGINE_BUILD, engineVersion: this.version, lines, bestMove: san ? move : null, bestMoveSan: san, ...(ponder ? { ponderMove: ponder } : {}) };
    this.emit({ type: "result", result: complete ? withTerminalScore(result) : result, complete });
  }
  fail(message: string) { this.failed = true; this.dispose(); this.emit({ type: "error", message }); }
  private clearPublish() { clearTimeout(this.publishTimer); this.publishTimer = undefined; }
  dispose() { this.clearPublish(); clearTimeout(this.stopTimer); this.active = null; this.pending = null; }
}
