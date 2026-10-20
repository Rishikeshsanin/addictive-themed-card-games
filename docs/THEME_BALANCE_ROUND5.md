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

## CI results

**PENDING** — fill only from actual passing CI outputs; include separate baseline vs Round 5 pair dominance, capped rates, seat and chooser results and runtime. No PR merge or deployment.
