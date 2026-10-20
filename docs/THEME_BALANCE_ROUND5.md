# DeckVerse Round 5 — Targeted Roster & Balance Revision

**PR scope:** `agent/d-round5-theme-balance` → `integration/deckverse-theme-online-api-20261021`  
**Verified base:** `bdb6aa078cc117f30ed3696812e3a391ff1f3d01`  
**Data scope:** draft Seven Theme Lab packs only. No API, gameplay-engine, browser, migration, CI, Supabase or deployment changes. **All 560 identity IDs, roster ordering and 50/60/80 manifest membership remain unchanged.**

## Why this is targeted, not artificial equalization

The Round 4 [audit](THEME_BALANCE_AUDIT.md) assigned **258 HIGH and 197 MEDIUM** heuristic/editorial review labels to 560 cards, including high category dominance in Naruto, Avengers, DC and Cricket. Those are **possible review candidates, not 455 proven factual errors**. Derived Rank is sorted from the seven trait totals, making some eight-category dominance mechanically likely. This PR does **not** alter the rank algorithm or force all characters to the same aggregate percentile. Famous characters can remain strong.

The defensible errors are mismatched playing-specialty metadata and a few clear **category-definition** inconsistencies. This change alters only named, documented examples, leaving hundreds of unverified subjective scores alone for the human editor.

## Explicit changes to roster metadata and draft ratings

| Scope | Affected named cards | What changed | Rationale / reviewer caveat |
|---|---|---|---|
| Cricket specialist taxonomy | Mithali Raj, Smriti Mandhana, Shafali Verma, Meg Lanning, Beth Mooney, Laura Wolvaardt | `role=bat` instead of the incorrect generic all-rounder label | Batting specialization; preserves all 20 women in the Women's Cricket collection group |
| Cricket bowling specialist | Jhulan Goswami, Sophie Ecclestone | `role=bowl` | Bowling specialization; iconic Jhulan's manually curated scores remain unchanged |
| Cricket wicketkeeper-batters | Richa Ghosh, Alyssa Healy, Adam Gilchrist, Jos Buttler, Kumar Sangakkara | `role=keeper_bat`; new explicitly differentiated keeper-batter **draft** profile | Keeps batting/fielding relevant without assigning Dhoni's leadership/captain default to every wicketkeeper; keeper/batter eras and performances need human verification |
| Cricket all-rounders | Jacques Kallis, Sanath Jayasuriya, Glenn Maxwell, Yuvraj Singh | `role=allround` | Previously inherited batting-only default despite all-round contributions; degree varies by era/format |
| Naruto tailed beasts | Shukaku, Kurama, Gyuki | Group `Tailed Beasts`, role `tailed_beast` instead of ordinary `ninja`; chakra/endurance-focused draft traits | These are bijū, not shinobi people; nuanced individual strength differences still need franchise review |
| Naruto ancestors | Hagoromo Ōtsutsuki, Hamura Ōtsutsuki | Group `Otsutsuki Ancestors`, role `sage` instead of Akatsuki/enemy `villain` | These are not Akatsuki members; strategy/chakra/ninjutsu emphasis is editorial, not canonical numerical power |
| Ben 10 | Alien X | Technical compatibility **98 → 42**, intellect **98 → 88**; retain strengths 100, energy 100, versatility 100 | Cosmic power does not automatically imply technical hardware expertise; no official Ben 10 numerical power table exists, and activation/version constraints need editorial signoff |
| Avengers | Makkari | Explicit 7-dimensional draft profile with **speed 99**, stronger than ordinary generic-hero speed | Speedster specialty should be visible, with meaningful limits in other traits |
| DC | Kid Flash (Wally West) | Explicit 7-dimensional draft profile with **speed 97**; Barry Allen remains speed 100 | Distinct Wally/Barry identities and relative speed require era/version signoff; no universal canonical measurement |

