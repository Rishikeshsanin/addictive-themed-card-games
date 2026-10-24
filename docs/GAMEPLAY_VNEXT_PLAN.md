# DeckVerse — Gameplay VNext

**Status:** PRODUCT + ENGINEERING PLAN ONLY — no gameplay implementation or release approved by this file.

**Baseline:** `main` SHA `aa57d25832fe2e200bfb65f8d89e3f40dd1b6fc1` (25 Oct 2026, main CI passed, Vercel production READY).  
**Stable reference:** `backup/deckverse-stable-20261025-aa57d258` (keep unchanged).  
**Work branch:** `feature/deckverse-vnext-gameplay-20261025`.  
**Production:** https://addictive-themed-card-games.vercel.app/

## Goal
Make DeckVerse more fun to replay, fairer to reason about, visually satisfying during turns, faster when desired and credible enough that stats never feel nonsensical. Preserve nostalgic **Classic** mechanics, rank lower-wins, 8 comparison categories, 50/60/80-card manifests, existing 13 theme selections and current Pokémon online 1v1.

The priority is **agency and satisfying rounds**, not artificially maximizing session time, pay-to-win, addictive dark patterns, streak-pressure rewards or fake uncertainty.

## Current product truth / boundaries
- `src/**`: original Pokémon classic and production online 1v1. **NO MODIFICATIONS during this VNext solo gameplay iteration.**
- `themes/packs/**`: twelve expansion packs, currently 2/3/4-player games against bots (50/60/80 cards). They are **not online multiplayer rooms**.
- Theme engine: `themes/packs/engine.js`, interface: `themes/packs/lab.js`, catalog: `themes/packs/index.js`, `rosters.js`, `bonus-rosters.js`, `bonus-ratings.js`.
- Expansion bot `bestBlindCategory()` chooses the highest estimated win-probability stat over the public theme manifest; it does not inspect opponent live top-card/deck order. Current bot difficulty does not vary.
- `themes/packs/lab.js` provides reveal pacing: Quick (850 ms), Standard (1300 ms), Relaxed (2200 ms); bot response also varies. These are **animation pacing options**, not short-match rules.
- Exact player counts 2/3/4 and Rank-lower rule must remain; no economy, ads, gated cards, new compulsory features.
- Ratings in some packs are deterministic editorial gameplay drafts; not objective fandom or sports data. Examples of imbalance: overwhelming 7-stat dominators and specialist misclassification. Review for **obvious contradictions**, not impossible cross-universe canonical precision.
- Baseline browser + game CI green doesn't demonstrate high-quality enjoyment, all player behaviors or long-tail match safety.

## Work order (each independent, reviewed PR; never direct to main)

### Phase 0 — Lock baseline, measure before making changes
- Preserve exact SHA stable branch; record screenshot + Vercel deployment URL and latest green workflow.
- Measure seeded matches per theme × player count: completion/round distribution p50,p90,p99; first chooser advantage; win rate by bot difficulty; tie/jackpot frequency; share of categories selected; repeated states; time spent waiting in UI.
- Isolate reproducible seed injection for **test environments only**; cryptographic shuffle remains for normal play.
- Pin minimal baseline tests that ensure Legacy Classic, Pokémon online endpoints, original theme roster IDs and 50/60/80 conservation do not change.

### Phase 1 — Rules correctness and believable category choices
- Correct clear mistakes only (e.g. mismatched roles/classifications, non-user of Devil Fruit represented as genuinely powerful in that category, goalkeepers incorrectly assessed via outfield templates, magical non-casters treated as wizards).
- Prioritize explicit editorial review of frequently drawn/iconic cards and role specialists. A gifted technician must have a reason to choose their best stat against a powerhouse; avoid near-universal seven-stat dominance.
- Prefer a focused `docs/GAMEPLAY_STAT_RULES.md`: what each stat means, how no-ability/zero-applicability is scored, example rationality checks, and clear declaration that game ratings are subjective.
- Rank lower-wins remains. Do not scramble existing card IDs/deck ordering unnecessarily. Add validation tests for known archetypes, not just valid 1–100 ranges.
- Do not flatten recognizable heroes or athletes into implausible equal scores merely to satisfy arbitrary parity targets.

