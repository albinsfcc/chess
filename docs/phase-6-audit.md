# Phase 6 release audit

Audit and verification: 22–23 September 2026, Windows, Node 22.14, installed Microsoft Edge.

## Baseline and priorities

Before application edits: all 155 unit/integration tests passed, the production build passed, and `npm audit --omit=dev` reported no known vulnerabilities. The initial browser audit found a brittle exact-loss assertion (engine bound scores correctly have no exact centipawn loss) and a development-server navigation timeout. Production regression testing replaced the development server for release checks.

The prioritized groups were:

1. **Untrusted imports:** parser limits before recursive parsing, off-main-thread validation, bounded network bodies/timeouts, sanitized errors, cancellation and courtesy throttling.
2. **Data integrity/performance:** indexed library pages and deduplication, bounded move/graph rendering, versioned validated atomic backup restore, safe destructive controls.
3. **Engine/accessibility:** explicit lazy startup, hidden-tab pause, worker communication recovery, keyboard board controls, focus/touch/contrast and responsive layout checks.
4. **Release evidence:** complete dependency notices/provenance, production browser regressions, performance measurements, deployment and recovery documentation.

Architecture was retained: one Stockfish service/worker, existing platform adapters and game repository, existing PGN normalization/reconstruction and queue. The new data worker reuses those domain utilities; it never runs Stockfish. IndexedDB v5 adds a library ordering index and migrates existing rows without replacing tables. Backup format version 1 is independent of the database version.

## Findings fixed during browser verification

- The previous analysis panel started Stockfish on mount. Startup now requires an explicit analysis action; preferences alone do not initialize the engine.
- Library data was loaded as a whole collection. Indexed 25-game pages and per-candidate deduplication keep reads bounded.
- Long unbroken player names expanded implicit grid columns at phone widths. Explicit bounded columns and wrapping retain the board and controls.
- The drag library suppresses clicks for 50 ms after a drop. Promotion choices now wait for that cleanup before becoming enabled, preventing a lost first click.
- Clear/restore operations pause analysis and invalidate pending live cache writes, preventing a completed asynchronous save from repopulating cleared data.
- Worker timeouts, cancellation and old-worker callbacks are isolated. Both engine and parsing workers offer recoverable failures; old results do not update newer work.

## Measurements

Cold browser contexts, local production server, decoded JavaScript resources observed in the page. This is not compressed wire size, a mobile benchmark, or a universal performance guarantee.

| Measure | Baseline | Hardened build |
| --- | ---: | ---: |
| Initial decoded JavaScript | 1,814,658 bytes | 1,320,905 bytes |
| Initial Stockfish loading | Worker/loader/WASM requested automatically | No engine assets requested |
| Initial JS reduction | — | Approximately 27% |

The initial **development-build** parsing audit used 40 games / 8,000 plies (49,298 bytes): 6,776 ms and main-thread long tasks of 358, 147, 113 and 102 ms. This demonstrated blocking and justified moving parsing. It is not directly comparable to production throughput.

A **production-build** 40-game / 8,000-ply fixture (50,098 bytes) validated in 871 ms, with 53 animation frames and no observed tasks over the Long Tasks API's 50 ms threshold. Validation still has costs for structured cloning and preview rendering. Inputs and worker deadlines remain bounded; lower-memory phones need further measurements.

Reproduce on a production server with `node scripts/measure-performance.mjs http://localhost:3000`. The script uses the installed Edge browser, creates an isolated context, validates without saving, prints measurements, and closes the context. Results vary by machine and cache state.

## Release checks and remaining limits

Final checks:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed (strict TypeScript) |
| `npm run lint` | Passed, no lint warnings |
| `npm test` | 180 tests passed across 17 files, including mocked upstream, worker lifecycle and IndexedDB integration |
| `npm run build` | Passed; static workspace and five proxy endpoints generated; worker/WASM/license assets prepared |
| `npm run test:e2e:release` | 48 passed, 2 intentional input-specific skips, 2.4 minutes |
| `npm audit --omit=dev` (baseline; dependencies unchanged) | No known vulnerabilities reported |

Primary changed-file groups:

- `src/lib/pgn/{limits,parse,normalize,validate,import-service,move-list}.ts`: bounded parser pipeline and rendering preparation.
- `src/lib/data/`: worker RPC/lifecycle, backup schemas/semantic validation, transactional repositories, downloads and tests.
- `src/lib/platforms/`, `src/store/platform-import.ts`, `next.config.ts`: shared normalization, request bounds/timeouts/throttling, offline and partial-failure behavior, safe headers.
- `src/lib/db/games.ts`, `src/store/library.ts`, `src/components/game-library.tsx`: v5 migration, indexed bounded queries, paginated library.
- `src/lib/engine/{client,domain,repository}.ts`, workspace and analysis components/stores: communication recovery, cache-write invalidation, explicit lazy startup, hidden-tab pause, navigation and rendering reuse.
- Board, dialog, move-list, graph, data-settings and license components, root layout and global styles: keyboard/focus/touch/responsive fixes and data controls.
- `scripts/build-{engine,notices}.mjs`, `public/{engines,workers,licenses}/`, vendor license notice, `scripts/measure-performance.mjs`: reproducible assets, provenance, notices and measurements.
- Vitest/Playwright tests and configs, package scripts, README and this audit: release regressions and operating instructions.

The release suite exercises real WASM and deterministic worker fixtures, actual browser IndexedDB, mocked Chess.com/Lichess endpoints, profile persistence/change, deduplication, comments/RAVs, unsupported-variant guards, queue recovery, graph navigation, export, backups, clearing, keyboard navigation and offline local reading. Responsive checks cover 320×568, 667×375, 768×1024, 1366×768 and 1920×1080, plus doubled text size.

Automated browser coverage is Edge desktop and mobile/touch emulation. Physical iOS/Safari, Firefox, screen-reader usability and low-memory devices remain manual release follow-up. Existing two input-specific skips are intentional: desktop does not run the mobile touch test, and mobile does not run the desktop mouse-drag test.

Backups are bounded JSON snapshots, not unbounded streaming archives. Closed tabs cannot analyze; hidden tabs pause. Cold offline page loads are not supported by a service worker. App throttling is process-local and needs deployment-level limits for public hosting. Custom board colours can reduce piece contrast. See README for bounds, deployment assets and troubleshooting.

The runner may report `NO_COLOR` overridden by `FORCE_COLOR`; this is a console-formatting warning, intentionally deferred. No application runtime warning is intentionally deferred.
