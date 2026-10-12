import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectAnalysis, useAnalysis } from "./analysis";
import { useWorkspace } from "./workspace";
import { engineClient } from "@/lib/engine/client";
import { AnalysisRepository } from "@/lib/engine/repository";
import { defaultEnginePreferences, ENGINE_BUILD, type EngineEvent } from "@/lib/engine/domain";
import { validatePgn } from "@/lib/pgn/import-service";
import { Chess } from "chess.js";
import { chessAt } from "@/lib/game";

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
  it("follows new positions after starting analysis until explicitly stopped", async () => {
    useWorkspace.getState().move("e2", "e4"); expect(engineClient().ready).not.toHaveBeenCalled();
    await useAnalysis.getState().analyze(); expect(engineClient().analyze).toHaveBeenCalledOnce();
    useWorkspace.getState().move("e7", "e5"); await vi.waitFor(() => expect(engineClient().analyze).toHaveBeenCalledTimes(2));
    useAnalysis.getState().stop(); useWorkspace.getState().move("g1", "f3"); expect(engineClient().analyze).toHaveBeenCalledTimes(2);
  });
  it("analyzes completed moves and selected imported variations only when assisted", async () => {
    useAnalysis.getState().start(true); await vi.waitFor(() => expect(engineClient().analyze).toHaveBeenCalledTimes(1));
    useWorkspace.getState().move("e2", "e5"); expect(engineClient().analyze).toHaveBeenCalledTimes(1);
    useWorkspace.getState().move("e2", "e4"); await vi.waitFor(() => expect(engineClient().analyze).toHaveBeenCalledTimes(2));
    const document = (await validatePgn("1. e4 (1. d4 d5) e5 *")).validGames[0];
    useWorkspace.getState().openGame(document); await vi.waitFor(() => expect(engineClient().analyze).toHaveBeenCalledTimes(3));
    useWorkspace.getState().selectNode([0, 0, 1]); await vi.waitFor(() => expect(engineClient().analyze).toHaveBeenCalledTimes(5));
    expect(useAnalysis.getState().fen).toContain("3p4/3P4");
    useAnalysis.getState().stop(); useWorkspace.getState().selectNode([1]); expect(engineClient().analyze).toHaveBeenCalledTimes(5);
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
  it("automatically grades successive review deviations with an uncached parent, even with assistance off", async () => {
    vi.mocked(engineClient().analyze).mockImplementation(async (fen, config) => {
      const move = new Chess(fen).moves({ verbose: true })[0];
      const uci = `${move.from}${move.to}${move.promotion ?? ""}`;
      return { requestId: "review", fen, config, engineBuild: ENGINE_BUILD, engineVersion: "Stockfish Test", bestMove: uci, bestMoveSan: move.san,
        lines: [{ multiPv: 1, depth: 14, score: { type: "cp", value: 0 }, lowerBound: false, upperBound: false, pvUci: [uci], pvSan: [move.san], replayComplete: true }] };
    });
    const document = (await validatePgn("1. e4 e5 *")).validGames[0];
    useWorkspace.getState().openGame(document);
    useAnalysis.getState().start(false);
    expect(useWorkspace.getState().move("a2", "a3").kind).toBe("moved");
    await vi.waitFor(() => expect(useAnalysis.getState().assessment).not.toBeNull());
    expect(engineClient().analyze).toHaveBeenCalledTimes(2);
    const firstKey = `${document.game.id}:${useWorkspace.getState().selectedPath.join(".")}`;
    expect(useAnalysis.getState().reviewAssessments[firstKey]).toEqual(useAnalysis.getState().assessment);
    expect(useWorkspace.getState().move("a7", "a6").kind).toBe("moved");
    await vi.waitFor(() => expect(useAnalysis.getState().assessment).not.toBeNull());
    expect(engineClient().analyze).toHaveBeenCalledTimes(4);
    expect(useAnalysis.getState().result?.fen).toBe(chessAt(useWorkspace.getState().game).fen());
    expect(Object.keys(useAnalysis.getState().reviewAssessments)).toHaveLength(2);
    expect(useAnalysis.getState().preferences.automatic).toBe(false);
  });
  it("does not publish a stale parent analysis after navigating away", async () => {
    const document = (await validatePgn("1. e4 e5 *")).validGames[0];
    useWorkspace.getState().openGame(document);
    let finish: (() => void) | undefined;
    vi.mocked(engineClient().analyze).mockImplementation((fen, config) => new Promise(resolve => {
      finish = () => resolve({ requestId: "old", fen, config, engineBuild: ENGINE_BUILD, engineVersion: "Stockfish Test", lines: [], bestMove: null, bestMoveSan: null });
    }));
    useWorkspace.getState().move("a2", "a3");
    await vi.waitFor(() => expect(finish).toBeDefined());
    useAnalysis.getState().stop();
    useWorkspace.getState().selectNode([]);
    finish!();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(useAnalysis.getState().assessment).toBeNull();
    expect(useAnalysis.getState().result).toBeNull();
    expect(engineClient().analyze).toHaveBeenCalledOnce();
  });
});
