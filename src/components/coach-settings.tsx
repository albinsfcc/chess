"use client";
import { useEffect } from "react";
import { COACHES, coachById } from "@/lib/coach-personas";
import { chooseCoachVoice, speakCoach, stopCoachSpeech, useCoachSpeech } from "@/lib/coach-speech";
import { useCoach } from "@/store/coach";
import { CoachAvatar } from "./coach-avatar";
import { Switch } from "./ui/switch";
import { Button } from "./ui/button";

export function CoachSettings() {
  useEffect(() => () => stopCoachSpeech(), []);
  const { preferences, update, error } = useCoach();
  const speech = useCoachSpeech();
  const coach = coachById(preferences.avatar);
  const voice = chooseCoachVoice(speech.voices, coach.id, preferences.voices[coach.id]);
  return <section className="space-y-4 border-t pt-4" aria-labelledby="coach-settings-heading">
    <div className="flex items-center justify-between gap-3"><h3 id="coach-settings-heading" className="font-medium">Your chess coach</h3><Switch aria-label="Show chess coach" checked={preferences.enabled} onCheckedChange={enabled => { stopCoachSpeech(); update({ enabled }); }} /></div>
    <p className="text-xs text-muted-foreground">A familiar face, a fresh perspective on every move.</p>
    <div className="coach-avatar-options" role="group" aria-label="Choose your coach">{COACHES.map(c => <button type="button" key={c.id} className="coach-avatar-option" aria-pressed={preferences.avatar === c.id} onClick={() => { stopCoachSpeech(); update({ avatar: c.id }); }}>
      <CoachAvatar avatar={c.id} /><strong>{c.name}</strong><span>{c.style}</span>
    </button>)}</div>
    <div className="flex items-center justify-between gap-3"><label htmlFor="coach-spoken" className="text-sm font-medium">Spoken commentary</label><Switch id="coach-spoken" checked={preferences.spoken} disabled={!speech.supported} onCheckedChange={spoken => { stopCoachSpeech(); update({ spoken }); }} /></div>
    <div className="space-y-2"><label htmlFor="coach-voice" className="text-sm">{coach.name}’s voice · {coach.voice}</label>
      <select id="coach-voice" className="w-full rounded-md border bg-background p-2 text-sm" value={preferences.voices[coach.id]} onChange={event => { stopCoachSpeech(); update({ voices: { ...preferences.voices, [coach.id]: event.target.value } }); }}>
        <option value="">Automatic local voice{voice ? ` (${voice.name})` : ""}</option>
        {preferences.voices[coach.id] && !speech.voices.some(v => v.voiceURI === preferences.voices[coach.id]) && <option value={preferences.voices[coach.id]}>Saved voice unavailable · using automatic fallback</option>}
        {speech.voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}
      </select>
      <p className="text-xs text-muted-foreground">Uses voices installed on this device. Coaches have different pacing and tone; available voices may be shared. No microphone is needed.</p>
      <Button variant="outline" disabled={!speech.supported || !voice} onClick={() => speakCoach(`Hi, I'm ${coach.name}. Let's look for the ideas behind your next move.`, coach.id, preferences.voices[coach.id])}>Preview {coach.name}’s voice</Button>
      {speech.speaking && <Button variant="ghost" onClick={stopCoachSpeech}>Stop speaking</Button>}
    </div>
    {!speech.supported && <p className="text-xs text-muted-foreground">This browser does not support spoken commentary. Text commentary is still available.</p>}
    {speech.supported && !voice && <p className="text-xs text-muted-foreground">Waiting for a local English voice. If none appears, install one in your device’s speech settings.</p>}
    {(error || speech.error) && <p role="status" className="text-xs text-destructive">{error || speech.error}</p>}
  </section>;
}
