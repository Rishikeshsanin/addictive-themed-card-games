# DeckVerse Round 4 — Seven-Pack Fairness & Editorial Audit

**Branch:** agent/d-theme-fairness-audit → integration/deckverse-v2-theme-preview-20261020  
**Exact inspected base SHA:** c3d58abd7fcba152b92df1ffda57fedd4049c74e  
**Coverage:** Avengers Saga, Ben 10 Alien Clash, Shin-chan Chaos, DC Legends, Naruto Shinobi Clash, Cricket Legends and Elemental Realms — **560 cards, 7 × 80**, and 50/60/80 manifests in every pack.  
**Change boundary:** new read-only theme-fairness script/tests and this document only. No card ratings, rules, manifests, API, SQL, UI, Supabase or deployed Pokémon changes.

## Review classification

These expansion numbers are **subjective game-design proposals**, not canonical superhero/anime power levels, official cricket performance figures, published character lore or historical match records. Any contradiction below is an editorial-review hypothesis, or an internally measurable comparison, not an externally verified canonical fact. Character identity/version and category meaning require a qualified franchise/cricket editor, and public rights approvals.

The isolated theme pack engine in themes/packs/engine.js is an experimental **solo-bot demonstrator**, NOT the authoritative V2 database multiplayer implementation. The simulations measure its mechanics only; they are not production-network, physical phone or live Supabase tests. No rating changes are approved by this audit.

## Reproducible audit and every-card review export

