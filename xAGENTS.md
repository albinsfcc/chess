You are building a local-first chess analysis web application from scratch.

PRODUCT GOAL

Create a responsive web app that imports publicly available games from
Chess.com and Lichess, accepts pasted PGN, and analyzes chess positions using
Stockfish running locally in the browser.

TECHNOLOGY

- Next.js App Router
- React
- TypeScript with strict mode
- Tailwind CSS
- shadcn/ui for standard UI controls and dialogs
- react-chessboard for the board
- chess.js for legal moves, FEN and SAN
- @mliebelt/pgn-parser for multi-game PGN, comments and recursive variations
- Dexie/IndexedDB for local persistence
- Zustand for current workspace state
- Zod for runtime validation
- Stockfish.js lite single-threaded WASM in a dedicated Web Worker
- Vitest for unit tests
- Playwright for critical browser flows

ARCHITECTURE RULES

1. Stockfish must never run on the React main thread.
2. Create one engine service that owns and communicates with one Web Worker.
3. React components must not send raw UCI commands.
4. Normalize engine output into typed domain objects.
5. Save imported PGNs and completed position analyses in IndexedDB.
6. Do not store large game collections in localStorage.
7. Save only small UI preferences in localStorage.
8. Proxy Chess.com and Lichess requests through Next.js route handlers.
9. Never ask users for Chess.com or Lichess passwords.
10. Import public games using usernames only.
11. Make Chess.com archive requests sequentially and handle HTTP 429.
12. Parse Lichess game exports as a stream where possible.
13. Deduplicate using source plus external game ID, with a normalized-PGN hash
    fallback.
14. Support standard chess only in the MVP. Preserve unsupported games but
    disable analysis and display an explanatory message.
15. Preserve PGN comments, NAGs and recursive annotation variations.
16. Analyze the main line automatically. Analyze other PGN branches only when
    selected.
17. Cache analysis by FEN, Stockfish version and analysis configuration.
18. Store centipawn and mate scores as separate types.
19. Normalize stored evaluations to White's perspective.
20. Do not reproduce Chess.com's branded board, pieces, sounds or proprietary
    classification graphics.

CORE EXPERIENCE

The home page is the chess workspace, not a marketing page.

It contains:

- A responsive chessboard with pieces in the starting position.
- Visible a–h files and 1–8 ranks.
- Buttons for:
  - Import from Chess.com
  - Import from Lichess
  - Paste PGN
  - Start analysis
  - Settings
- Move navigation.
- Game list.
- Engine evaluation and top variations panel.

BOARD REQUIREMENTS

- Drag and click-to-move.
- Legal moves only.
- Promotion chooser.
- Last-move highlighting.
- Check highlighting.
- Best-move arrows.
- Flip board.
- Undo, redo and reset.
- Custom light and dark square colours.
- Configurable piece set.
- Coordinates can be shown or hidden.
- Board settings persist.

IMPORT REQUIREMENTS

Chess.com:
- Validate GET https://api.chess.com/pub/player/{username}
- Fetch GET https://api.chess.com/pub/player/{username}/games/archives
- Fetch monthly archives sequentially.
- Read PGN from each game.
- Handle 404 and 429.
- Support incremental refresh.

Lichess:
- Validate GET https://lichess.org/api/user/{username}
- Fetch GET https://lichess.org/api/games/user/{username}
- Prefer NDJSON streaming.
- Support a date range and maximum number of games.
- Support incremental refresh.

PGN:
- Accept one or multiple games.
- Validate before saving.
- Show valid, invalid, duplicate and unsupported counts.
- Support FEN/SetUp headers.
- Preserve comments, NAGs and variations.

ANALYSIS REQUIREMENTS

Use Stockfish UCI.

Initialize with:
- uci
- isready
- setoption name MultiPV value 3

Support:
- Quick: 250 ms per position
- Standard: 750 ms per position
- Deep: 2000 ms per position

For every analyzed position store:
- FEN
- ply
- played move in UCI and SAN
- engine score
- mate score when applicable
- best move in UCI and SAN
- depth
- nodes when available
- top three principal variations
- engine version
- analysis configuration

Analysis must be cancellable, resumable and persisted after every completed
position.

START ANALYSIS MODES

Free play:
- The user manually makes legal moves.
- Stockfish does not automatically recommend a move.

Assisted analysis:
- The user manually makes moves.
- Stockfish analyzes the current position after every move.
- Show evaluation, best-move arrow and top three principal variations.
- The user controls navigation manually.

QUALITY REQUIREMENTS

- TypeScript strict mode.
- No any unless justified in a comment.
- Keep platform API clients separate from UI.
- Keep PGN parsing separate from persistence.
- Keep engine parsing separate from worker lifecycle.
- Include loading, empty, success and error states.
- Make the application usable on desktop and mobile.
- Add focused tests for PGN parsing, deduplication, UCI output parsing and
  evaluation normalization.
- Include Stockfish GPL notices and corresponding-source information.

WORKING METHOD

Before changing code:
1. Inspect the existing repository.
2. Create a concise implementation plan.
3. Identify assumptions and risks.
4. Implement only the requested phase.
5. Run relevant tests and the production build.
6. Report completed work, files changed, tests run and remaining items.


<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


