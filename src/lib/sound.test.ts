import { describe, expect, it, vi } from "vitest";
import { assessmentSound, boardChangeSound, moveSound, playSound, setSoundEnabled, disposeSound } from "./sound";
import { createGame, type GameState } from "./game";

describe("move sound precedence", () => {
  it("uses special cues only for blunder and brilliant classifications", () => {
    expect(assessmentSound("Blunder")).toBe("blunder");
    expect(assessmentSound("Brilliant")).toBe("brilliant");
    expect(assessmentSound("Best")).toBeNull();
    expect(assessmentSound("Mistake")).toBeNull();
    expect(assessmentSound()).toBeNull();
  });
  it("sounds backward navigation, jumps and same-ply branch selection without sounding no-ops", () => {
    const game: GameState = { ...createGame(), moves: [{ from: "e2", to: "e4", san: "e4" }, { from: "d7", to: "d5", san: "d5" }, { from: "e4", to: "d5", san: "exd5" }], cursor: 3 };
    const end = { game, selectedPath: [2], boardTransition: "navigate" as const };
    const start = { game: { ...game, cursor: 0 }, selectedPath: [], boardTransition: "navigate" as const };
    expect(boardChangeSound(start, end)).toBe("move");
    expect(boardChangeSound(end, start)).toBe("capture");
    expect(boardChangeSound({ ...end, game: { ...game }, selectedPath: [1000000, 0, 0] }, end)).toBe("capture");
    expect(boardChangeSound({ ...end, game: { ...game } }, end)).toBeNull();
    expect(boardChangeSound({ ...start, boardTransition: "replace" }, end)).toBeNull();
    expect(boardChangeSound(end, end)).toBeNull();
  });
  it.each([
    ["e4", "move"], ["exd6", "capture"], ["gxh8=Q", "promotion"], ["e8=N", "promotion"], ["e8=Q+", "check"],
    ["O-O", "castle"], ["O-O-O", "castle"], ["Bxf7+", "check"],
    ["O-O+", "check"], ["Qxh7#", "checkmate"], ["e8=Q#", "checkmate"],
  ])("%s uses %s", (san, expected) => expect(moveSound(san)).toBe(expected));
  it("is safe without browser audio and when muted", () => {
    expect(() => { setSoundEnabled(false); playSound("complete"); disposeSound(); setSoundEnabled(true); playSound("move"); }).not.toThrow();
  });
  it("plays local recordings, stops on mute and releases clips", () => {
    const clips: { src: string; play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn> }[] = [];
    class AudioMock {
      preload = ""; currentTime = 0;
      play = vi.fn(() => Promise.resolve()); pause = vi.fn(); load = vi.fn(); removeAttribute = vi.fn();
      constructor(public src: string) { clips.push(this); }
    }
    vi.stubGlobal("window", {}); vi.stubGlobal("document", { visibilityState: "visible" }); vi.stubGlobal("Audio", AudioMock);
    try {
      playSound("promotion");
      expect(clips.find(clip => clip.src === "/sounds/promote.mp3")?.play).toHaveBeenCalledOnce();
      playSound("checkmate");
      expect(clips.find(clip => clip.src === "/sounds/game-end.webm")?.play).toHaveBeenCalledOnce();
      playSound("blunder");
      expect(clips.find(clip => clip.src === "/sounds/blunder.mp3")?.play).toHaveBeenCalledOnce();
      playSound("brilliant");
      expect(clips.find(clip => clip.src === "/sounds/brilliant.mp3")?.play).toHaveBeenCalledOnce();
      setSoundEnabled(false); playSound("move");
      expect(clips.find(clip => clip.src === "/sounds/move-self.mp3")?.play).not.toHaveBeenCalled();
      expect(clips.every(clip => clip.pause.mock.calls.length > 0)).toBe(true);
    } finally { disposeSound(); setSoundEnabled(true); vi.unstubAllGlobals(); }
  });
});
