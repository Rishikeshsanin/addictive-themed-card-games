# DeckVerse V2 — Fairness, Match Duration and Card Balance

**Agent A research report | 2026-10-20 | review-only**  
**Source branch:** agent/fairness-audit  
**Draft PR target:** feature/rematch-multiplayer-reliability  
**Code ownership:** scripts/fairness-*.js, tests/fairness-*.test.js, this document.  
**Prohibited changes observed:** no game engine, active card catalog, deck manifest, shared API, SQL, Project Hub, LiveKit or production modification.

## Executive findings

**A material first-chooser advantage is reproducible under the existing top-card-informed best-category strategy**, in all 2/3/4-player modes. The original audit's **59.2% of 10,000 two-player matches** was independently reproduced exactly using the unchanged V1.2 seeded simulator: **10,000/10,000 finished, zero cycle/round-cap stalls; median 57, p90 149, p99 283 rounds**. This is not a player study.

A separate matched-shuffle experiment used **600 independent shuffled deck seeds per player count**, rotated **every starting chooser seat for each seed**, and compared the normal opening with a counterfactual **blind neutral first category** using the *same* decks and RNG streams. This produced the following results for the original global best-category heuristic:

| Player count | Match attempts per policy | Neutral | Normal first-chooser win rate (seed-cluster 95% CI) | Blind neutral first category | Within-seed difference, blind − normal (95% CI) |
|---|---:|---:|---:|---:|---:|
| 2 | 1,200 | 50.0% | **59.17%** (56.91–61.42%) | 49.92% | **−9.25 pp** (−11.51 to −6.99 pp) |
| 3 | 1,800 | 33.33% | **42.67%** (40.85–44.49%) | 33.44% | **−9.22 pp** (−11.05 to −7.39 pp) |
| 4 | 2,400 | 25.0% | **32.04%** (30.46–33.63%) | 25.29% | **−6.75 pp** (−8.34 to −5.16 pp) |

**All 10,800 matches in that normal/blind best-category comparison finished within 3,000 rounds; none hit a detected repeated state**. For 3/4 players these are *experimental local-engine matches*, not production integration evidence. Category-call and pot metrics below are conditioned on completed matches.

> **Interpretation:** In the default best-category strategy, the opening player can choose whichever attribute best suits their known top card. Blind opening samples an independent uniform first category; after round one, all existing winner/chooser/tie rules operate unchanged. Blind opening is a **simulated alternative, not an implemented production rule**. Its near-neutral results are expected because the opening category is no longer dependent on which seat was designated chooser. Normal human strategies could behave differently.

## Methods and reproducibility

Source inspected: src/engine.js, src/multi-engine.js, src/catalog.js, scripts/simulate.js, scripts/multi-simulate.js, scripts/balance.js, 2/3/4 manifests, current tests, docs/QA_AUDIT_2026-10-20.md, AGENTS.md, SUPABASE_HUB_RULES.md, README.md and docs/DEPLOYMENT.md.

New **read-only** harness: scripts/fairness-study.js; companion tests: tests/fairness-study.test.js. The script imports and runs the actual unmodified in-repository engines, rather than copying game logic or accessing the database. It uses independent seeded xorshift32 streams for deck shuffling, random-play choices and neutral opening. For each shuffled seed and each size, the harness runs the *same deck order* for all possible starting chooser seats; starting-seat variants are correlated, so **the statistical sampling unit is the shuffle seed, not the individual match**. For every seed with all rotated matches completed, use the proportion of starting chooser wins; a 95% confidence interval uses 1.96 × the standard error across **seed-block means** (normal approximation). The counterfactual delta uses a matched difference for each seed. If any starting-seat replay hits a cap/cycle, exclude that **entire seed block from the primary win-rate CI**, while separately counting every incomplete attempt. The CI is a simulation uncertainty interval, **not** external validity to real humans.

Strategies used:
- **best:** For the chooser's currently visible top card, choose its highest historical pairwise category score over the active deck. Same underlying heuristic as scripts/simulate.js, including tie credit of 0.5. This is a deck-aware oracle-like strategy; it is not a human opponent model.
- **random:** Select one of the eight categories uniformly on every turn from a separately seeded strategy RNG. The resulting category sequence is chooser-independent.
- **rank:** Always call Rank, which has unique values across these manifests; a deterministic chooser-independent control strategy.