**Cricket `MS Dhoni` is explicitly unchanged**: group `Wicketkeepers & Captains`, role `keeper`, leadership 100, fielding 99. There are **20 distinct Shin-chan characters × four *invented* scenarios**; the same 80 IDs/scenario names and all their numeric ratings are untouched. No card deleted, renamed, re-ordered or assigned a new ID.

`PACK_ENTRY_OVERRIDES` in `themes/packs/rosters.js` is a narrow data annotation table. `themes/packs/index.js` uses that table when constructing the draft rating profiles; card generation, Rank computation, pack categories and manifest construction otherwise follow their original code. Players' cricket scores are **fictional gameplay ratings, not career averages, bowling figures, ICC stats or historical comparisons**.

### Before vs after evidence protocol

Before is the **exactly verified base** above, which includes Round 4's `scripts/theme-fairness-audit.mjs` and the 12-seed / 3,000-round study. After is the PR-head version of those **same** tests with the **same seeds, chooser rotations, cap and player counts**. No comparison is allowed between experiments with different strategies or sample sizes.

Historical baseline as recorded at Round 4:

| Pack | 80-card pairs winning ≥7/8 categories BEFORE | Cards with HIGH flags BEFORE | Best strategy first-chooser 2P / 3P / 4P BEFORE |
|---|---:|---:|---|
| Avengers | **806** | 62 | 70.83% / 47.22% / 27.08% |
| Ben 10 | **352** | 27 | 58.33% / 36.11% / 22.92% |
| Shin-chan | **148** | 24 | 50.00% / 52.78% / 29.17% |
| DC | **583** | 36 | 58.33% / 41.67% / 35.42% |
| Naruto | **1,050** | 52 | 62.50% / 41.67% / 31.25% |
| Cricket | **544** | 38 | 45.83% / 41.67% / 29.17% |
| Elemental Realms | **97** | 19 | 70.83% / 30.56% / 31.25% |

**Baseline long-match classification (12 seed blocks):** best **756/756 finished**; random **713/756 finished + 43 capped**; Rank-only **752/756 finished + 4 capped**; **0 true repeated-state cycles** at the 3,000-round cap. **Total 47 caps**, not 47 proven infinite games. Random 4P capped most frequently in Ben 10/Shin-chan/Naruto/Fantasy (8/48 each), then DC/Cricket (4/48 each). Fantasy random 3P had 3/36 caps and Cricket Rank-only 4P had 4/48 caps.

**After results:** Awaiting the first PR CI test execution; update table with **actually measured** outputs. This draft intentionally does not promise net improvement before results.

### Test strategy

```sh
npm test
node --test tests/theme-balance-round5.test.js
node --test tests/theme-fairness-audit.test.js
# Existing audit prints per-pack post-edit counts and seed-rotated, 3000-round sims in CI.
node scripts/theme-fairness-audit.mjs --seed=20261021 --seeds=12 --cap=3000 --methods=best,random,rank --output=summary
```

The unchanged `study()` repeats 2P/3P/4P from every starting chooser seat under: top-card-informed best pairwise category, uniform random category, and always-Rank. Its actual unmodified `themes/packs/engine.js` owns tie jackpots, elimination, revealed round winner and validation. It fingerprints full deck order + pot + chooser + tie streak to distinguish **cycle** from **right-censored cap**. Means/CI are clustered by shuffle seed, and fully-completed seed blocks only enter first-chooser estimates. **12 independent blocks are exploratory and not reliable proof of human fairness.** Real player actions, mobile latency and V2 server integration need separate tests.

## Additional unresolved questions — do NOT silently patch

