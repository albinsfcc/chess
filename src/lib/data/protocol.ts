import type { GameDocument, ImportResult } from "@/lib/pgn/domain";
import type { GameIdentity } from "@/lib/pgn/hash";
import type { WireGame } from "@/lib/platforms/domain";
import type { LocalBackup } from "./backup-format";
export type DataTasks = {
  validate: { input: { input: string; existing: GameIdentity[] }; output: ImportResult };
  platform: { input: WireGame; output: GameDocument };
  backup: { input: string; output: LocalBackup };
};
export type DataRequest = { [K in keyof DataTasks]: { id: number; kind: K; payload: DataTasks[K]["input"] } }[keyof DataTasks];
export type DataResponse = { id: number; ok: true; value: DataTasks[keyof DataTasks]["output"] } | { id: number; ok: false; error: string };
