import { describe, expect, it, vi } from "vitest";
import { moveSound, playSound, setSoundEnabled, disposeSound } from "./sound";

describe("move sound precedence", () => {
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
      setSoundEnabled(false); playSound("move");
      expect(clips.find(clip => clip.src === "/sounds/move-self.mp3")?.play).not.toHaveBeenCalled();
      expect(clips.every(clip => clip.pause.mock.calls.length > 0)).toBe(true);
    } finally { disposeSound(); setSoundEnabled(true); vi.unstubAllGlobals(); }
  });
});