- Hundreds of high dominance flags (especially Naruto/Avengers/DC) remain **deliberately unresolved** pending individual story-era and numeric editorial definitions. A complete automatic equalization would erase recognizable character specialties.
- `Rank` is a deterministic ordering of total trait strength, not an independent category, so one-sided pairs are amplified by construction. Changing it affects **gameplay meaning** and requires separately approved engine/pack product work.
- Ben 10 `Ghostfreak` vs `Zs'Skayr`, and Naruto `Tobi` vs `Obito Uchiha` need distinct depiction/era labeling. Current IDs/names stay untouched for backward compatibility.
- `Women's Cricket` remains an inclusion/group label, not a playing role. Other players' format- and era-dependent specialties require cricket experts. **Do not invent match averages, wicket totals or official rankings**.
- Shin-chan all 80 situations are invented gameplay scenarios, **not real named broadcast episodes**.
- A 3,000-round cap is **only analysis censoring**, not a match draw rule. Any human-facing stall/draw policy, automatic category selection and rematch/endgame change require separate gameplay ownership and user approval.
- The avatar/theme IP and player likeness permissions for Marvel, Ben 10, DC, Naruto, Shin-chan and Cricket are not automatically cleared by better ratings. Production remains **NO-GO** until rights, editor signoff and server/physical-device release checks.

## Verified CI and before/after results

**PASS — both jobs at source commit `13e0f2b822d9668838ebb89a825f19d7c617e3d7`:**

- [DeckVerse CI — run 39485808409](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39485808409): **142/142 Node tests passed**, zero failed; desktop/mobile recovery and existing experimental browser smoke also passed.
- [DeckVerse Theme Packs QA — run 39485808450](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39485808450): **PASS**, real Chromium synthetic viewport smoke, including 320/390/768 px. These are *not* physical phone tests.
- Round 4 baseline: [seeded CI run 39480301475](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39480301475) with the same 12 seeded shuffle blocks × chooser rotations × 2/3/4 seats × all seven packs × three strategies at 3,000-round censoring. These are repeatable engine calculations, **not** production multiplayer.

### A. Category dominance — measured improvements in all modified universes

One unordered card pair counts if one member wins at least **seven of the eight categories**. There are exactly 3,160 distinct pairs per 80-card manifest.

| Theme | Before → After (50-card) | Before → After (60-card) | Before → After (80-card) | Δ 80-card |
|---|---:|---:|---:|---:|
| Avengers | 417 → 417 | 537 → 537 | **806 → 796** | −10 |
| Ben 10 | 186 → 179 | 238 → 230 | **352 → 344** | −8 |
| Shin-chan | 65 → 65 | 82 → 82 | **148 → 148** | 0 |
| DC | 235 → 228 | 385 → 375 | **583 → 572** | −11 |
| Naruto | 409 → 367 | 593 → 543 | **1,050 → 985** | **−65** |
| Cricket | 271 → 269 | 357 → 354 | **544 → 539** | −5 |
| Elemental Realms | 41 → 41 | 52 → 52 | **97 → 97** | 0 |
| **Sum across 80-card themes** | | | **3,580 → 3,481** | **−99 (−2.77%)** |

This is modest progress, **not a cure for dominant cards**. Naruto still has **985/3,160** one-sided category pairings; additional rating changes without expert interpretation would be unjustified.

The original unchanged Round 4 flagging heuristic (including *hardcoded historical* editorial notes) now reports **254 HIGH / 199 MEDIUM / 107 unflagged** cards versus 258 / 197 / 105 before. Because the Round 4 note generator still contains legacy phrases about the old women’s blanket all-rounder taxonomy, **these flag counts are not an authoritative count of uncorrected factual mistakes**. The new Round 5 assertions check actual current role metadata. Do not automatically close all older editorial comments or infer that each severity change represents a fixed error.

**Example targeted upper tail:** Ben 10's highest measured full-roster static category win fraction fell from **99.3% to 86.1%**, while preserving Alien X's extreme strength/energy/versatility; exact causal attribution also includes induced Rank resorting. Every theme retains Rank values 1–80, with no ties.

### B. 2P/3P/4P seeded gameplay — matched baseline and current candidate

Exactly **2,268** experimental local theme-engine matches per commit:
12 independent deterministic shuffle seeds × (2+3+4 rotated chooser seats) × 7 packs × 3 choice strategies, cap 3,000, no game-engine modifications.

