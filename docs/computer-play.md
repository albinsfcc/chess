# Computer play and incremental review

The implementation reuses chess.js, the workspace board and animation, the singleton Stockfish client, the existing position cache, game library, and imported-game review pipeline. Accuracy and move classifications use the existing formulas unchanged.

## Appearance

Settings includes a Wooden board preset and a complete Carved piece set. Both persist in the existing board preference record, with migration defaults for older preferences. A live preview displays all twelve pieces on the selected board. Wood grain uses local CSS, preserving the existing coordinates, move highlights, arrows and sizing.

Six additional image-backed presets use the supplied board designs: Olive & Ebony, Ivory & Ebony, Natural Walnut, Silver Ash, Warm Rosewood and Smoked Oak. Original assets and provenance are in `public/boards/`. Selection uses the existing preference record and live preview. Images are preloaded/decoded before display, with matching plain-colour fallbacks on failure; the full board texture stays below pieces, coordinates, annotations and move highlights. Existing presets remain available.

Carved consists of twelve original SVGs created for this project, licensed under MIT. Attribution and the full license are in `public/pieces/carved/LICENSE.txt` and linked from Settings. Assets preload from the root layout and renderer; unavailable assets fall back to react-chessboard's existing pieces. No external image service or font dependency is required.

## Alternatives

`src/lib/engine/alternatives.ts` contains the single configurable `MAX_ALTERNATIVE_LOSS_CP = 75` threshold. The best line always remains visible. Other lines are compared entirely from the current player's perspective. A forced-mate top line only permits mate alternatives for the same winner. Uncertain bounded alternatives are omitted.

The shared filter applies to live/assisted candidate lists, saved review variations and board arrows. Raw engine results retain every line for grading and cache compatibility.

## Gameplay, delay and feedback

During the bot's turn, click or drag a human piece to queue one premove. Purple squares identify its source and destination; the piece stays on its real square until the reply animation settles. A new premove replaces the old one. Cancel with the visible button, Escape on the board, or right-click. Promotion uses the existing chooser. The normal chess.js move path revalidates the queued move after the reply, silently discarding it if it is no longer legal. Queues are consumed once and cleared on exit, restart, engine failure and game completion.

Right-drag draws a purple pointer using the board's existing arrow renderer. Right-click toggles a circle. Repeating an arrow removes it; left-click and position changes clear drawings. These annotations remain separate from engine arrows and threat overlays.

The review modal follows the supplied visual references: navy surfaces, graph-first ordering with cyan/amber shading and step controls, player cards with outcome/bot labels and a central result badge, bordered classification rows, engine metadata, and a horizontal desktop action footer. Phase bars reuse `moveAccuracy`: opening is the first 10 moves, endgame has at most 13 non-pawn material points, and middlegame covers other positions. Missing or unplayed phases display —. All modal backdrops dim and blur the workspace; prefixed blur declarations precede the standard declaration so the production CSS optimizer preserves them.

Six profiles remain centralized in `src/lib/computer.ts`. Their approximate ratings are labels, not calibrated official Elo. The worker inspects runtime UCI options and resets strength limits before unrestricted analysis.

Each bot turn starts a fixed 3-second target delay during the first twelve plies (six moves per side), then a seeded/injectable random 1–10 second target delay afterward, concurrently with engine work. The move is applied only after calculation, incremental analysis, and the delay are ready. A difficult search may exceed the target. Bot input remains locked throughout. The existing client reservation and UCI barriers serialize searches; session generations and cancellable timers reject stale replies and prevent duplicate moves. Exit, resignation, terminal results, replacement and component unmount cancel pending work. Navigation/undo remains disabled during a computer game.

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
- `npm run test`: 330 tests passed across 34 files, including the six supplied board presets, phase grouping/accuracy reuse, premove legality/cancellation/underpromotion, feedback hold/cancellation and opening variety for both colours and all six bots.
- Supplied texture update: four desktop/mobile appearance cases passed, checking all six selections, live preview, reload persistence, flipping, move highlights, asset fallback and the original Wooden/Carved options.
- ESLint on application source and changed tests/config: passed.
- `npm run build`: passed.
- Desktop/mobile browser validation: all 20 cases passed across the full suite and focused rerun after the animation-input fix. Includes click/drag premoves, pointer/circle toggling, modal padding/blur, appearance persistence/fallback, real Stockfish startup, assistance cleanup, incremental review/accuracy, and PGN/Chess.com/Lichess import flows.

Run the production build before the browser suite. Its isolated server uses port 3102 so it cannot accidentally reuse an older app on port 3000.

Weak-bot tuning: Ollie, Mira, Nova and Kairo have oversight probabilities of 50%, 32%, 16% and 6%. Oversights select from legal moves outside the engine shortlist, using only simple capture, promotion, check and central-square preferences. This applies before opening-book selection and does not use review analysis to rescue a weak move. Other turns retain weighted MultiPV selection. Orion and Atlas have no added oversight sampling. UCI Elo is clamped to runtime limits; Skill Level is a fallback if Elo limiting is unavailable. These are behavioral difficulty targets, not calibrated Elo ratings.

## Accuracy model v2

The shared review/feedback loss model is centralized in `src/lib/game-analysis/move-loss.ts`. Finite evaluations use the larger of logistic expected-points loss and a bounded practical material term: `0.5 * max(0, bestCp - playedCp) / (800 + abs(bestCp))`. All values are mover-relative. This avoids logistic saturation silently rating substantial material errors as almost perfect. Accuracy remains the arithmetic mean of `100 * exp(-5 * loss)` over non-forced moves, with exact engine-top choices scoring 100 and compatible same-position MultiPV scores preferred. Phase scores reuse the same calculation.

Missed forced wins have a minimum loss of 0.10; mate distances are never mapped to centipawns. Maintaining a forced outcome is not penalized solely for changing mate distance across searches. A Blunder now includes a roughly equal/healthy position (at least -0.50) collapsing to -2.00 or worse, or opponent mate. A significant lost advantage while retaining a winning position is a Miss. These are original, transparent heuristics, not a reproduction of any platform's proprietary formula.

The supplied Human?Nova PGN and actual 750 ms/3-PV Stockfish output are checked in as regression evidence (`tests/fixtures/nova-review*`). On that fixed evidence: old 98.26/94.53, v2 93.77/84.93. The comparison screenshot is 91.5/83.8; exact parity is neither claimed nor encoded as a test target. Different engine searches and opening coverage still produce different classifications. Saved engine results remain reusable; reopening a review recalculates derived scores and labels.
