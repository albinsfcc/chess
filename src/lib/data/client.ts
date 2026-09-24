import type { DataRequest, DataResponse, DataTasks } from "./protocol";
type Job = { request: DataRequest; resolve: (value: DataTasks[keyof DataTasks]["output"]) => void; reject: (error: Error) => void; signal?: AbortSignal; cleanup: () => void };
let worker: Worker | null = null, current: Job | null = null, sequence = 0;
let timeout: ReturnType<typeof setTimeout> | undefined, idle: ReturnType<typeof setTimeout> | undefined;
const waiting: Job[] = [];
function finish(error?: Error, value?: DataTasks[keyof DataTasks]["output"]) {
  clearTimeout(timeout); const job = current; current = null;
  if (job) { job.cleanup(); if (error) job.reject(error); else if (value) job.resolve(value); }
  pump();
}
function fail(message: string) { worker?.terminate(); worker = null; finish(new Error(message)); }
function pump() {
  if (current) return;
  clearTimeout(idle);
  current = waiting.shift() ?? null;
  if (!current) { idle = setTimeout(() => { worker?.terminate(); worker = null; }, 5000); return; }
  try {
    if (!worker) {
      worker = new Worker("/workers/data-worker.js", { name: "PGN and backup validation" });
      const instance = worker;
      worker.onmessage = ({ data }: MessageEvent<DataResponse>) => { if (worker === instance && data.id === current?.request.id) finish(data.ok ? undefined : new Error(data.error), data.ok ? data.value : undefined); };
      worker.onerror = () => { if (worker === instance) fail("Data validation worker failed. Your input is kept; try a smaller batch or reload."); };
      worker.onmessageerror = () => { if (worker === instance) fail("Could not read the validated data. Try again with a smaller batch."); };
    }
    timeout = setTimeout(() => fail("Data validation timed out. Split the input into smaller batches and retry."), 60_000);
    worker.postMessage(current.request);
  } catch { fail("Data validation could not start. Check browser Web Worker support and reload."); }
}
export function runDataTask<K extends keyof DataTasks>(kind: K, payload: DataTasks[K]["input"], signal?: AbortSignal): Promise<DataTasks[K]["output"]> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (waiting.length >= 8) return Promise.reject(new Error("Data validation is busy. Wait for the current import to finish."));
  return new Promise((resolve, reject) => {
    // The request discriminant defines the response type at this single RPC boundary.
    const job: Job = { request: { id: ++sequence, kind, payload } as DataRequest, resolve: (value) => resolve(value as DataTasks[K]["output"]), reject, signal, cleanup: () => signal?.removeEventListener("abort", abort) };
    function abort() {
      const error = new DOMException("Validation cancelled. Your input is kept.", "AbortError");
      if (current === job) { worker?.terminate(); worker = null; finish(error); }
      else { const index = waiting.indexOf(job); if (index >= 0) waiting.splice(index, 1); job.cleanup(); reject(error); }
    }
    signal?.addEventListener("abort", abort, { once: true }); waiting.push(job); pump();
  });
}
