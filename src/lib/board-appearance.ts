import type { BoardPreferences } from "./preferences";
export const WOODEN_COLORS = { lightSquare: "#e8c99b", darkSquare: "#94603e" };
export const WOOD_GRAIN = "repeating-linear-gradient(4deg, transparent 0 7px, #39200d12 8px, transparent 10px 17px), repeating-linear-gradient(176deg, transparent 0 23px, #fff3db18 25px, transparent 28px 43px)";
export function squareAppearance(preferences: BoardPreferences, light: boolean) {
  return { backgroundColor: light ? preferences.lightSquare : preferences.darkSquare, ...(preferences.boardTexture === "wooden" ? { backgroundImage: WOOD_GRAIN } : {}) };
}
export const PIECE_CODES = ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"];
export const pieceAsset = (code: string) => `/pieces/carved/${code}.svg`;
