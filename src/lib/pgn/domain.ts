import { z } from "zod";

export const resultSchema = z.enum(["1-0", "0-1", "1/2-1/2", "*"]);
const annotationsSchema = z.record(z.string(), z.union([z.string(), z.array(z.string())]));
export type NodePath = number[]; // [move index, variation index, move index, ...]
export type GameNode = {
  id: string;
  san: string;
  uci?: string;
  ply: number;
  moveNumber: number;
  turn: "w" | "b";
  commentsBefore: string[];
  commentsAfter: string[];
  annotations: Record<string, string | string[]>;
  nags: string[];
  variations: GameNode[][];
};
export const nodeSchema: z.ZodType<GameNode> = z.lazy(() => z.object({
  id: z.string(), san: z.string().min(1), uci: z.string().optional(),
  ply: z.number().int().positive(), moveNumber: z.number().int().positive(), turn: z.enum(["w", "b"]),
  commentsBefore: z.array(z.string()), commentsAfter: z.array(z.string()),
  annotations: annotationsSchema, nags: z.array(z.string()), variations: z.array(z.array(nodeSchema)),
}));
export const treeSchema = z.object({
  initialFen: z.string().min(1), result: resultSchema, playable: z.boolean(),
  comments: z.array(z.string()), annotations: annotationsSchema, mainLine: z.array(nodeSchema),
  userBranches: z.array(z.object({ root: z.array(z.number().int().nonnegative()).max(101), moves: z.array(nodeSchema).max(10000) })).max(500).optional(),
});
export type GameTree = z.infer<typeof treeSchema>;

export const gameSchema = z.object({
  id: z.string().uuid(), source: z.enum(["pgn", "chesscom", "lichess", "computer"]), externalId: z.string().optional(),
  externalUrl: z.string().url().optional(), rated: z.boolean().optional(), timeCategory: z.string().optional(),
  rawPgn: z.string().min(1), normalizedPgnHash: z.string().regex(/^[a-f0-9]{64}$/),
  event: z.string(), site: z.string(), playedAt: z.string().nullable(), round: z.string(),
  white: z.string(), black: z.string(), whiteRating: z.number().int().nonnegative().nullable(),
  blackRating: z.number().int().nonnegative().nullable(), result: resultSchema,
  timeControl: z.string(), variant: z.string(), initialFen: z.string().min(1),
  importedAt: z.string().datetime(), analysisStatus: z.enum(["not-analyzed", "partial", "analyzed", "unsupported"]),
  headers: z.record(z.string(), z.string()),
});
export type GameRecord = z.infer<typeof gameSchema>;
export const documentSchema = z.object({ game: gameSchema, tree: treeSchema });
export type GameDocument = z.infer<typeof documentSchema>;
export type ImportCandidate = GameDocument & { entryIndex: number };
export type ImportIssue = {
  entryIndex: number;
  rawPgn: string;
  message: string;
  line?: number;
  column?: number;
};
export type ImportResult = {
  validGames: ImportCandidate[];
  duplicateGames: ImportCandidate[];
  unsupportedGames: ImportCandidate[];
  invalidEntries: ImportIssue[];
  parseErrors: ImportIssue[];
};
