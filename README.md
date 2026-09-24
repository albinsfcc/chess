# Chess Review — local MVP (Phases 1–6)

A local chessboard, PGN library, public Chess.com/Lichess importer, and browser Stockfish analysis workspace built with Next.js App Router, React, strict TypeScript, Tailwind CSS, shadcn/ui, react-chessboard, chess.js, @mliebelt/pgn-parser, Dexie, Zustand, and Zod. Application version: **0.1.0**. Phase 6 adds bounded imports, background parsing, indexed pagination, backup/restore, accessibility improvements and release checks.

## Run locally

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. For production, run `npm run build` followed by `npm start`.

## Implemented

- Phase 1 free play: legal drag/click/touch moves, promotion chooser, undo/redo/reset/flip, coordinates, highlights, and persistent appearance settings.
- Paste one or multiple PGNs, validate them, inspect invalid entries, and import new games. Clipboard Paste falls back to manual paste when access is unavailable.
- Main lines, recursive variations, brace/semicolon comments, NAGs, custom starting FENs, and PGN headers.
- A saved-game viewer with move selection, nested variation selection, active comments, and Previous/Next/First/Last controls. Left/Right/Home/End work outside inputs and dialogs.
- A library sorted by played date (newest first), with import time as a tie-breaker, loading/error/empty states, and confirmed deletion.
- Save one validated public profile per platform, discover games, filter and select them, and import into the existing library. Change/remove profiles without deleting games.
- Sequential Chess.com monthly discovery and streamed Lichess discovery, with cancellation, rate-limit handling, progress, partial results, and incremental refresh.
- Current-position Stockfish analysis and assisted free play, with live evaluation, SAN variations, best-move arrows, stop/resume, and engine restart.
- Resumable complete-game and selected-PGN-variation analysis, committed evaluation history, objective move losses and mate facts, and annotated PGN export.
- Player panels that follow board orientation, historical PGN clocks, captured pieces, board-based material balance, and a position-specific evaluation bar.

## Board position details

The panels above and below the board show the corresponding player's name, rating, latest known clock, captured pieces and turn. Flipping swaps the complete panels. Clocks use preserved `[%clk h:mm:ss.fraction]` annotations along the selected main-line or variation path; fractional precision is retained. There is no live countdown. An unambiguous first-stage `TimeControl` supplies initial clocks for a standard starting position. Setup/FEN games do not infer an initial clock from TimeControl, since the position may be mid-game. Missing values show `—:—`; increments and unrecorded elapsed time are never invented.

Captures are replayed from the selected path with chess.js, including en passant and promotion captures; a setup position does not invent captures that occurred before its FEN. Material advantage counts the current board (Q=9, R=5, B/N=3, P=1), including promoted pieces. Only the side ahead shows `+N`.

The evaluation bar uses White-relative live or saved results matching the displayed FEN and, for saved results, the selected game/session/tree path. White grows from the bottom on desktop and from the left on mobile, independently of board orientation. Unanalyzed positions show `—`; mate remains a separate score (`M3`, `-M2`). Exact centipawn scores use the bounded sigmoid specified in `src/lib/position-evaluation.ts`.

Navigation uses react-chessboard 5.12.1's `showAnimations` / `animationDurationInMs` options at 250 ms. The board stays mounted across navigation and game changes. Rapid requests coalesce until the current transition settles; initial loads and resets apply without a new animation, and reduced-motion preferences disable navigation animation. Click and drag share the same legal-destination utility; drops, cancellation, navigation and mode changes clear selection highlights.

Free-play moves are kept in memory and reset on refresh. Making a new move after undo replaces the future line. Reset clears the free-play game. Opening a saved game preserves the free-play session and board orientation; the viewer is read-only, and Free play returns to the previous scratch game. The library survives refresh, while the active viewer selection does not.

Only small board and engine preferences use localStorage (`chess-review:board-preferences:v1`, `chess-review:engine-preferences:v1`). Imported PGNs, metadata, annotation trees, platform profiles, and completed position analyses are stored in IndexedDB (`chess-review`). No games or PGN content are saved in localStorage. Platform requests use the local Next.js server as a proxy; usernames are sent to the selected public platform. Stockfish runs locally in a browser worker. No passwords, tokens, authentication, cloud database, or server-side engine are included.