\`\`\`bash
node --test tests/theme-fairness-audit.test.js
# seeded matched-shuffle simulations; cap is a censoring point, NOT a termination rule:
node scripts/theme-fairness-audit.mjs --seed=20261021 --seeds=4 --cap=1200 --methods=best,random,rank --output=summary
# full 560-row CSV, one row per card including all seven trait scores and Rank:
node scripts/theme-fairness-audit.mjs --output=cards-csv > theme-fairness-all-560-cards.csv
# JSON per-card editorial explanations and 50/60/80 win-rate comparisons:
node scripts/theme-fairness-audit.mjs --output=cards-json > theme-fairness-all-560-cards.json
# larger local exploratory run with per-theme outcomes and card diagnostics:
node scripts/theme-fairness-audit.mjs --seed=20261021 --seeds=20 --cap=3000 --methods=best,random,rank --output=full-json > theme-fairness-all-results.json
\`\`\`

The generated CSV/JSON files are optional local outputs (not committed generated files or character-rating edits); the script is the owned reproducible **card-by-card editorial review report generator**. Each row records: theme, ID, name, group, role, source/provenance, actual eight-category rating values, full-roster pairwise win share, 50/60-card win share where present, manifest inclusion, 7-of-8 and 8-of-8 pairwise dominance counts, severity and concrete flagged reasons. This avoids hiding the 500+ normal/low-priority reviews under only a top-cards list. Flags are heuristics requiring human acceptance or dismissal.

Seed generator: xorshift32 with deterministic theme+size+block mixing; the **same shuffled deck seed** is run from each starting chooser seat. Strategies: **best** selects the category with the highest offline pairwise performance of the chooser's own top card, without inspecting hidden opponent order; **random** selects a uniformly random category; **rank** always selects the unique lower-wins Rank. Neither best nor random is a human-behavior model. Every match uses unchanged theme-engine shuffle/turn, pot/jackpot and termination logic. Full deck-order, pot, chooser and consecutive-tie state is hashed for exact cycle detection; beyond \`cap\` is **right-censored**, never silently declared finished. Ties, max pot, max award, category distribution, round quantiles, seat winners, first-chooser success and seed-cluster 95% normal-approximation intervals are exported. Confidence intervals only include seed blocks for which all starting chooser variants completed; partial/capped blocks are separately reported. With small CI samples, interval estimates are **exploratory**, not precise.

The rank contract is enforced for every theme: eight named theme-appropriate categories, only Rank uses **minimum**, other seven use **maximum**. All 80 Rank values are distinct because rank is derived from sorted aggregate rating sum; this also makes Rank correlated with the other strengths by design and should be reviewed as a game-balance choice, not a canonical attribute.

## Known structural and editorial considerations

### Mandatory identity / taxonomy preservation

- **Cricket Legends — MS Dhoni:** verified design requirement is **Wicketkeepers & Captains**, \`role=keeper\`. Preserve classification and retain leadership/fielding editorial strengths; do not move him into batting-only or all-rounder groups.
- **Shin-chan Chaos:** exactly **20 named source characters × 4 ORIGINAL fictional situations = 80 distinct card entries**. These are **not four canonical character variants, official episodes or 80 separate people**. Duplicates must be detected after (not before) parsing the original scenario suffix. Check each actor has Playtime Challenge, Festival Adventure, Secret Mission and Surprise Showdown once.
- **Cricket Women's Cricket grouping:** all 20 women are assigned \`role=allround\` as a broad draft fallback, even when a player is primarily a batter, bowler or wicketkeeper. This incorrectly conflates team/inclusion group with cricket specialization, creating an internal rating-baseline mismatch. In particular, Mithali Raj, Smriti Mandhana, Jhulan Goswami, Sophie Ecclestone, Alyssa Healy and Richa Ghosh warrant **HIGH editorial priority**. Grouping corrections require approved source edits outside this PR; do not invent actual numerical statistics.
- **Other cricket classification prompts:** Jacques Kallis (all-rounder under Batters); Adam Gilchrist / Jos Buttler / Kumar Sangakkara (wicketkeeper-batters grouped as Batters); Sanath Jayasuriya / Glenn Maxwell (batting plus all-rounder contribution) need role-version review. These observations flag taxonomy, not precise career numbers.
- **Naruto:** Obito Uchiha and Tobi can represent the same identity under differing personas/eras; label intended version or document deliberately separate cards. **Ben 10:** Ghostfreak vs Zs'Skayr similarly needs explicit form/identity policy. **DC:** Barry Allen and Wally West are already explicitly distinct identities, not accidental duplicates.
- **Fantasy:** different realms share class templates (Wyvern, Sprite, Titan and others). Although hash modifiers introduce numerical variation, an elemental identity should justify which stats truly differ; avoid unsupported color/realm superiority claims.

### Severe and medium review rules (automatic flagging, not auto-balancing)

| Severity | Trigger | Recommended editorial action |
|---|---|---|
| HIGH | One card beats another on all eight stats, or at least three other cards on seven categories; known duplicate-persona or important role contradiction | Compare against named peers and source role; decide version and strength limit explicitly |
| MEDIUM | Any seven-category domination, multiple total-dominated opponents, full-manifest pairwise win fraction outside 32%–68%, at least five of seven strengths ≥95, only 3 distinct non-Rank values, or women’s blanket allround taxonomy | Re-evaluate category interpretation and differentiate existing roles without faking career data |
| LOW | Deliberate highly recognizable editorial strength; Dhoni classification protection | Retain if the design owner verifies the contrast; record rationale |
| CRITICAL | Manifest/card identity violation, incorrect Shin-chan structure or loss of mandated Dhoni classification | Block promotion; these invariants fail automated tests |

Because Rank is sorted from total seven-stat strength, a strong draft character tends also to win Rank. Dominance across all eight categories is possible; the exact pair counts, affected card IDs and truncated-manifest shifts are emitted by the audit. Simply equalizing averages or nerfing famous characters to look “fair” can erase meaningful strengths; prefer expert-edited profiles with explicit weak dimensions.

### High-priority named editorial review queue

| Theme | Character(s) | Issue to investigate | Suggested correction (review-only) |
|---|---|---|---|
| Ben 10 | Alien X | Multiple maxed traits; potentially dominant | Add explicitly chosen limitations or better dimension separation; label depiction |
| Ben 10 | Grey Matter / XLR8 / Four Arms | Intellect, speed and physical strength need distinct profiles | Compare their **relative** specialty rank in each intended category |
| Avengers | Hulk / Thor / Scarlet Witch | How pure energy, raw strength and magic are scored | Publish distinct energy vs physical force definition, check numerical extremes |
| DC | Flash (Barry Allen) / Kid Flash (Wally West) | Speedster version/era consistency | Keep different civilian identities while naming comparison era |
| Naruto | Tobi / Obito | Identity/era overlap | Explicitly name persona/era if both remain |
| Naruto | Rock Lee / Might Guy | Taijutsu specialty vs ninjutsu/genjutsu | Preserve strengths with differentiated weak axes |
| Cricket | Mithali, Jhulan, Smriti, Sophie, Alyssa, Richa | Incorrect umbrella \`allround\` role | Separate group membership from cricket specialist role |
| Cricket | MS Dhoni | Required keeper and captain role | Preserve \`Wicketkeepers & Captains\`, not a proposed fix |
| Fantasy | Eight Sprite/Titan/Golem families by realm | Realm differences arise from deterministic hash modifiers | Editor author distinctive elemental rationale, not random lore |
| Shin-chan | All 20 × 4 original situations | Four scenario cards per same character | Check each situation changes humor/courage/luck in sensible directions without mislabeling episodes |

## Pokémon historical comparison and interpretation limits

The historical [Pokémon V2 fairness study](FAIRNESS_V2.md) ran 600 matched shuffled seeds per mode under the best-category heuristic and reported **normal-opening first-chooser rates** of approximately **59.17% (2P), 42.67% (3P), 32.04% (4P)** against 50%, 33.33%, 25% neutral shares, with zero capped best-strategy games at 3,000 rounds. Under **random** category choice, its 4-player games had **260/2,400** unfinished at the 3,000-round cap. Those numbers describe the original Pokémon decks and **different engine implementations**, not direct statistical baselines for the new themed packs. Compare direction and *excess over neutral* rather than asserting the same target outcome. A different category score distribution, restricted first 50 manifests and bot policy can change chooser advantage and duration.

## Numerical results and release blockers

**Initial CI outcome awaiting execution.** After GitHub tests finish, insert the measured roster dominance and category tie rates, manifest strength shifts, seeded 2/3/4 match outcomes, capped rates, first chooser and seat splits, longest matches, high-severity card counts and the exact CI links. Do not promote these 560 provisional cards on the basis of source-level checks alone.

**Release verdict: NOT APPROVED** until a human editorial pass reviews all 560 CSV/JSON rows, severity flags and named classifications; simulations demonstrate appropriate fairness using adequate independent seeds; product owners decide what constitutes unacceptable first chooser advantage, excessive round length or a fair tie mechanic; theme-server integration is tested with concealed decks against an approved isolated database; and each relevant character/trademark/person-likeness right is cleared. No production resource has been accessed or changed.
