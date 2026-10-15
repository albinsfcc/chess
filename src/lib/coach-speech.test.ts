import { afterEach, describe, expect, it, vi } from "vitest";
import { chooseCoachVoice, speakCoach, stopCoachSpeech, useCoachSpeech } from "./coach-speech";
const voice = (name: string, localService = true, lang = "en-US") => ({ name, voiceURI: name, localService, lang, default: false }) as SpeechSynthesisVoice;
afterEach(() => { stopCoachSpeech(); vi.unstubAllGlobals(); useCoachSpeech.setState({ supported: false, voices: [], error: null }); });
describe("coach speech", () => {
  it("respects per-avatar selection, falls back to English, and excludes remote voices", () => {
    const voices = [voice("Remote", false), voice("Zira"), voice("Hazel", true, "en-GB")];
    expect(chooseCoachVoice(voices, "iris", "")).toBe(voices[2]);
    expect(chooseCoachVoice(voices, "iris", "Zira")).toBe(voices[1]);
    expect(chooseCoachVoice(voices, "vera", "unavailable")).toBe(voices[1]);
    expect(chooseCoachVoice([voices[0]], "maia", "Remote")).toBeUndefined();
  });
  it("cancels old speech and ignores stale completion callbacks", () => {
    const utterances: SpeechSynthesisUtterance[] = [];
    const cancel = vi.fn();
    vi.stubGlobal("window", { speechSynthesis: { cancel, speak: (utterance: SpeechSynthesisUtterance) => utterances.push(utterance) } });
    vi.stubGlobal("SpeechSynthesisUtterance", class { constructor(public text: string) {} });
    useCoachSpeech.setState({ supported: true, voices: [voice("Zira")] });
    speakCoach("First move", "maia", "");
    speakCoach("Next move", "maia", "");
    expect(cancel).toHaveBeenCalledTimes(1);
    utterances[1].onstart?.({} as SpeechSynthesisEvent);
    utterances[0].onend?.({} as SpeechSynthesisEvent);
    expect(useCoachSpeech.getState().speaking).toBe(true);
    stopCoachSpeech();
    expect(useCoachSpeech.getState().speaking).toBe(false);
    expect(cancel).toHaveBeenCalledTimes(2);
  });
  it("provides a readable fallback when no local voice is available", () => {
    useCoachSpeech.setState({ supported: true, voices: [] });
    speakCoach("Hello", "maia", "");
    expect(useCoachSpeech.getState().error).toContain("No local English voice");
  });
});
