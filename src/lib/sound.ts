export type SoundEffect = "move" | "capture" | "check" | "checkmate" | "castle" | "promotion" | "invalid" | "click" | "complete";
export const BOARD_SOUNDS: Partial<Record<SoundEffect, string>> = {
  move: "/sounds/move-self.mp3", capture: "/sounds/capture.mp3", castle: "/sounds/castle.mp3",
  check: "/sounds/move-check.mp3", promotion: "/sounds/promote.mp3", checkmate: "/sounds/game-end.webm",
};
const clips = new Map<string, HTMLAudioElement>();
function stopClips() { for (const clip of clips.values()) { clip.pause(); clip.currentTime = 0; } }
/** SAN already encodes en passant/promotion captures and check; use the strongest cue. */
export function moveSound(san: string): SoundEffect {
  if (san.includes("#")) return "checkmate";
  if (san.includes("+")) return "check";
  if (san.includes("=")) return "promotion";
  if (san.startsWith("O-O")) return "castle";
  if (san.includes("x")) return "capture";
  return "move";
}
// Only UI notifications use synthesis. Board events use the user-specified local recordings.
const notes: Record<SoundEffect, number[]> = {
  move: [440], capture: [220, 150], check: [660, 880], checkmate: [523, 392, 262],
  castle: [330, 440], promotion: [], invalid: [155, 130], click: [900], complete: [523, 659, 784, 1047],
};
let context: AudioContext | undefined;
let enabled = true;
const voices = new Set<OscillatorNode | AudioBufferSourceNode>();
export function setSoundEnabled(value: boolean) {
  enabled = value;
  if (!value) stopClips();
  if (!value) { for (const voice of voices) { try { voice.stop(); } catch { /* Already ended. */ } } voices.clear(); }
}
export function unlockSound() {
  if (!enabled || typeof window === "undefined") return;
  try {
    for (const path of Object.values(BOARD_SOUNDS)) {
      if (!clips.has(path)) { const clip = new Audio(path); clip.preload = "auto"; clips.set(path, clip); }
    }
    if (!window.AudioContext) return;
    context ??= new AudioContext();
    if (context.state === "suspended") void context.resume().catch(() => {});
  } catch { /* Audio is optional; restricted browsers remain silent. */ }
}
export function playSound(effect: SoundEffect) {
  unlockSound();
  if (!enabled || typeof document === "undefined" || document.visibilityState === "hidden") return;
  const path = BOARD_SOUNDS[effect];
  if (path) {
    try { stopClips(); const clip = clips.get(path); if (clip) void clip.play().catch(() => {}); } catch { /* Audio failure must not block moves. */ }
    return;
  }
  if (!context || context.state !== "running") return;
  const audio = context;
  // Bound audio work during rapid navigation; short envelopes avoid harsh clicks.
  if (voices.size > 12) return;
  try {
    const duration = effect === "click" ? 0.025 : effect === "move" ? 0.065 : 0.1;
    notes[effect].forEach((frequency, index) => {
      const oscillator = audio.createOscillator(), gain = audio.createGain(), start = audio.currentTime + index * duration + (effect === "check" || effect === "checkmate" ? 0.12 : 0);
      oscillator.type = effect === "invalid" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(effect === "click" ? 0.035 : 0.1, start + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.connect(gain); gain.connect(audio.destination); voices.add(oscillator);
      oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(start); oscillator.stop(start + duration + 0.01);
    });
  } catch { /* Device/audio failures must not interrupt a move. */ }
}
export function disposeSound() {
  stopClips();
  for (const clip of clips.values()) { clip.removeAttribute("src"); clip.load(); }
  clips.clear();
  const previous = context; context = undefined; voices.clear();
  if (previous) void previous.close().catch(() => {});
}
