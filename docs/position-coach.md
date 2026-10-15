# Position coach

Open **Coach** beside the board to explain the selected review or free-play position. The report updates when navigating moves and variations. **Analyze this position** starts the existing local Stockfish analysis. Saved game-review analysis is also used when its game, path, and FEN match.

The coach prioritizes check and attacked undefended pieces, then covers tactics, king safety, material, activity, pawn structure, center, open lines, initiative, and plans. Expand individual topics or the five-step thinking routine. Up to three available engine lines are legally replayed to describe candidate moves and replies. The current engine settings determine how many lines are available.

This first version is a local, deterministic explainer, not a conversational language model. It distinguishes measurable board observations from planning prompts. Geometric attacks can include pinned pieces; pawn cover, material, and mobility are not full strategic evaluations. It does not prove forks, pins, sacrifices, compensation, or the absence of deeper threats. A position-only report cannot detect historical threefold repetition. The coach is unavailable during computer games.

## Floating coach and spoken commentary

A bottom-right coach comments when the selected position changes, with a minimizable speech bubble. **Settings → Your chess coach** offers three original SVG portraits: Maia (warm), Iris (bright), and Vera (focused). Avatar choice, voice preferences for each avatar, visibility, and spoken-commentary preference persist on this device. The mobile bubble is compact and its text scrolls for longer comments. The floating coach steps aside in focus mode and in the full Coach tab so it does not cover the detailed explanation.

Commentary uses legal board facts immediately, including checks, captures, castling, promotion, undefended capturable pawns, and missed mates in one. Completed, non-provisional move grades add engine opinions when live or saved review analysis is available. Start analysis in the Engine or Coach tab to obtain engine commentary during free play. A capturable pawn is described as a risk, not a proven net loss; a classic opening move is not called uniquely best without evidence. Unassisted computer games hide the coach. Assisted games may use their existing move feedback.

Enable speech with the speaker button or the setting. Replay speaks the current comment on demand even when automatic speech is muted. Voice previews and per-avatar voice selectors use local device voices through the browser Speech Synthesis API; no microphone or cloud service is used. An unavailable saved voice falls back to a local English voice. If speech or a local voice is unavailable, the text remains accessible with an explanatory message. Browser voices and their naturalness vary; multiple avatars may share the same installed voice, with different rate and pitch.

Rapid position navigation is debounced. Changing position, muting, minimizing, hiding the coach, changing avatar, leaving the page, or hiding the browser tab cancels speech. Automatic speech requires interaction with the page after reload. Reduced-motion preferences disable mouth animation.

## Future conversational assistant

`explainPosition` returns structured factors, candidates, a thinking routine, and a plain-text `narration` field. Floating commentary has its own shorter speech text with expanded piece and square names. A future voice mode could also read longer position explanations.

A future conversational assistant should answer from the report and matching engine evidence, distinguish suggestions from calculated lines, and reject stale responses by FEN and navigation context. Voice input and a remote AI provider are not implemented; no account, microphone access, or API key is required for the current coach.
