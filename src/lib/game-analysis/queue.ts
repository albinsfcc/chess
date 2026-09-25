import { GamesRepository, gamesRepository } from "@/lib/db/games";
import { engineClient, type EngineClient } from "@/lib/engine/client";
import { AnalysisRepository } from "@/lib/engine/repository";
import { configurationHash } from "@/lib/engine/configuration";
import { gameConfigSchema, type GameAnalysis, type GameAnalysisConfig } from "./domain";
import { generatePositions, positionRange, validateAssociations } from "./positions";
import { GameAnalysisRepository } from "./repository";
import { usableResult, withTerminalScore } from "@/lib/engine/result-quality";

export type QueueEvent = { type: "session"; session: GameAnalysis } | { type: "busy"; busy: boolean } | { type: "error"; message: string };
export type EngineForQueue = Pick<EngineClient, "ready" | "analyze" | "stop" | "newGame" | "acquire">;
function interruptible<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason); };
    signal.addEventListener("abort", abort, { once: true });
    pending.then((value) => { signal.removeEventListener("abort", abort); resolve(value); }, (error: unknown) => { signal.removeEventListener("abort", abort); reject(error); });
    if (signal.aborted) abort();
  });
}
export async function withQueueLock<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || !navigator.locks) return work();
  return navigator.locks.request("chess-review:game-analysis", { ifAvailable: true }, (lock) => {
    if (!lock) throw new Error("Another browser tab is analyzing games. Pause it before continuing here.");
    return work();
  });
}
/** One sequential queue, independent of React component lifetime. */
export class GameAnalysisQueue {
  private busy = false;
  private controller: AbortController | null = null;
  private desired: "paused" | "cancelled" = "paused";
  private owner = "";
  private sessionId: string | null = null;
  private task: Promise<void> | null = null;
  constructor(private readonly engine: EngineForQueue, private readonly sessions: GameAnalysisRepository, private readonly games: GamesRepository,
    private readonly cache: AnalysisRepository, private readonly emit: (event: QueueEvent) => void, private readonly lock = withQueueLock) {}
  get active() { return this.busy; }
  start(gameId: string, branch: GameAnalysis["selectedTreePath"], configuration: GameAnalysisConfig) {
    return this.launch({ gameId, branch, configuration: gameConfigSchema.parse(configuration) });
  }
  resume(id: string) { return this.launch({ id }); }
  async recover() { if (!this.busy) await this.lock(() => this.sessions.recover()); }
  async pause() { await this.interrupt("paused"); }
  async cancel(id?: string) {
    if (this.busy && (!id || id === this.sessionId)) await this.interrupt("cancelled");
    else if (id) await this.lock(async () => { this.emit({ type: "session", session: await this.sessions.update(id, { status: "cancelled", runId: undefined }) }); });
  }
  private async interrupt(status: "paused" | "cancelled") {
    this.desired = status; this.controller?.abort(); this.engine.stop(this.owner); await this.task;
  }
  private launch(input: { id: string } | { gameId: string; branch: GameAnalysis["selectedTreePath"]; configuration: GameAnalysisConfig }) {
    if (this.busy) return Promise.reject(new Error("Pause the active analysis before starting another session."));
    this.busy = true; this.desired = "paused"; this.controller = new AbortController(); this.owner = crypto.randomUUID();
    const signal = this.controller.signal;
    this.emit({ type: "busy", busy: true });
    this.task = this.lock(async () => {
      const release = this.engine.acquire(this.owner); let session: GameAnalysis | null = null; let currentPly: number | null = null;
      try {
        if ("id" in input) session = await this.sessions.get(input.id);
        const document = await this.games.get(session?.gameId ?? ("gameId" in input ? input.gameId : ""));
        const branch = session?.selectedTreePath ?? ("branch" in input ? input.branch : "main");
        const configuration = session?.configuration ?? ("configuration" in input ? input.configuration : gameConfigSchema.parse({}));
        const positions = positionRange(generatePositions(document.tree, branch), configuration);
        const hash = await configurationHash(configuration); signal.throwIfAborted();
        const version = await interruptible(this.engine.ready(), signal); signal.throwIfAborted();
        if (session && (session.engineVersion !== version || session.configurationHash !== hash || session.totalPositions !== positions.length)) throw new Error("The engine version, settings or game tree differs from this saved session. Start a new analysis; previous results remain available.");
        if (!session) {
          const now = new Date().toISOString();
          session = { id: crypto.randomUUID(), gameId: document.game.id, selectedTreePath: branch, engineName: "Stockfish", engineVersion: version, configuration, configurationHash: hash,
            totalPositions: positions.length, completedPositions: 0, status: "queued", startedAt: now, updatedAt: now, completedAt: null };
          await this.sessions.create(session);
        }
        this.sessionId = session.id;
        const existing = await this.sessions.positions(session.id);
        validateAssociations(session, positions, existing);
        const done = new Set(existing.filter((row) => usableResult(row.result)).map((row) => row.ply));
        session = await this.sessions.update(session.id, { status: "running", completedPositions: done.size, runId: this.owner, lastError: undefined, completedAt: null });
        this.emit({ type: "session", session }); this.engine.newGame(this.owner);
        for (const position of positions) {
          signal.throwIfAborted(); if (done.has(position.ply)) continue;
          currentPly = position.ply;
          let result = await this.cache.get(position.fen, version, configuration);
          if (result) result = withTerminalScore(result);
          if (result && !usableResult(result)) result = null;
          const fromCache = result !== null;
          signal.throwIfAborted();
          if (!result) {
            result = withTerminalScore(await this.engine.analyze(position.fen, configuration, this.owner)); signal.throwIfAborted();
            if (!usableResult(result)) { result = withTerminalScore(await this.engine.analyze(position.fen, configuration, this.owner)); signal.throwIfAborted(); }
            if (!usableResult(result)) throw new Error("The engine returned no usable exact evaluation after retry. Resume to retry this position; no grade has been invented.");
            await this.cache.save(result);
          }
          signal.throwIfAborted();
          session = await this.sessions.commit(session, position, result, fromCache);
          this.emit({ type: "session", session });
        }
        if (session.status !== "completed") { session = await this.sessions.update(session.id, { status: "completed", completedAt: new Date().toISOString(), lastError: undefined }); this.emit({ type: "session", session }); }
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Analysis could not continue. Check browser storage and retry.";
        const message = currentPly === null ? detail : `At ply ${currentPly}: ${detail}`;
        if (session) {
          try {
            const latest = await this.sessions.get(session.id);
            if (latest.status !== "completed") this.emit({ type: "session", session: await this.sessions.update(session.id, { status: signal.aborted ? this.desired : "failed", runId: undefined, lastError: signal.aborted ? undefined : `${message} Earlier completed positions were kept.` }) });
          } catch { this.emit({ type: "error", message: "Analysis stopped, but its status could not be saved. Check browser storage. Previously committed positions remain available; reload and Resume." }); }
        }
        if (!signal.aborted) this.emit({ type: "error", message });
      } finally { this.engine.stop(this.owner); release(); }
    }).catch((error: unknown) => { this.emit({ type: "error", message: error instanceof Error ? error.message : "The analysis queue is unavailable." }); }).finally(() => {
      this.busy = false; this.sessionId = null; this.controller = null; this.emit({ type: "busy", busy: false });
    });
    return this.task;
  }
}
let queue: GameAnalysisQueue | undefined;
export function gameAnalysisQueue(emit: (event: QueueEvent) => void) {
  return queue ??= new GameAnalysisQueue(engineClient(), new GameAnalysisRepository(), gamesRepository(), new AnalysisRepository(), emit);
}
