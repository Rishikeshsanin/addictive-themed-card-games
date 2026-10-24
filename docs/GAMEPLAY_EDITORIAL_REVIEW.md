# Gameplay VNext — targeted editorial sanity pass

This is **subjective game design**, not an official ranking, canon power scale or researched sports dataset. The product priority is understandable strengths/weaknesses and useful countercategories—not rewriting all 960 cards.

## Changes
- One Piece: classify Bartolomeo/Cavendish as Straw Hat Grand Fleet members, Kin'emon as a Wano ally and Oden as a Wano legend. These are **presentation/role overrides applied after roster interleaving**; card IDs, deck order, and 50/60/80 manifests are preserved.
- One Piece: add hand-reviewed gameplay profiles for those characters and Katakuri. Shanks and Mihawk are ahead of Katakuri in the resulting sum-based editorial Rank, while Devil Fruit and swordplay remain character-specific.
- Football: Mary Earps and Christiane Endler are goalkeeper specialists. The existing *Defending* axis explicitly includes shot-stopping, retaining eight total stats rather than inventing an incompatible ninth category.
- Wizarding: Dumbledore remains exceptionally strong at Magic but no longer dominates almost every category. Snape's potions and Harry's courage remain credible countercategories. Filch's already-low Magic score was correct and unchanged.
- No other characters are changed. No changes to Pokémon, engine rules, Vercel, LiveKit, Supabase, database migrations or protected stable branch.

## Verification
- Run `npm test` for the editorial regression and deterministic match invariants.
- Run `node --test tests/vnext-balance-audit.test.js` for 648 seeded Quick Clash self-play cases (12 packs × 3 player counts × 3 uniform bot difficulty levels × 6 seeds), reporting all-seven-stat dominance, round percentiles, jackpot ties and category picks.
- This deterministic strategy study is only a **diagnostic**. It is not a human win-rate estimate, a professional playtest, or proof of perfectly fair matchups. Match depth, first-chooser bias, pacing and player enjoyment require larger and varied experiments.

## Source checks
- Straw Hat Grand Fleet: https://onepiece.fandom.com/wiki/Straw_Hat_Grand_Fleet
- Wano alliance: https://one-piece.com/story/land_of_wano2/index.html
- Filch is a Squib: https://www.harrypotter.com/fact-file/characters-and-pets/argus-filch

## Remaining design work
- Prioritise the highest-impact incorrect roles/abilities in other themes, then compare category usefulness and first-chooser advantage against the baseline.
- Finish phone playtesting and editorial review before treating content as release quality.
- Preserve Classic, all theme identities, and old GitHub/Vercel source snapshots. This draft PR cannot merge without owner approval.
