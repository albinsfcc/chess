# Nova review regression evidence

User-supplied 77-ply game, analyzed locally with the bundled Stockfish 19 Lite single-thread WASM via UciSession. All 78 positions used the standard 750 ms budget, unrestricted strength and MultiPV 3, sequentially in one engine. Scores are White-relative. The terminal result is normalized by the existing terminal-position helper. Captured on 2026-09-27. This fixture is search evidence, not a claim of exhaustive chess truth.

On identical recorded results, the old model produced White 98.26 / Black 94.53. The v2 outcome/material model produces 93.77 / 84.93, excluding forced moves. The reference screenshot shows 91.5 / 83.8; these are comparison observations, not assertions or calibration targets. Different depth, hardware, opening books and proprietary grading can produce different move labels and scores.
