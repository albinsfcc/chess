import { ENGINE_ASSET_ROOT, type WorkerCommand, type WorkerEvent } from "./domain";
import { UciSession } from "./session";

// A classic worker hosts the unmodified vendor loader AND our UCI adapter.
// The vendor exposes its worker onmessage/postMessage protocol, so capture that
// protocol here instead of spawning a second worker or running WASM on the page.
type EngineWorkerScope = {
  postMessage: (message: WorkerEvent | string) => void;
  onmessage: ((event: MessageEvent<WorkerCommand | string>) => void) | null;
  importScripts: (...urls: string[]) => void;
  addEventListener: (type: "unhandledrejection", listener: (event: PromiseRejectionEvent) => void) => void;
};
const scope = globalThis as unknown as EngineWorkerScope;
const sendToClient = scope.postMessage.bind(scope);
let vendorReceive: EngineWorkerScope["onmessage"] = null;
const session = new UciSession((command) => {
  // Avoid calling back into WASM while it is emitting an output line.
  setTimeout(() => vendorReceive?.({ data: command } as MessageEvent<string>), 0);
}, (event) => sendToClient(event));
scope.postMessage = (message) => { if (typeof message === "string") session.receive(message); };
try {
  scope.importScripts(`${ENGINE_ASSET_ROOT}/stockfish-19-lite-single.js`);
  vendorReceive = scope.onmessage;
  if (!vendorReceive) throw new Error("Missing engine command handler");
  scope.onmessage = (event) => { if (typeof event.data === "object") session.command(event.data); };
} catch { session.fail("Stockfish could not load. Check WASM support and the local engine assets, then restart."); }
scope.addEventListener("unhandledrejection", (event) => { event.preventDefault(); session.fail("Stockfish failed to load or execute. Restart the engine to try again."); });
