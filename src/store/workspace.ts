import { create } from "zustand";
import { createGame, navigateTo, tryMove, type GameState, type MoveResult, type PromotionPiece } from "@/lib/game";
import { defaultPreferences, parsePreferences, PREFERENCES_KEY, preferencesSchema, type BoardPreferences } from "@/lib/preferences";
import type { GameDocument, NodePath } from "@/lib/pgn/domain";
import { reconstructPosition } from "@/lib/pgn/position";

type WorkspaceState = {
  boardTransition: "replace" | "navigate" | "move";
  boardEpoch: number;
  game: GameState;
  imported: GameDocument | null;
  freeGame: GameState | null;
  selectedPath: NodePath;
  navigationPaths: NodePath[];
  openGame: (document: GameDocument) => void;
  closeGame: () => void;
  selectNode: (path: NodePath) => void;
  orientation: "white" | "black";
  preferences: BoardPreferences;
  storageError: string | null;
  move: (from: string, to: string, promotion?: PromotionPiece) => MoveResult;
  goTo: (ply: number) => void;
  reset: () => void;
  flip: () => void;
  hydratePreferences: () => void;
  updatePreferences: (patch: Partial<BoardPreferences>) => void;
};

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  boardTransition: "replace", boardEpoch: 0,
  game: createGame(),
  imported: null,
  freeGame: null,
  selectedPath: [],
  navigationPaths: [],
  openGame: (document) => {
    const position = reconstructPosition(document.tree);
    set({ boardTransition: "replace", boardEpoch: get().boardEpoch + 1, imported: document, freeGame: get().imported ? get().freeGame : get().game,
      game: position.game, selectedPath: [], navigationPaths: position.navigationPaths });
  },
  closeGame: () => set({ boardTransition: "replace", boardEpoch: get().boardEpoch + 1, imported: null, game: get().freeGame ?? createGame(), freeGame: null, selectedPath: [], navigationPaths: [] }),
  selectNode: (path) => {
    const document = get().imported;
    if (!document) return;
    const existing = path.length ? get().navigationPaths.findIndex((node) => node.join(".") === path.join(".")) + 1 : 0;
    if (!path.length || existing > 0) { set({ boardTransition: "navigate", game: navigateTo(get().game, existing), selectedPath: [...path] }); return; }
    const position = reconstructPosition(document.tree, path);
    set({ boardTransition: "navigate", game: position.game, selectedPath: position.path, navigationPaths: position.navigationPaths });
  },
  orientation: "white",
  preferences: { ...defaultPreferences },
  storageError: null,
  move: (from, to, promotion) => {
    if (get().imported) return { kind: "illegal" };
    const result = tryMove(get().game, from, to, promotion);
    if (result.kind === "moved") set({ boardTransition: "move", game: result.game });
    return result;
  },
  goTo: (ply) => {
    const next = navigateTo(get().game, ply);
    if (get().imported) set({ boardTransition: "navigate", game: next, selectedPath: next.cursor ? get().navigationPaths[next.cursor - 1] : [] });
    else set({ boardTransition: "navigate", game: next });
  },
  reset: () => set({ boardTransition: "replace", boardEpoch: get().boardEpoch + 1, game: createGame(), imported: null, freeGame: null, selectedPath: [], navigationPaths: [] }),
  flip: () => set({ orientation: get().orientation === "white" ? "black" : "white" }),
  hydratePreferences: () => {
    try {
      set({ preferences: parsePreferences(localStorage.getItem(PREFERENCES_KEY)) });
    } catch {
      set({ storageError: "Browser storage is unavailable. Settings will last for this session only." });
    }
  },
  updatePreferences: (patch) => {
    const result = preferencesSchema.safeParse({ ...get().preferences, ...patch });
    if (!result.success) return;
    set({ preferences: result.data });
    try {
      // Persist only the small, validated preference object, never game history.
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(result.data));
      set({ storageError: null });
    } catch {
      set({ storageError: "Settings could not be saved. They will last for this session only." });
    }
  },
}));