## Complete-game analysis (Phase 5)

Open an imported standard game and choose **Analyze game**. Select Quick (250 ms), Standard (750 ms), or Deep (2,000 ms), MultiPV 1–5 (default 3), and an inclusive ply range. Ply 0 is the initial position, and ply N is the position after N played moves. The final position is included by default. The workload estimate is approximate and excludes initialization/storage overhead; cache hits shorten it.

- Only the main line is analyzed by default. To analyze an imported PGN branch, select its move and choose **Analyze selected variation**. Its required shared prefix and that branch are reconstructed and legally validated before starting; siblings are not scanned. Invalid moves report their exact ply, SAN, and tree path.
- One sequential queue reserves the existing `EngineClient` worker. Live navigation, settings changes, component cleanup, and another session cannot interrupt its searches. Pause stops the active search and retains every committed result; Resume starts at the first unfinished position. Cancel also retains work and allows explicit Resume. Session search settings are immutable; start a new session for different settings.
- The queue lives outside React components and survives workspace/route navigation. A refresh recovers interrupted sessions as paused and offers Resume. **Closing the tab stops computation**; there is no service worker or server analysis. Same-origin Web Locks prevent concurrent queue ownership across tabs where supported; the engine service also enforces ownership within a workspace.
- Dexie **version 4** adds `gameAnalyses` (session/configuration/status/progress) and `positionAnalyses` (game/tree-path associations, played move, FEN, scores, evaluation change, best move, depth/nodes/time, and typed PV result). A unique `[analysisId+ply]` index prevents duplicated positions. Each result, adjacent evaluation change, session progress, and library status commit in one transaction. Deleting a game removes its sessions and associations; reusable position cache remains.
- The existing `analyses` table remains the shared completed-position cache. Its identity is **full FEN + pinned engine build + detected engine version + SHA-256 configuration hash**. The hash includes search time, MultiPV, and score/protocol convention versions; range and branch are excluded because they do not change a position search. Compatible Phase 4 entries migrate lazily. Different versions/configurations never reuse each other's results. Cache hits still create the correct game/tree-path association. Corrupt cache entries are recomputed; corrupt session records produce a recoverable message without deleting prior work.
- Stored scores are White-relative. For centipawn scores, White's loss is `max(0, before − after)` and Black's is `max(0, after − before)`. White evaluation change is `after − before`. Missing adjacent results or bound scores have no exact loss. Mate transitions remain structured facts (maintained/lost/allowed/found/escaped forced mate and changed distance), never fake centipawns. No move classifications or proprietary formulas are used.
- Review shows committed progress, the selected position's best move/PVs, and the last played move's before/after evaluation. Selecting a move or graph point keeps the board, move highlight, arrow, and history aligned. Different main-line/branch sessions remain selectable, with their engine version, preset, MultiPV, range and configuration identity displayed.
- The graph uses a small native SVG, with focusable points, arrow/Home/End keyboard navigation, and an accessible position selector. A chart dependency is unnecessary for a single series. It updates from committed records, never raw engine messages. Hollow points mean unanalyzed; diamonds show mate separately; centipawn display is clipped at ±10 pawns without altering stored values.
- **Export annotated PGN** generates a separate download from the preserved tree. It retains headers, main-line moves, comments, NAGs, structured annotations, and recursive variations, then adds completed evaluations and best-line comments from the selected session. The original stored raw PGN is never overwritten.

Phase 5 implementation: `src/lib/game-analysis/{domain,positions,evaluation,repository,queue,export}.ts`, `src/lib/engine/configuration.ts`, `src/store/game-analysis.ts`, `src/components/{game-analysis-dialog,game-analysis-panel,evaluation-graph}.tsx`, and small integrations in the existing engine client/cache, database, board, workspace, and library. Tests cover queue recovery/cancellation, cache compatibility, migration, worker ownership, mate transitions, export round-tripping, and desktop/mobile review flows.

## Current-position analysis (Phase 4)

