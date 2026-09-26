# Computer play and incremental review

The implementation reuses chess.js, the workspace board and animation, the singleton Stockfish client, the existing position cache, game library, and imported-game review pipeline. Accuracy and move classifications use the existing formulas unchanged.

## Appearance

Settings includes a Wooden board preset and a complete Carved piece set. Both persist in the existing board preference record, with migration defaults for older preferences. A live preview displays all twelve pieces on the selected board. Wood grain uses local CSS, preserving the existing coordinates, move highlights, arrows and sizing.

Carved consists of twelve original SVGs created for this project, licensed under MIT. Attribution and the full license are in `public/pieces/carved/LICENSE.txt` and linked from Settings. Assets preload from the root layout and renderer; unavailable assets fall back to react-chessboard's existing pieces. No external image service or font dependency is required.

## Alternatives

`src/lib/engine/alternatives.ts` contains the single configurable `MAX_ALTERNATIVE_LOSS_CP = 75` threshold. The best line always remains visible. Other lines are compared entirely from the current player's perspective. A forced-mate top line only permits mate alternatives for the same winner. Uncertain bounded alternatives are omitted.

The shared filter applies to live/assisted candidate lists, saved review variations and board arrows. Raw engine results retain every line for grading and cache compatibility.

## Gameplay, delay and feedback

Six profiles remain centralized in `src/lib/computer.ts`. Their approximate ratings are labels, not calibrated official Elo. The worker inspects runtime UCI options and resets strength limits before unrestricted analysis.

Each bot turn starts a seeded/injectable random 1?10 second target delay concurrently with engine work. The move is applied only after calculation, incremental analysis, and the delay are ready. A difficult search may exceed the target. Bot input remains locked throughout. The existing client reservation and UCI barriers serialize searches; session generations and cancellable timers reject stale replies and prevent duplicate moves. Exit, resignation, terminal results, replacement and component unmount cancel pending work. Navigation/undo remains disabled during a computer game.

Show move feedback defaults on, independently of Assisted game (off). Completed before/after evaluations feed the existing `classifyMove` implementation. Only human moves get live feedback; board indicators expire and move-list labels retain the grade and detailed explanation. The full final review still assesses both players for accuracy. Turning feedback off does not stop background analysis.

Assistance uses stored review-quality results after board animation settles on the human turn. Its arrows and candidate list use the shared alternative filter. Immediate attacked-piece outlines still come from chess.js, not speculative PVs.

## Incremental storage and review

The review configuration is captured from Settings at game start and remains fixed independently of bot level or later setting changes. With feedback enabled, the human move is analyzed first and its grade is displayed for one second before the bot search and natural thinking delay begin. Without feedback, bot searches have priority. All searches run serially through the same client. Weakened bot results are rejected from incremental review storage.

Opening variety reuses the installed CC0 opening index. During the first twelve plies, bots request five engine candidates within their existing search budget and sample legal book continuations. Allowed loss ranges from 25 centipawns for Atlas to 75 for Ollie, measured from the moving side's perspective; better evaluations have higher selection weight. Forced mates, unavailable book data, or fewer than two qualifying lines fall back to ordinary bot selection. Constants and injectable randomness are centralized in `src/lib/computer.ts`.

Every completed position is cached and journaled in IndexedDB with game ID, ply, FEN, configuration hash, engine version, depth, score, best move and MultiPV lines. Quick human moves cannot skip positions: the next collection pass fills missing plies. Completed records survive interruption, although unfinished games are not automatically restored or continued after reload.

On completion, normal PGN and metadata are saved, the existing Review modal opens, and journal/cache records are committed through `GameAnalysisRepository`. This produces the standard before/after associations, accuracy, graph and move details. Terminal mate/stalemate/material facts need no engine search. Only genuinely missing positions are passed to the existing resumable review queue. The terminal-game browser test verifies four unique review searches during a four-ply game and no repeated end-of-game searches.

Mate, resignation, draws, and a timeout ending hook use the same completion path. There is no new clock/time-control UI; the timeout hook accepts the losing colour. Engine/storage failures retain the current game and offer retry. Local-data clearing is guarded while a computer session owns the engine.

## Files changed for these improvements

- `src/lib/preferences.ts`, `src/lib/preferences.test.ts`: appearance preferences and migration/persistence tests.
- `src/lib/board-appearance.ts`, `src/components/piece-set.tsx`, `src/app/layout.tsx`: texture styles, piece renderer, preload and fallback.
- `public/pieces/carved/*.svg`, `public/pieces/carved/LICENSE.txt`: twelve original licensed piece assets.
- `src/components/settings-dialog.tsx`: Wooden, Pieces and live preview controls.
- `src/lib/engine/alternatives.ts`, `src/lib/engine/alternatives.test.ts`, `src/lib/engine/arrows.ts`: shared alternative policy and tests.
- `src/components/analysis-panel.tsx`, `src/components/game-analysis-panel.tsx`: filtered live/assisted/review lines.
- `src/lib/computer.ts`, `src/store/computer.ts`, `src/store/computer.test.ts`: cancellable delay, incremental collection, human feedback and completion.
- `src/components/computer-game.tsx`, `src/components/game-board.tsx`, `src/components/use-move-assessment.ts`, `src/components/workspace.tsx`: feedback setup, board indicator, move-list labels, renderer integration and unmount cleanup.
- `src/lib/game-analysis/computer-progress.ts`, `src/lib/game-analysis/computer-progress.test.ts`: durable position journal and reuse of standard review records.
- `src/lib/db/games.ts`, `src/lib/data/backup-repository.ts`, `src/store/data-management.ts`: schema migration and journal cleanup safeguards.
- `src/store/game-review.ts`, `src/components/game-analysis-dialog.tsx`: immediate modal preparation and frozen review configuration.
- `public/workers/data-worker.js`: regenerated persistence/validation worker bundle.
- `tests/e2e/computer.spec.ts`, `tests/e2e/appearance.spec.ts`, `playwright.computer.config.ts`: browser regression tests and isolated production runner.
- `docs/computer-play.md`: this report.

## Validation

- `npm run typecheck`: passed.
- `npm run test`: 318 tests passed across 34 files, including feedback hold/cancellation and opening variety for both colours and all six bots.
- ESLint on application source and changed tests/config: passed.
- `npm run build`: passed.
- `npx playwright test --config=playwright.computer.config.ts`: 16 desktop/mobile tests passed, including appearance persistence/fallback, real Stockfish startup, assistance cleanup, incremental review/accuracy, and existing PGN/Chess.com/Lichess import flows.

Run the production build before the browser suite. Its isolated server uses port 3102 so it cannot accidentally reuse an older app on port 3000.
