export const COACHES = [
  { id: "maia", name: "Maia", style: "Warm & encouraging", voice: "Gentle, unhurried", lang: "en-US", rate: 0.94, pitch: 1.05, preferred: /zira|samantha|jenny/i, accent: "#72d7bc", skin: "#b97b59", hair: "#272333", jacket: "#22584f" },
  { id: "iris", name: "Iris", style: "Bright & curious", voice: "Bright, lively", lang: "en-GB", rate: 1.04, pitch: 1.15, preferred: /sonia|serena|hazel/i, accent: "#c2acff", skin: "#f0b99b", hair: "#8c442e", jacket: "#635080" },
  { id: "vera", name: "Vera", style: "Calm & focused", voice: "Measured, thoughtful", lang: "en-IN", rate: 0.9, pitch: 0.95, preferred: /heera|neerja|raveena/i, accent: "#efc885", skin: "#976448", hair: "#201c25", jacket: "#405374" },
] as const;
export type CoachId = typeof COACHES[number]["id"];
export const coachById = (id: CoachId) => COACHES.find(coach => coach.id === id)!;
