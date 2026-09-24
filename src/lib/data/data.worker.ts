import { immediateThreats } from "@/lib/engine/threats";
import { validatePgn } from "@/lib/pgn/validate";
import { normalizePlatformGame } from "@/lib/platforms/normalize-game";
import type { DataRequest, DataResponse } from "./protocol";
import { validateBackup } from "./validate-backup";
const scope = globalThis as unknown as { onmessage: (event: MessageEvent<DataRequest>) => void; postMessage: (message: DataResponse) => void };
scope.onmessage = async ({ data }) => {
  try {
    const value = data.kind === "threats" ? immediateThreats(data.payload) : data.kind === "validate" ? await validatePgn(data.payload.input, data.payload.existing) : data.kind === "backup" ? await validateBackup(data.payload) : await normalizePlatformGame(data.payload);
    scope.postMessage({ id: data.id, ok: true, value });
  } catch (error) { scope.postMessage({ id: data.id, ok: false, error: error instanceof Error ? error.message : "Data validation failed." }); }
};