### Phase 2 — Fun-first battle feel, without new mechanics
- Make **one card-selection decision** clearly meaningful. Reveal both chosen cards, category/value difference, winner, quantity claimed, jackpot and who chooses next. Make each outcome understandable within a glance.
- Smooth, fast animations with options for reduced motion. Improve winner-take-card motion and satisfying but not distracting haptic/audio opt-ins.
- Fix any disabled/unclickable controls, stale timers across theme switch/new match, input spam and results that vanish before review; keyboard/touch/accessibility checks.
- Make rematch one clear action with same theme/players, fresh secure shuffle and optional change of pack.
- Current Classic gameplay rules remain available unchanged.

### Phase 3 — Optional genuinely short **Quick Clash** game mode (separate from pace)
- Offer Classic (existing full-deck elimination) **as default** and a clearly labeled Quick Clash option under expansion solo practice.
- Proposed Quick Clash rule: deterministic match round limit **35 / 42 / 48** for 2 / 3 / 4 players, respectively; winner is highest **owned** card count **after resolving any active jackpot**. A tied last round extends briefly to a decisive tie-break, with an explicit upper safety limit, never arbitrarily discard or duplicate jackpot cards. Equal owned counts require a transparent deterministic additional tied-score rule (e.g., a small rank-based showdown), not choosing seat zero.
- Limits are **design hypotheses**, not agreed gameplay measurements. Tune via simulations and UI playtests before implementing/locking them. Do not promise a fixed time duration.
- No rules changes to legacy Pokémon online rooms, existing Classic or stored sessions.

### Phase 4 — Bot personality / skill, without cheating
- Easy: occasionally makes imperfect but plausible choices using only the bot's own top card and public deck distribution.
- Normal: mixes a reasonably strong category with controlled variation (protect from always choosing Rank).
- Expert: best blind probability estimate without peeking at player hand, hidden deck order or future cards.
- Seed tests for determinism; prevent unfair randomness skew, bot freezing and game continuation after exit.

### Phase 5 — Balance, long-match controls, fair matches
- Evaluate all 12 packs × 2/3/4 players × bot levels under hundreds/thousands of seeded games. Report first-chooser outcomes with sample counts, not a single anecdotal percentage.
- Investigate dominant characters and useful category variety, but retain recognizable character identity and high-stakes counters.
- Classic can be long by design. If offering a stall/cycle escape, it must be optional/visible and must not silently confiscate a player's cards.
- Every match: no duplicate/lost/foreign cards, no pot left incorrectly abandoned, no action outside chooser turn, hidden cards secret before reveal, no infinite auto-bot timer loop.

### Phase 6 — Release quality gates
- Run existing `npm test` and `themes/packs/qa/browser-smoke.mjs`, plus extended state-machine tests and seeded gameplay QA.
- Real Chromium at 320, 390, 768, 1366px (desktop & phone); no uncaught JS, hidden unclickable controls, clipping/scroll overflow; accessibility keyboard and reduced-motion.
- Verify 12 expansion packs, same/new matches, Quick Clash and Classic, difficulty levels, jackpot tie, exhaustion, sudden death, early exit, theme switch and refresh.
- Record before/after measured completion time/rounds and outlier rates; add screenshots or short real capture.
- No production release without scoped PR review, passing exact-SHA CI, feature parity, zero new backend/database changes, and **explicit owner approval for production merge**.
- Keep backup ref unchanged; production rollback path points to Vercel deployment created from `aa57d25832fe2e200bfb65f8d89e3f40dd1b6fc1`. Do not alter schema, Vercel settings, secrets or unrelated repos.

## Proposed isolated implementation lanes (after baseline plan review)
1. **Game Engine + Quick Clash** — own `themes/packs/engine.js`, tests for rules. Avoid simultaneously editing UI.
2. **Gameplay UI + feedback** — own `themes/packs/lab.js`, `themes/packs/lab.css`, UI tests; follow engine's agreed mode contract.
3. **Content sanity + meaningful counterplay** — own bonus rating and roster files, `index.js` only with coordination; audit known anomalies, never blindly re-rate 960 cards.
4. **QA + benchmark** — own dedicated test/simulation scripts and `docs/` benchmarks; run before/after locally, final browser smoke after integration.

**Coordinator rules:** Each lane isolated branch / DRAFT PR, no PR merges until integration branch passes and final site owner approves. Old V2 multiplayer branches remain separate.

## Definition of success
Players understand each outcome, can choose meaningful categories, see exciting but skippable reveals, choose a short or classic match, enjoy non-cheating bots and immediately rematch. Technical proof covers all twelve packs and no regressions to the original online Pokémon game.