- Start analysis offers Free play (no automatic recommendations) or Assisted analysis. Analyze Position searches the selected position once; assisted mode searches after completed moves and main-line/variation navigation. It never plays moves or scans a game automatically. Stop disables automatic requests; Resume analyzes the current position. **Initial visits do not initialize Stockfish or download its WASM.** Explicit analysis or queue resume starts the engine. Complete-game queue ownership takes precedence over live assistance.
- Quick is 250 ms, Standard 750 ms, Deep 2,000 ms. MultiPV is configurable from 1 to 5 (default 3). Search setting changes invalidate the active request and search again. Arrow visibility is a presentation preference and does not need a new search.
- `EngineClient` owns exactly one classic Web Worker per workspace. The worker loads the unmodified Stockfish.js loader and WASM locally, parses UCI, normalizes scores, replays PVs through chess.js, and emits typed snapshots at most every 125 ms plus immediate completion. React never executes Stockfish or parses raw engine output.
- The UCI session waits for `uciok`, requests `isready`, detects `readyok`, and sets MultiPV 3. A replacement search sends `stop`, drains the old `bestmove`, and waits for `readyok` before changing the position. IDs, FEN checks, and worker generations reject stale results. New games issue `ucinewgame`; cancellation, initialization/search/stop timeouts and explicit restart are supported.
- Raw UCI evaluations are side-to-move-relative. Stored and displayed evaluations are **White-relative**: positive cp/mate favors White, negative favors Black. Bounds reverse when the sign reverses. Mate stays `{ type: "mate", moves }`; it is never converted to centipawns. Mate 0 denotes a checkmate position. `toPlayerScore` converts White-relative scores to either player's perspective.
- Original UCI PVs are preserved, while SAN conversion stops at the first illegal move and retains its legal prefix. Unsupported variants are blocked before engine initialization. Invalid FEN/king positions produce an error. Engine arrows use cyan and are scoped to the exact analyzed FEN; they are independent of PGN annotations.
- Dexie version 3 adds `analyses` without altering game/profile tables. Only completed searches are saved. Cache identity includes full FEN, pinned engine build, detected version, preset, and MultiPV. Analyze Position and Restart force fresh searches; assisted revisits may reuse cached results. Interrupted/progressive raw output is never persisted. Storage failure leaves live analysis usable.

### Engine distribution and licensing

Pinned package: **`stockfish@19.0.0`**, **Stockfish 19 lite single-threaded WASM**. The distributed WASM is 1,787,571 bytes. No CDN, SharedArrayBuffer, multiple engine workers or special cross-origin-isolation headers are required by this build.