| Strategy | Before completed | After completed | Before right-censored | After right-censored |
|---|---:|---:|---:|---:|
| Top-card-informed best category | 756 / 756 | **756 / 756** | 0 | **0** |
| Uniform random category | 713 / 756 | **721 / 756** | 43 | **35** |
| Always Rank | 752 / 756 | **752 / 756** | 4 | **4** |
| **All** | **2,221 / 2,268** | **2,229 / 2,268** | **47** | **39** |

All updated simulations show **zero detected repeated full-state cycles**. A cap is an unfinished/censored game, not proof of infinity or a need for an unapproved draw rule.

| 4P random strategy: capped / 48 | Before | After |
|---|---:|---:|
| Avengers | 0 | 0 |
| Ben 10 | 8 | 8 |
| Shin-chan | 8 | 8 |
| DC | 4 | 4 |
| Naruto | 8 | **4** |
| Cricket | 4 | **0** |
| Elemental Realms | 8 | 8 |

**Other censored matches:** Fantasy random 3P **3/36 both before and after**. Cricket 4P Rank-only caps improved **4 → 0**, **but Avengers 4P Rank-only regressed 0 → 4**. That is why the all-strategy cap total falls by only eight, and why this data does **not** imply a globally solved endgame. On a 3,000-round cap, some completed random games still run for nearly 3,000 rounds (e.g., Shin-chan 2P 2,961; Fantasy 4P 2,895), so continue UX review without changing gameplay rules in this PR.

### C. First chooser — improvements and regressions, 12 seed clusters only

The first chooser win rate uses only **fully finished starting-seat rotation seed blocks** under the best strategy. Neutral expectations: 2P 50%, 3P 33.33%, 4P 25%. These are noisy, small-sample estimates, **not proof of a fair human game**.

| Theme | 2P before → after | 3P before → after | 4P before → after |
|---|---:|---:|---:|
| Avengers | 70.83% → **70.83%** | 47.22% → **47.22%** | 27.08% → **31.25%** |
| Ben 10 | 58.33% → **50.00%** | 36.11% → **36.11%** | 22.92% → **20.83%** |
| Shin-chan | 50.00% → **50.00%** | 52.78% → **52.78%** | 29.17% → **29.17%** |
| DC | 58.33% → **54.17%** | 41.67% → **50.00%** | 35.42% → **25.00%** |
| Naruto | 62.50% → **62.50%** | 41.67% → **22.22%** | 31.25% → **29.17%** |
| Cricket | 45.83% → **50.00%** | 41.67% → **30.56%** | 29.17% → **39.58%** |
| Elemental Realms | 70.83% → **70.83%** | 30.56% → **30.56%** | 31.25% → **31.25%** |

**Important adverse results:** cricket 4P first-chooser advantage appears larger at 39.58%; DC 3P rises to 50%; Avengers 4P grows modestly. Reductions in aggregate card dominance do **not** guarantee a fairer match when card order and chooser selection matter. CIs from 12 independent shuffled blocks remain extremely wide, so treat these as signals for a larger 200–600+ seed retest, not grounds for changing rules or deciding that any theme has fixed bias.

### D. Regression and acceptance gates

The Round 5 test asserts no identity/ID/manifest drift, no category direction changes, no Rank ties, exact role/group annotations, the unchanged Dhoni traits/position, all Shin-chan scenario cards, unchanged 2/3/4 turn/capacity card conservation and expert-identified signature axes. Production DB, server theme registry, hosted physical multiplayer, franchise rights, and approval to change rules were **never part of this audit**.

**Review verdict: DRAFT / NO MERGE / NO DEPLOY.** Accept or reject the targeted editorial changes individually; get subject-matter review of role/depiction assumptions, investigate the 39 censored matches and the 3P/4P chooser regressions, and obtain IP/likeness clearance before unrestricted publication.