The cap is **3,000 turns** per match, with complete-deck-order state-cycle detection. A round-cap is classified **unfinished**, not a proven infinite cycle. Changing the cap or strategy may substantially change duration statistics and estimates. Exact replay commands:

~~~bash
node scripts/simulate.js 10000
node scripts/fairness-study.js --seeds=600 --seed=20261020 --cap=3000 --strategies=best --opening=both
node scripts/fairness-study.js --seeds=600 --seed=20261020 --cap=3000 --strategies=random,rank --opening=normal
node --test tests/fairness-study.test.js
npm test
~~~

No package.json or CI workflow was modified, per file-ownership contract. Full JSON output includes per-scenario candidate results, matched-pair CIs, deck audits, ties, max pots, categories, winner seats and match-length percentiles. For other experiments use --strategies=best,random,rank and --opening=normal,blind,both. The upper bound on requested seed blocks is 3,000.

## Strategy sensitivity, stalls and long-match risks

**600 seeds per size, all chooser-seat rotations, unchanged normal opening:**

| Strategy | Seats | Attempts | Finished | 3,000-round cap | First-chooser win rate among complete blocks | Median / p90 / p99 rounds (finished only) |
|---|---:|---:|---:|---:|---:|---|
| best | 2 | 1,200 | 1,200 | 0 | 59.17% | 57 / 137 / 281 |
| best | 3 | 1,800 | 1,800 | 0 | 42.67% | 93 / 257 / 449 |
| best | 4 | 2,400 | 2,400 | 0 | 32.04% | 162 / 423 / 715 |
| random | 2 | 1,200 | 1,194 | 6 | 50.0% | 473 / 1,289 / 2,159 |
| random | 3 | 1,800 | 1,776 | 24 | 33.33% | 665 / 1,797 / 2,686 |
| random | 4 | 2,400 | 2,140 | **260 (10.83%)** | 25.0% | 1,112 / 2,278 / 2,810 |
| rank | 2 | 1,200 | 1,200 | 0 | 50.0% | 273 / 681 / 1,521 |
| rank | 3 | 1,800 | 1,800 | 0 | 33.33% | 296 / 849 / 1,472 |
| rank | 4 | 2,400 | 2,392 | 8 | 25.0% | 583 / 1,477 / 2,531 |

**Zero repeated full states** were detected in these batches. Incomplete games are **right-censored at 3,000 rounds**; there is no proof that they would never terminate, and it would be incorrect to advertise zero timeouts. The random/rank controls are deliberately chooser-independent, so rotating which seat is labeled initial chooser re-labels the same outcome under fixed shuffle and category RNG: the seed-block confidence intervals collapse to their neutral baselines. **This is a control-design property, not empirical evidence that human players are unbiased.**

Recommended follow-up: coordinator should define an approved long-match handling/forfeit/draw policy, then test it in a separate shared-engine PR. Do not silently end arbitrary long matches at 3,000 rounds; match duration, fairness and jackpot resolution need product decisions first.

## Deck-strength distribution and category dominance

Pairwise results from existing benchmark() across all eight stat categories:

| Manifest | Cards | Unordered card pairs | Stat comparisons | Absolute card-strength range (half credit for ties) | >=7 of 8 categories dominated | 8-of-8 domination |
|---|---:|---:|---:|---:|---:|---:|
| 2P | 50 | 1,225 | 9,800 | 48.98%–50.89% | 0 | 0 |
| 3P | 60 | 1,770 | 14,160 | 46.08%–63.88% | **27** | 0 |
| 4P | 80 | 3,160 | 25,280 | 43.83%–63.21% | **36** | 0 |

**Observations:** The existing two-player tuned 50-card set is nearly uniform by *aggregate pairwise score*. Adding cards to make the 60/80-card manifests increases the spread and introduces many seven-category-dominant pairs. A static aggregate card score is not equivalent to game-match win probability, especially with chooser powers, deck order and ties. **Do not adjust raw reference heights/weights or tuned category numbers without coordinator approval and a separate validation.**

**Category tie rate among unordered card pairs:** Height is the most tie-prone: **4.16% (2P), 4.01% (3P), 4.59% (4P)**. All active Rank values are unique (0 exact Rank ties); other individual stat tie rates range roughly 0.4%–1.6%. These are theoretical pair statistics, not actual tied-round rates, which depend on strategic category choice.

## Observed tie pots, jackpots and winner seats

Under **best / normal** (finished games only):