- Corresponding source: [nmrugg/stockfish.js v19.0.0](https://github.com/nmrugg/stockfish.js/tree/v19.0.0), commit [`9cb3e5066d48f1a35d792afeda36eff37ae60570`](https://github.com/nmrugg/stockfish.js/commit/9cb3e5066d48f1a35d792afeda36eff37ae60570).
- [Source archive and build scripts](https://github.com/nmrugg/stockfish.js/archive/refs/tags/v19.0.0.tar.gz), [release provenance](https://github.com/nmrugg/stockfish.js/releases/tag/v19.0.0). The release identifies Stockfish base `edb0d9d` and its lite-engine patches. The loader credits the lite network `nn-61e7af4bb97d` by Chris Bao (sscg13).
- Stockfish and the distributed Stockfish.js loader/WASM are GPLv3. Full license, distribution notice, and SHA-256 manifest are served alongside the binary under `public/engines/stockfish-19.0.0/`. Settings → About / Licenses links to these and the corresponding source.
- `scripts/build-engine.mjs` verifies the pinned package version, copies only the lite single-threaded JS/WASM and GPL text without modification, records hashes, and bundles our separate TypeScript worker bridge. `predev` and `prebuild` run it automatically. The original vendor loader's worker protocol is intercepted inside the same worker; its binary and source files are not patched.
- Deploy the `public/` directory together with `.next/`, the package files and production dependencies when using `next start`. Keep `public/engines/` in any custom deployment package; Next's public assets are served from the project root, not copied inside `.next/`. Install dev dependencies in the build stage because the engine assets and worker bundler are build dependencies.

Phase 4 files: `src/lib/engine/{domain,uci,normalize,session,stockfish.worker,client,repository}.ts`, `src/store/analysis.ts`, `src/components/{analysis-panel,engine-settings}.tsx`, the small board/settings/workspace integrations, Dexie v3, build script, pinned dependencies, and generated `public/engines/` files. Engine tests use UCI fixtures and mock transports, repository migration tests, workspace coordination tests, and both mocked and real-WASM Playwright flows. The real browser test checks a legal best move, one worker, responsive animation frames during a Deep search, and continued legal board interaction.

## Platform importing (Phase 3)

The same-origin GET routes accept validated query parameters, reject unknown/duplicate parameters, construct fixed upstream URLs server-side, reject upstream redirects, and return sanitized errors:

| Route | Parameters |
| --- | --- |
| `/api/platforms/chesscom/profile` | `username` |
| `/api/platforms/lichess/profile` | `username` |
| `/api/platforms/chesscom/archives` | `username` |
| `/api/platforms/chesscom/games` | `username`, `year`, `month` |
| `/api/platforms/lichess/games` | `username`, optional epoch-ms `since`, `until`, `max` (1–1,000) |

- Platform-specific payloads stop at server adapters. A shared typed discovery contract feeds the existing PGN parser, normalizer, hash function and games repository. Game records now accept `chesscom`/`lichess` sources and optional `externalUrl`, `rated`, and `timeCategory`; no separate platform game tables exist.
- Dexie version 2 adds `profiles`, uniquely indexed by platform, while preserving version 1 games and trees. Profiles contain canonical usernames, optional public metadata, import timestamps and conservative discovery checkpoints. All writes are Zod-validated.
- Chess.com archives are fetched sequentially. Normal refresh revisits the last covered month through the current month; first discovery defaults to the newest available month. Select another range and enable Full refresh to fetch older games. A historical upper bound does not advance coverage beyond that month.
- Lichess exports use `application/x-ndjson` and `pgnInJson=true`. Streaming decoding handles split UTF-8/JSON lines and skips malformed records independently. Normal refresh uses the latest successfully imported timestamp with a 48-hour overlap, including after a capped discovery. Full refresh bypasses this boundary to retrieve older games.
- Every import rechecks source/external ID and normalized-PGN hash. Games save individually, so cancellation or a later failure keeps completed games. Failed, cancelled, truncated or malformed discovery does not advance Chess.com archive coverage. Removing/replacing a profile during an import cannot resurrect the old profile.
- Upstream HTTP 404, 403/410, 429, network and service errors have explicit messages. Retry-After seconds or HTTP dates are respected, with one automatic retry and cancellable waiting. Server requests identify the app with a meaningful User-Agent.
- Discovery is bounded: 25 rows per UI page; 5,000 normalized games per session; Lichess 1,000 records/25 MB per request; Chess.com 20 MB per monthly response; 500 KB per PGN. Narrow ranges for larger collections. Imports exceeding 100 games require confirmation. Discovery results are temporary; profiles and imported games persist.

## Import and storage decisions

- A boundary scanner separates games without interpreting move grammar. `@mliebelt/pgn-parser` parses each entry independently, allowing good entries to survive a mixed batch. The scanner recognizes top-level results and new headers; failed entries can recover a subsequent line-leading Event header. Ambiguous malformed/headerless input is reported as invalid rather than guessed into games.
- Raw PGN is retained per game (outer whitespace is trimmed). Normalization validates every standard-chess main line and RAV with chess.js. A variation starts before the move it replaces. The parser adapter accepts NAGs after adjacent comments by reordering only parser-input annotation tokens, without changing the saved PGN.
- Zod validates normalized records and trees at persistence boundaries. Unsupported variants are parsed and saved for reference without standard-chess legality checks; opening them on the board is disabled.
- SHA-256 identity uses normalized Site, UTCDate/Date, White, Black, Result, canonical main-line SAN, variant, and initial FEN. Comments, NAGs, variations, whitespace, event names, and ratings do not create new identities. Missing dates remain unknown. Source/external ID is also honored when present.
- Import preview categories are disjoint: new valid standard games, duplicates, new unsupported games, and invalid entries. Parse errors are also exposed as a subset of invalid entries. Import saves only new standard and unsupported entries. Deduplication covers both the batch and the existing library.
- Dexie keeps records/raw PGNs in `games` and annotation trees in `trees`. Saves and deletes span both tables in a transaction. Unique source/hash and source/external-ID indexes, plus a transaction-time recheck, prevent duplicate writes from concurrent tabs or stale previews.
- `reconstructPosition(tree, path)` returns FEN, SAN and UCI histories, relative ply, selected path, Phase 1-compatible game state, and navigation paths. Paths are `[mainMoveIndex, variationIndex, variationMoveIndex, ...]`; `[]` selects the initial position. Previous/Next retain the selected branch; Return to main line selects the corresponding main-line ply.
- Pasted batches are limited to 5 MB, 100 games and 20,000 total moves; individual games to 500 KB, 32 recursive variation levels, 100 tags and 2,048 characters per tag value. A linear scanner applies limits before the grammar parser. Malformed/duplicate tags and dangerous property names produce controlled errors; well-formed extension tags remain supported. Validation runs in a separate, cancellable data worker with a 60-second deadline. Browser storage failures preserve pasted text and expose retryable errors.

## Files and responsibilities

- `src/lib/game.ts`: existing pure game/history utilities, unchanged in Phase 2.
- `src/lib/preferences.ts`: existing appearance validation and defaults, unchanged.
- `src/lib/pgn/domain.ts`: Zod schemas and typed game, tree, and import records.
- `src/lib/pgn/parse.ts`: PGN entry splitting and parser integration.
- `src/lib/pgn/normalize.ts`: metadata/tree normalization and legal-move validation.
- `src/lib/pgn/hash.ts`: stable hashing and deduplication identities.
- `src/lib/pgn/import-service.ts`: validation previews and import orchestration.
- `src/lib/pgn/position.ts`: board reconstruction through main lines and variations.
- `src/lib/db/games.ts`: Dexie schema and transactional repository.
- `src/lib/platforms/`: shared platform schemas, adapters, streaming decoder, refresh boundaries, and import orchestration.
- `src/lib/platforms/server/`: upstream HTTP safety, response normalization, and route implementations.
- `src/app/api/platforms/`: the five public-platform proxy endpoints.
- `src/store/platform-import.ts`: profile/discovery/import state and cancellation.
- `src/components/platform-import-dialog.tsx`: profile management, discovery, filters, pagination, selection and import confirmation.
- `src/store/workspace.ts`: free-play/viewer state and preference storage boundary.
- `src/store/library.ts`: asynchronous library actions and error state.
- `src/components/game-board.tsx`: existing board integration with an imported-game read-only guard.
- `src/components/workspace.tsx`: existing layout with Phase 2 panels and navigation.
- `src/components/pgn-import-dialog.tsx`: accessible paste/validate/import modal.
- `src/components/game-library.tsx`: saved game list, open action, and confirmed deletion.
- `src/components/imported-game-viewer.tsx`: headers, nested variations, comments, and keyboard navigation.
- `src/components/ui/`: shadcn controls, including the Phase 3 selection checkbox.
- `src/lib/pgn/pgn.test.ts`, `src/lib/db/games.test.ts`, `src/store/workspace.test.ts`: new parser, reconstruction, deduplication, workspace, and IndexedDB transaction tests.
- `src/lib/pgn/fixtures.ts`: shared annotated PGN test fixture.
- `tests/e2e/pgn-import.spec.ts`: new desktop/mobile import and persistence browser flows.
- `src/lib/platforms/**/*.test.ts`, `tests/e2e/platform-import.spec.ts`: mocked platform, stream, profile, refresh, migration and desktop/mobile import tests. Tests never call live Chess.com/Lichess APIs.
- `tests/e2e/workspace.spec.ts`: Phase 1 regressions; Paste PGN is now enabled.
- `package.json`, `package-lock.json`: PGN parser, Dexie, and fake-indexeddb dependencies.

## Validation

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run test:e2e
# Release regression suite against the production build (recommended):
npm run test:e2e:release
```

Vitest uses fake-indexeddb for repository tests; Playwright exercises actual browser IndexedDB, including persistence after reload and storage denial.

Playwright uses installed Microsoft Edge (`channel: msedge`) for desktop and mobile viewport/touch emulation. Install Edge if unavailable, or remove the channel settings in `playwright.config.ts` and run `npx playwright install chromium`. Mobile emulation is not a physical iOS/Safari test. The suite starts a local server when one is not already running; set `CI=1` to require a fresh server. Screenshots are saved in ignored `artifacts/`, and failure traces in ignored `test-results/`.

## Hardening and architecture (Phase 6)

See [the Phase 6 audit](docs/phase-6-audit.md) for prioritized findings, measured performance, and release verification details.

- UI → stores → domain utilities/repositories remains the established boundary. PGN parsing, normalization and backup validation run in `src/lib/data/data.worker.ts`; `data/client.ts` owns that short-lived worker and serializes bounded jobs. This is a data-processing worker, **not another Stockfish engine**. Worker failures and timeouts preserve pasted input. Platform records reuse the same parser and game repository.
- Database **version 5** adds `[libraryDate+importedAt+id]` to `games` and backfills it during an atomic migration. The library reads 25 records per page. Deduplication uses indexed source/hash and source/external-ID lookups instead of loading all PGNs. Move lists and evaluation graphs render windows of 100 positions with accessible page controls. Selecting positions within the current branch reuses prepared navigation state.
- Current-position UI updates remain throttled by the engine worker; evaluation graphs update only after committed positions. Hidden tabs stop live searches and pause game queues; resumption is explicit. Startup, communication, missing assets, search and stop failures have recovery messages and **Restart engine**. Existing saved game analysis remains readable without loading Stockfish.
- The board has one keyboard tab stop: arrows choose squares; Enter/Space select the piece and destination. Imported-game navigation uses Left/Right/Home/End outside inputs/dialogs. Move buttons, graph points and the graph position selector provide accessible navigation. Focus outlines, a skip link, bounded dialogs, touch targets, contrast-aware coordinates, and text best-move information supplement the visual board. Navigation animation respects reduced-motion preferences.
- Proxy requests reject unexpected/duplicate parameters and redirects, construct fixed HTTPS upstream URLs, bound bodies, abort disconnected requests, and apply 30-second timeouts (180 seconds for streamed Lichess exports). API responses are `no-store`; errors are sanitized. A process-local, per-platform token bucket allows a burst of six requests then refills one per second. UI busy guards, sequential archives and bounded retry waits reduce accidental floods. **This is courtesy throttling, not infrastructure-level or per-user rate limiting.** Public deployment should add gateway rate/concurrency limits and monitoring.
- Discovery memory is bounded by 5,000 games / approximately 25 MB of serialized game data, with 100 retained warnings and batched UI updates. Streaming applies backpressure and handles malformed records individually. These are payload bounds, not a guarantee about JavaScript heap size. Download object URLs are revoked after dispatch.
- Basic response headers disable MIME sniffing and framing, restrict referrers and unused device permissions. Versioned engine assets are immutable; application workers revalidate so deployments do not retain stale bridges. No password/token fields or full-PGN logging are present.

## Backups and local data

Settings → **Local data & backups** exports games, original PGNs and trees, profiles, completed evaluations, sessions, and small preferences as versioned JSON (`chess-review-backup`, format version 1). Backups contain personal game history and public usernames; keep files private.

Restore validates the complete file in the data worker before writing: schema/version, nesting, PGN/tree agreement, identities, legal reconstruction, session associations, configuration hashes and cache keys. One IndexedDB transaction merges valid new records. Existing games/profiles are preserved; sessions attach only to compatible trees. Preferences are restored. Interrupted sessions become paused. An invalid file or failed transaction leaves valid local data untouched.

Limits: 50 MB per backup, 2,000 games/sessions, 20,000 position records/cache entries, 200,000 combined game-tree moves and 128 JSON nesting levels. Very large collections need separate PGN exports or cache cleanup before backup; this is not a streaming archive format. Export does not delete data. Close other app tabs before restoring/clearing. **Clear analysis results** retains games/profiles; **Clear all local data** requires explicit destructive confirmation and removes this application's database records and preference keys only.

IndexedDB is scoped to the browser profile and origin (scheme, host and port). Browser clearing, private-browsing rules or storage eviction can remove it. Export backups before changing origins or browser profiles. The app does not upload backups or sync between devices.

## Deployment and browser support

1. Use Node.js 22.12+ and `npm ci` including build-time dev dependencies.
2. Run tests and `npm run build`. Prebuild prepares the pinned Stockfish assets, data/engine workers and third-party notices.
3. Deploy `.next/`, **all of `public/`**, package files and runtime dependencies. Run `npm start` behind an HTTPS reverse proxy. The proxy API routes require a Next.js server; static export alone is unsupported.
4. Verify `/workers/data-worker.js`, `/engines/analysis-worker.js`, `/engines/stockfish-19.0.0/stockfish-19-lite-single.wasm`, `/licenses/manifest.json` and `/licenses/THIRD-PARTY-NOTICES.txt` are served. Custom container/standalone packaging must copy `public/` explicitly. Do not strip licenses or replace binaries without updating provenance.
5. No application environment variables or secrets are required; no `.env.example` is needed. Configure deployment-level HTTPS, request limits and an appropriate CSP for Next.js and WebAssembly at your gateway if desired.

Target browsers are current Chrome/Edge, Firefox and Safari with IndexedDB, Web Workers, WebAssembly, streaming fetch, AbortSignal timeout/any and secure-context Web Crypto. HTTPS (or localhost) is required. Automated release checks use installed Edge on Windows, with desktop and mobile touch emulation; physical iOS/Safari and Firefox require manual verification. Web Locks add cross-tab queue exclusion where supported; avoid concurrent analysis in multiple tabs on older browsers.

This is not an offline-installable PWA. Once loaded, local games and stored analysis remain usable when platform APIs are unavailable. A cold offline page load or first engine download may fail. Import errors distinguish offline/network failures; previously imported data remains local and readable.

## Licenses and troubleshooting

Settings → **About / Licenses** lists the application/Stockfish versions, GPLv3 text and corresponding source, chess.js BSD-2-Clause, react-chessboard MIT, PGN parser Apache-2.0 and required third-party notices. `scripts/build-notices.mjs` inventories installed distribution dependencies and bundled Next.js notices; `public/licenses/manifest.json` records package versions. Engine provenance tests compare distributed files byte-for-byte with pinned `stockfish@19.0.0` and verify SHA-256 hashes. Proprietary platform board, piece, sound or classification assets are not distributed.

- **Engine won't load:** confirm the worker/WASM public paths above, check browser support and storage/network extensions, then use Restart engine. Saved analysis remains available. Reducing MultiPV/preset reduces work; close other heavy tabs on low-memory devices.
- **Import errors:** narrow the date range or paste size. Wait for Retry-After on rate limits; very long cooldowns require manual retry. Cancellation and partial upstream failures retain completed imports. Clipboard denial can be bypassed by manual paste.
- **Storage error:** allow site storage, free disk space and retry. Export a backup before clearing browser data. Restore only validated version 1 backups; incompatible or corrupt records are rejected without overwriting local records.
- **Queue paused after reload/hiding:** open the saved session and Resume. No analysis continues after the tab closes.
- **Test process `spawn EPERM` on Windows:** permit the local test runner to launch its worker/browser processes; do not change application security to work around runner sandbox restrictions.
- **Runner colour warning:** environments setting both `NO_COLOR` and `FORCE_COLOR` emit a harmless Playwright/Node colour-precedence warning. It affects console formatting only and is intentionally not suppressed in application code.

## Known limitations and post-MVP work

The MVP excludes cloud accounts/sync, server-side engines, social features, payments, AI explanations and opening databases. The board retains react-chessboard's default piece set. User-selected square colours can reduce piece contrast; choose a contrasting preset. Backups are bounded JSON snapshots, and imports/analysis can consume battery and storage. Hiding or closing a tab pauses/stops analysis; no background-completion promise is made.

Recommended follow-up: physical-device/screen-reader and Safari/Firefox testing, production gateway limits/observability, performance budgets on low-memory phones, and a streaming backup format for collections beyond the documented bounds. These are not implemented in Phase 6.

## Recent games and local exploration

Opening a saved Chess.com or Lichess profile discovers the five most recent public games without importing them. Lichess requests `max=5`; Chess.com reads months newest first, sequentially, stopping once five distinct games are available. Results are sorted newest first and existing imports are marked. Closing the dialog cancels discovery. `More games / Filters` contains date ranges and filters; Refresh Games returns to the recent five. Recent discovery never advances the full-archive checkpoint.

Playing the next recorded move navigates to it. Alternative legal moves create local variations, including after the last recorded move and inside another variation. Undo changes the selected position without deleting moves. Return to main line restores the branch point; select local variation moves to revisit alternatives. Clocks retain only known annotations along the shared prefix; locally played moves have no invented clock values.

Local branches are optional additions in the existing IndexedDB tree record, so existing databases require no table/index migration. Original PGN nodes, raw PGN and deduplication hashes remain unchanged. Saves are ordered and use a transaction conflict check to avoid overwriting another tab's edits. Local backups preserve and independently validate these branches. Limits are 500 branches, 20,000 added moves and 100 nested anchors per game. Browser storage failures are shown in the workspace.

The responsive grid gives roughly 65% of desktop width to the chess area, with board size also bounded by viewport height. Phones stack the board and player panels above the information cards. Existing custom colors, orientation, evaluation bar and navigation animations are retained.

## Viewport controls and analysis overlays

Graded moves also show an original square badge at the last-moved piece's destination. Click or tap it for the full label and explanation. Badges follow orientation and selected main-line/variation positions, including saved analysis after reload. Unanalyzed or insufficient-depth moves have no grade badge; the existing depth-12 and adjacent-position requirements still apply. Supported labels are Brilliant, Great, Best, Excellent, Good, Inaccuracy, Mistake and Blunder. Book and Miss are not inferred.

On screens at least 900 px wide and 600 px tall, the header and chess area stay within the viewport and only the information column scrolls. Board sizing measures player panels and navigation controls, including text enlargement. Smaller/shorter screens use normal page scrolling to keep controls accessible. Imports are in the header. The evaluation rail is on the right on desktop, beneath the board on mobile; its fill eases over 450 ms and respects reduced motion.

Up/Down go to the first/last position; Left/Right go backward/forward. Home/End remain available. Dialogs and editable fields retain their keyboard behavior. On the board, Alt+arrows explore squares; after Enter selects a piece, arrows choose a destination and Enter completes a legal move.

Engine settings choose 1–5 top moves. Blue arrows and ranked lines use strongest-to-weakest shades. Saved searches may have fewer lines; reanalyze to obtain more. Show threats is off by default and persists as a small preference. It shows **opponent** current checks, mate-in-one moves and estimated winning captures if ignored. A bounded legal exchange calculation runs in the existing data worker, not the UI thread or a second Stockfish engine. It removes en-passant rights for the hypothetical opponent turn and omits deeper/quiet combinations. These arrows are tactical hints, not a guarantee of safety; text alternatives appear in the analysis card.

Move labels are original heuristics, not platform formulas. Both adjacent completed positions must have depth ≥12, exact scores, matching engine/configuration and the correct resulting FEN. Centipawn loss is mover-relative: Excellent ≤15, Good ≤40, Inaccuracy ≤100, Mistake ≤250, Blunder >250. Best matches the engine with ≤15 cp loss. Great additionally leads the second line by ≥150 cp at equal or greater depth. Brilliant instead concedes ≥3 material points in the principal reply while retaining a nonnegative evaluation. Losing or newly allowing a forced mate is a Blunder; mate scores are never converted to cp. Unknown/shallow/bounded results stay ungraded. These estimates can change with deeper analysis. Thresholds live in `src/lib/game-analysis/move-quality.ts`. Live play needs saved analysis of the preceding position; full-game analysis supplies adjacent results. Original PGN annotations remain unchanged.
