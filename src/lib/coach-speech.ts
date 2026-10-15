import { create } from "zustand";
import { coachById, type CoachId } from "./coach-personas";

export const useCoachSpeech = create<{ supported: boolean; voices: SpeechSynthesisVoice[]; speaking: boolean; error: string | null }>(() => ({ supported: false, voices: [], speaking: false, error: null }));
let generation = 0;
let current: SpeechSynthesisUtterance | null = null;
export function stopCoachSpeech() {
  generation++;
  if (current && typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  current = null;
  useCoachSpeech.setState({ speaking: false });
}
export function connectCoachSpeech() {
  const supported = "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
  useCoachSpeech.setState({ supported });
  if (!supported) return () => {};
  const refresh = () => useCoachSpeech.setState({ voices: window.speechSynthesis.getVoices().filter(voice => voice.localService) });
  const hidden = () => { if (document.hidden) stopCoachSpeech(); };
  refresh();
  window.speechSynthesis.addEventListener("voiceschanged", refresh);
  document.addEventListener("visibilitychange", hidden);
  return () => { stopCoachSpeech(); window.speechSynthesis.removeEventListener("voiceschanged", refresh); document.removeEventListener("visibilitychange", hidden); };
}
export function chooseCoachVoice(voices: SpeechSynthesisVoice[], avatar: CoachId, uri: string) {
  const coach = coachById(avatar), local = voices.filter(voice => voice.localService);
  return local.find(voice => voice.voiceURI === uri) ?? local.find(voice => coach.preferred.test(voice.name) && /^en\b/i.test(voice.lang)) ?? local.find(voice => voice.lang === coach.lang) ?? local.find(voice => /^en\b/i.test(voice.lang));
}
export function speakCoach(text: string, avatar: CoachId, uri: string) {
  stopCoachSpeech();
  const { supported, voices } = useCoachSpeech.getState();
  if (!supported) { useCoachSpeech.setState({ error: "Spoken commentary isn't available in this browser. You can still read every comment." }); return; }
  const voice = chooseCoachVoice(voices, avatar, uri);
  if (!voice) { useCoachSpeech.setState({ error: "No local English voice is available yet. Install a device voice or try again once voices have loaded." }); return; }
  const coach = coachById(avatar), token = generation;
  const utterance = new SpeechSynthesisUtterance(text);
  current = utterance;
  utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = coach.rate; utterance.pitch = coach.pitch;
  useCoachSpeech.setState({ error: null });
  utterance.onstart = () => { if (token === generation) useCoachSpeech.setState({ speaking: true }); };
  utterance.onend = () => { if (token === generation) { current = null; useCoachSpeech.setState({ speaking: false }); } };
  utterance.onerror = event => {
    if (token !== generation) return;
    current = null;
    useCoachSpeech.setState({ speaking: false, error: event.error === "canceled" || event.error === "interrupted" ? null : "Speech couldn't play. Use Replay to try again, or choose another voice in Settings." });
  };
  try { window.speechSynthesis.speak(utterance); }
  catch { current = null; useCoachSpeech.setState({ speaking: false, error: "Speech couldn't start. Try another voice in Settings." }); }
}