| Size | Tied rounds / all played rounds | Largest observed standing pot | Largest observed award | Seat victory counts |
|---|---:|---:|---:|---|
| 2P | 0.626% | 2 cards | 4 cards | 604 / 596 |
| 3P | 0.692% | 6 cards | 9 cards | 586 / 606 / 608 |
| 4P | 0.737% | 8 cards | 12 cards | 561 / 594 / 604 / 641 |

The initial chooser's win chance and individual **seat index** win chance are distinct. Rotating chooser seats over identical shuffled decks makes positional bias easier to study but does not ensure all seat indices have identical win percentages in one finite experiment. Jackpot maxima are **observed**, not hard limits of the engine. The scripts track the largest outstanding central pot and largest single round-award separately.

Under **random / normal**, the largest observed pot was **4/9/8 cards** for 2/3/4 players respectively, and maximum one-round award was **6/12/12 cards**. Ties were **~1.32% / 1.34% / 1.56%** of completed-match rounds. The long tails and censoring mean these figures should be revisited with more realistic strategy mixtures.

## Proposed policies — COORDINATOR APPROVAL REQUIRED

**Recommendation A: rotate first chooser on successive rematches (minimal rule change, safe nostalgic default).** In a continuing same-room series, rotate the initial chooser seat clockwise after each game, cycling through all 2/3/4 active players. Publish whose next opening turn it is. Keep all existing eight categories, card scores, winner-chooses-next, tie jackpot, sudden death and card collection order. This equalizes **opportunities to start** over a complete series; it does *not* eliminate first-chooser advantage in any single game, ensure fairness in abandoned/short series, or guarantee equal wins in a small sample. Server authority must select the next starter (not client UI). If seat count/roster changes, agree on a reset policy.

**Recommendation B: optional neutral first category for competitive/ranked rules (stronger single-match mitigation, gameplay change).** In the first round only, choose a category from a publicly verifiable/unbiased server RNG **independent of the designated first chooser**. Thereafter use the current chooser/winner rules, including tie handling, unchanged. The paired experiment shows a roughly **7–9 percentage-point reduction** in opening advantage under best-category play, with confidence intervals excluding zero. Tradeoffs: first-round player agency is reduced, ties can retain an initial chooser, and matched-deck estimates do not guarantee human fairness. This requires a product decision, authoritative secure randomness, UX disclosure and fresh real-server tests. The research harness merely overrides the round-one category in simulation; **no server rule has been changed**.

**Recommendation C: tune the extra 10/20 card subset for 3/4 players only after broader playtests.** Try candidate catalog/manifest variants in offline snapshots (a *future* coordinator-approved change), hold 2P baseline fixed and rerun matched-seed strategies. Do not transfer the existing 2P card-balance guarantee to 3/4 players.

**Do not** introduce jackpot multipliers, arbitrary random winning bonuses, hidden midgame catch-up boosts or retroactive winner manipulation as a quick 'fairness' fix. Those alter the childhood trump-card rules and can introduce worse incentives.

## Regression tests and remaining gates

New tests assert deterministic seeds and RNG, best-strategy stat coverage, 2/3/4 manifest pair counts, rank uniqueness, bounded category/pot accounting, reproducible matched-seed scenarios, CI behavior, completed/stalled reconciliation and input validation. The harness does **not** mutate global RNG, source engines, databases or other projects. Existing engine and multi-engine suites remain the authority for turn logic and conservation.

**Outstanding risks and release blockers:**
1. **Competitive human fairness remains unmeasured.** Mixed imperfect-knowledge opponent models, decision times, player skill, real rematch attrition and seat-sensitive play require further study.
2. **Long matches under weak/random strategies** frequently hit the 3,000-round research cap at 4P. No actual state cycles were observed; do not label this an infinite loop without proof.
3. **3/4 catalog balance** diverges from 2P. No active catalog values or manifests were changed.
4. **Online multiplayer/API verification** and 3/4 production readiness are out of scope; pending migration, abuse protection, presence/host-loss handling and actual hardware LiveKit tests belong to coordinator/other agents.
5. **Pokémon names/images are not licensed for unrestricted distribution.**
6. **No merges, deployments, SQL, Project Hub, production credentials or unrelated repositories were touched.**

**Release position:** preserve existing casual rules while the coordinator reviews rematch rotation; do not claim ranked/competitive fairness until a policy is approved, implemented in the appropriate shared-code PR and validated end-to-end. This fairness-agent PR is **research + tests only**.
