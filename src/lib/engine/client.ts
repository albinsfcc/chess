import { ENGINE_ASSET_ROOT, PRESETS, configSchema, type AnalysisConfig, type EngineEvent, type EngineResult, type WorkerCommand, type WorkerEvent } from "./domain";

export interface EngineWorker {
  postMessage(message: WorkerCommand): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<WorkerEvent>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
}
const abortError = () => new DOMException("Analysis cancelled", "AbortError");
export class EngineClient {
  private worker: EngineWorker | null = null;
  private generation = 0;
  private counter = 0;
  private version: string | null = null;
  private boot: { promise: Promise<string>; resolve: (version: string) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private active: { id: string; fen: string; resolve: (result: EngineResult) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  private listeners = new Set<(event: EngineEvent) => void>();
  private owner: string | null = null;
  get reserved() { return this.owner !== null; }
  acquire(owner: string): () => void {
    if (this.owner) throw new Error("The engine is already reserved by another analysis session.");
    this.stop(); this.owner = owner;
    return () => { if (this.owner === owner) this.owner = null; };
  }
  private checkOwner(owner?: string) { if (this.owner && this.owner !== owner) throw new Error("Pause the complete-game queue before using live analysis."); }
  constructor(private readonly factory: () => EngineWorker = () => new Worker(`/engines/analysis-worker.js#${ENGINE_ASSET_ROOT}/stockfish-19-lite-single.wasm`, { name: "Stockfish analysis" }), private readonly bootTimeout = 30_000) {}
  subscribe(listener: (event: EngineEvent) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private emit(event: EngineEvent) { this.listeners.forEach((listener) => listener(event)); }
  private send(command: WorkerCommand): boolean {
    try { this.worker?.postMessage(command); return true; }
    catch { this.fail("Stockfish worker communication failed. Restart to try again."); return false; }
  }
  ready(): Promise<string> {
    if (this.version && this.worker) return Promise.resolve(this.version);
    if (this.boot) return this.boot.promise;
    this.emit({ type: "status", status: "loading" });
    let resolve!: (version: string) => void, reject!: (error: Error) => void;
    const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no; });
    this.boot = { promise, resolve, reject, timer: setTimeout(() => this.fail("Stockfish initialization timed out. Restart to try again."), this.bootTimeout) };
    const generation = ++this.generation;
    try {
      const worker = this.factory(); this.worker = worker;
      worker.onmessage = ({ data }) => { if (generation === this.generation) this.receive(data); };
      worker.onerror = () => { if (generation === this.generation) this.fail("Stockfish worker failed. Restart to try again."); };
      worker.onmessageerror = () => { if (generation === this.generation) this.fail("Stockfish returned an unreadable result. Restart to try again."); };
      worker.postMessage({ type: "initialize" });
    } catch { this.fail("Stockfish could not start. This browser may not support Web Workers or WebAssembly."); }
    return promise;
  }
  private receive(event: WorkerEvent) {
    if (event.type === "ready") {
      this.version = event.engineVersion;
      if (this.boot) { clearTimeout(this.boot.timer); this.boot.resolve(this.version); this.boot = null; }
      this.emit(event); this.emit({ type: "status", status: "ready" });
    } else if (event.type === "error") {
      if (event.requestId && event.requestId !== this.active?.id) return;
      this.fail(event.message);
    } else if (this.active && event.result.requestId === this.active.id && event.result.fen === this.active.fen) {
      if (event.complete) {
        const active = this.active; this.active = null; clearTimeout(active.timer); active.resolve(event.result);
        this.emit(event); this.emit({ type: "status", status: "ready" });
      } else this.emit(event);
    }
  }
  async analyze(fen: string, config: AnalysisConfig, owner?: string): Promise<EngineResult> {
    this.checkOwner(owner);
    configSchema.parse(config);
    this.stop(owner); const serial = this.counter;
    await this.ready();
    if (serial !== this.counter) throw abortError();
    const id = `${this.generation}:${serial}`;
    return new Promise<EngineResult>((resolve, reject) => {
      this.active = { id, fen, resolve, reject, timer: setTimeout(() => this.fail("Stockfish search timed out. Restart to continue."), PRESETS[config.preset] + 7000) };
      this.emit({ type: "status", status: "analyzing" });
      this.send({ type: "search", request: { requestId: id, fen, config } });
    });
  }
  stop(owner?: string) {
    if (this.owner && this.owner !== owner) return;
    this.counter++;
    if (this.active) { clearTimeout(this.active.timer); this.active.reject(abortError()); this.active = null; }
    if (this.send({ type: "stop" })) this.emit({ type: "status", status: "stopped" });
  }
  newGame(owner?: string) { if (this.owner && this.owner !== owner) return; this.stop(owner); this.send({ type: "new-game" }); }
  terminate(owner?: string) {
    if (this.owner && this.owner !== owner) return;
    this.stop(owner); this.generation++; this.worker?.terminate(); this.worker = null; this.version = null;
    if (this.boot) { clearTimeout(this.boot.timer); this.boot.reject(abortError()); this.boot = null; }
  }
  restart(): Promise<string> { this.checkOwner(); this.terminate(); return this.ready(); }
  private fail(message: string) {
    const error = new Error(message);
    this.counter++; this.generation++; this.worker?.terminate(); this.worker = null; this.version = null;
    if (this.boot) { clearTimeout(this.boot.timer); this.boot.reject(error); this.boot = null; }
    if (this.active) { clearTimeout(this.active.timer); this.active.reject(error); this.active = null; }
    this.emit({ type: "error", message }); this.emit({ type: "status", status: "error" });
  }
}
let engine: EngineClient | undefined;
export function engineClient() { return engine ??= new EngineClient(); }
