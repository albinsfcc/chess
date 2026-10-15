import { coachById, type CoachId } from "@/lib/coach-personas";

/** Original scalable vector portraits; no external image or font requests. */
export function CoachAvatar({ avatar, speaking = false, mood = "thinking", className = "" }: { avatar: CoachId; speaking?: boolean; mood?: "happy" | "thinking" | "concerned"; className?: string }) {
  const c = coachById(avatar);
  return <svg viewBox="0 0 160 180" className={`coach-portrait ${className}`} data-speaking={speaking} role="img" aria-label={`${c.name}, chess coach`}>
    <circle cx="80" cy="89" r="68" fill={c.accent} opacity=".14" />
    <circle cx="80" cy="89" r="60" fill="none" stroke={c.accent} strokeOpacity=".3" strokeDasharray="3 7" />
    <path d="M39 93V64C39 9 122 9 122 65v45l-15 22H48Z" fill={c.hair} />
    {avatar === "iris" && <path d="M112 40c38 0 34 49 17 62 8-27-14-27-18-39Z" fill={c.hair} />}
    {avatar === "vera" && <circle cx="114" cy="40" r="21" fill={c.hair} />}
    <path d="M23 177v-22c0-31 24-44 57-44s57 13 57 44v22Z" fill={c.jacket} />
    <path d="M66 99h28v26c-9 13-19 13-28 0Z" fill={c.skin} />
    <path d="m61 117 19 19 19-19 8 9-27 39-27-39Z" fill="#f4ece2" />
    <path d="m48 122 21 33-12 22H32l6-35m74-20-21 33 12 22h25l-6-35" fill={c.jacket} stroke={c.accent} strokeOpacity=".4" />
    <ellipse cx="47" cy="75" rx="7" ry="11" fill={c.skin} /><ellipse cx="113" cy="75" rx="7" ry="11" fill={c.skin} />
    <path d="M48 53q32-31 64 0v26c0 25-17 39-32 39S48 104 48 79Z" fill={c.skin} />
    <path d={avatar === "iris" ? "M43 66V47Q63 12 96 32q22 3 23 33-21-3-31-22-14 20-45 23" : "M44 65V45q31-38 65-7l9 29Q91 62 78 40 65 61 44 65"} fill={c.hair} />
    <g className="coach-eyes" fill="#28232d">
      <path d={mood === "concerned" ? "m57 66 13-4m20 0 13 4" : "m57 64q7-4 14 0m19 0q7-4 14 0"} fill="none" stroke={c.hair} strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="64" cy="75" rx="3" ry="4" /><ellipse cx="97" cy="75" rx="3" ry="4" />
      <circle cx="65" cy="74" r="1" fill="white" /><circle cx="98" cy="74" r="1" fill="white" />
    </g>
    {avatar === "vera" && <g fill="none" stroke="#ddc59a" strokeWidth="2.5"><rect x="53" y="68" width="23" height="17" rx="7" /><rect x="85" y="68" width="23" height="17" rx="7" /><path d="M76 75h9" /></g>}
    <path d="m79 78-3 10h6" fill="none" stroke="#75472f" strokeOpacity=".45" strokeWidth="2" strokeLinecap="round" />
    <ellipse cx="58" cy="89" rx="7" ry="3" fill="#d47379" opacity=".3" /><ellipse cx="103" cy="89" rx="7" ry="3" fill="#d47379" opacity=".3" />
    <path className="coach-mouth" d={mood === "concerned" ? "M72 100q8-5 16 0" : "M70 97q10 12 20 0Z"} fill={mood === "concerned" ? "none" : "#fff6ed"} stroke="#86484b" strokeWidth="2" strokeLinecap="round" />
    <circle cx="47" cy="88" r="3" fill={c.accent} /><circle cx="113" cy="88" r="3" fill={c.accent} />
    <g transform="translate(108 145)" fill={c.accent}><path d="m-7-9 4 4 3-7 3 7 4-4-2 14H-5Z" /><rect x="-7" y="7" width="14" height="3" rx="1" /></g>
  </svg>;
}
