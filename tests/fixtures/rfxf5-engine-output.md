# Rfxf5 sacrifice regression

Position from the user-supplied rchimombe–albinhere daily game (2026-09-24),
stored as a moves-only PGN in `rfxf5-review.pgn`. The tested move is 31...Rfxf5
(`f8f5`, ply 62). No clock or account data is required for the regression.

Captured 2026-10-09 with the bundled Stockfish 19 Lite single-thread WASM,
unrestricted strength, Hash 32 MB, MultiPV 3, 5,000 ms per position. The engine
was reset with `ucinewgame` between searches. JSON contains the final UCI info
line for each variation and bestmove. Raw scores are relative to the side to
move; tests normalize them through the application's UCI parser.

- Before: Rfxf5 is best, +5.73 for Black at depth 20; the second choice is
  -2.66 for Black. This is a critical move without a winning fallback.
- After: White's best defence is Re6, -5.46 for White at depth 22. The rook
  offer is declined in the best line.
- Acceptance: 32.gxf5 Rg1+ 33.Rxg1 Qxg1# is mate in two for Black, confirmed
  at depth 26 and replayed legally by the regression test.

The old classifier returned Great before considering Brilliant, required
acceptance in the principal variation, and excluded exchange sacrifices with
a pawn of compensation. The revised rule checks Brilliant first and inspects
legal immediate captures of the moved piece. It requires an initial piece or
exchange investment of at least two material points, with at least one point
still conceded after the best immediate recapture. An equal/favourable trade
does not qualify. Engine soundness, near-best evidence, depth, and the absence
of an established winning fallback remain required.

This is a transparent local heuristic, not Chess.com's proprietary algorithm.
Its published explanation describes best/near-best, sound piece sacrifices
without an already completely winning fallback:
https://support.chess.com/en/articles/8572705-how-are-moves-classified-what-is-a-blunder-or-brilliant-etc
