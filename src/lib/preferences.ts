import { z } from "zod";
import { BOARD_TEXTURES } from "./board-textures";

export const PREFERENCES_KEY = "chess-review:board-preferences:v1";
export const preferencesSchema = z.object({
  lightSquare: z.string().regex(/^#[0-9a-f]{6}$/i),
  darkSquare: z.string().regex(/^#[0-9a-f]{6}$/i),
  showCoordinates: z.boolean(),
  boardTexture: z.enum(["plain", "wooden", ...BOARD_TEXTURES.map(texture => texture.id)]).default("plain"),
  pieceSet: z.enum(["classic", "carved", "sculpted", "soft-classic"]).default("classic"),
});
export type BoardPreferences = z.infer<typeof preferencesSchema>;
export const defaultPreferences: BoardPreferences = {
  lightSquare: "#e8c99b",
  darkSquare: "#94603e",
  showCoordinates: true,
  boardTexture: "wooden",
  pieceSet: "classic",
};

export function parsePreferences(value: string | null): BoardPreferences {
  if (!value) return { ...defaultPreferences };
  try {
    const result = preferencesSchema.safeParse(JSON.parse(value));
    return result.success ? result.data : { ...defaultPreferences };
  } catch {
    return { ...defaultPreferences };
  }
}

export function coordinateColor(hex: string): string {
  const channels = [1, 3, 5].map((index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? "#101619" : "#ffffff";
}
