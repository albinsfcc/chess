import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectAnalysis, useAnalysis } from "./analysis";
import { useWorkspace } from "./workspace";
import { engineClient } from "@/lib/engine/client";
import { AnalysisRepository } from "@/lib/engine/repository";
import { defaultEnginePreferences, ENGINE_BUILD, type EngineEvent } from "@/lib/engine/domain";
import { validatePgn } from "@/lib/pgn/import-service";

let disconnect: () => void;
beforeEach(() => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  useWorkspace.getState().reset();
  useAnalysis.setState({ preferences: { ...defaultEnginePreferences }, hydrated: false, enabled: false, status: "stopped", result: null, fen: null, error: null });
  vi.spyOn(engineClient(), "ready").mockResolvedValue("Stockfish Test");
  vi.spyOn(engineClient(), "analyze").mockImplementation(async (fen, config) => ({ requestId: "1", fen, config, engineBuild: ENGINE_BUILD, engineVersion: "Stockfish Test", lines: [], bestMove: null, bestMoveSan: null }));
  vi.spyOn(AnalysisRepository.prototype, "get").mockResolvedValue(null);
  vi.spyOn(AnalysisRepository.prototype, "save").mockResolvedValue(undefined);
  disconnect = connectAnalysis();
});
afterEach(() => { disconnect(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe("analysis workspace coordination", () => {
  it("hydrates preferences before a child panel starts assistance and resets live lifecycle on unmount", async () => {
    const preferences = { ...defaultEnginePreferences, preset: "quick", multiPv: 5, showArrow: false };
    vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(preferences), setItem: vi.fn() });
    useAnalysis.setState({ hydrated: false });
    useAnalysis.getState().start(true);
    expect(useAnalysis.getState().preferences).toMatchObject({ preset: "quick", multiPv: 5 });
    await vi.waitFor(() => expect(engineClient().analyze).toHaveBeenCalled());
    disconnect(); expect(useAnalysis.getState().enabled).toBe(false); expect(useAnalysis.getState().status).toBe("stopped");
  });
  it("keeps stopped status when a pending engine initialization finishes after Free play is chosen", () => {
    disconnect();
    let receive: ((event: EngineEvent) => void) | undefined;
    vi.spyOn(engineClient(), "subscribe").mockImplementation((listener) => { receive = listener; return () => {}; });
    disconnect = connectAnalysis(); useAnalysis.getState().start(false);
    receive?.({ type: "ready", engineVersion: "Stockfish Test" }); receive?.({ type: "status", status: "ready" });
    expect(useAnalysis.getState()).toMatchObject({ enabled: false, status: "stopped", version: "Stockfish Test" });
  });
  it("does not start the engine in free play or automatically after a manual one-position search", async () => {
    useWorkspace.getState().move("e2", "e4"); expect(engineClient().ready).not.toHaveBeenCalled();
    await useAnalysis.getState().analyze(); expect(engineClient().analyze).toHaveBeenCalledOnce();
    useWorkspace.getState().move("e7", "e5"); expect(engineClient().analyze).toHaveBeenCalledOnce(); expect(useAnalysis.getState().result).toBeNull();
  });
  it("analyzes completed moves and selected imported variations only when assisted", async () => {
    useAnalysis.getState().start(true); await vi.waitFor(() => expect(engineClient().analyze).toHaveBeenCalledTimes(1));
    useWorkspace.getState().move("e2", "e5"); expect(engineClient().analyze).toHaveBeenCalledTimes(1);
    useWorkspace.getState().move("e2", "e4"); await vi.waitFor(() => expect(engineClient().analyze).toHaveBeenCalledTimes(2));
    const document = (await validatePgn("1. e4 (1. d4 d5) e5 *")).validGames[0];
    useWorkspace.getState().openGame(document); await vi.waitFor(() => expect(engineClient().analyze).toHaveBeenCalledTimes(3));
    useWorkspace.getState().selectNode([0, 0, 1]); await vi.waitFor(() => expect(engineClient().analyze).toHaveBeenCalledTimes(4));
    expect(useAnalysis.getState().fen).toContain("3p4/3P4");
    useAnalysis.getState().stop(); useWorkspace.getState().selectNode([1]); expect(engineClient().analyze).toHaveBeenCalledTimes(4);
  });
  it("blocks unsupported variants before initializing or submitting to the engine", async () => {
    const document = (await validatePgn('[Variant "Atomic"]\n1. e5 *')).unsupportedGames[0];
    useWorkspace.setState({ imported: document }); await useAnalysis.getState().analyze();
    expect(engineClient().ready).not.toHaveBeenCalled(); expect(engineClient().analyze).not.toHaveBeenCalled();
    expect(useAnalysis.getState().error).toContain("unsupported");
  });
  it("reanalyzes current position with changed search settings", async () => {
    await useAnalysis.getState().analyze(); useAnalysis.getState().updatePreferences({ preset: "deep", multiPv: 5 });
    await vi.waitFor(() => expect(engineClient().analyze).toHaveBeenCalledTimes(2));
    expect(vi.mocked(engineClient().analyze).mock.calls[1][1]).toEqual({ preset: "deep", multiPv: 5 });
  });
});
