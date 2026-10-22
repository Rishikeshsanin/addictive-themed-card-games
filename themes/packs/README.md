# DeckVerse Theme Packs — isolated prototype

## Current status
**Experimental development only.** These twelve theme packs live under `themes/packs/`, and are intentionally isolated from deployed Pokémon and DeckVerse V2 backend code. Their URL when this branch is hosted by a static server is `/themes/packs/`. Do not infer a public Vercel preview deployment.

| Theme | Unique inventory | Deck modes | Theme-specific comparisons |
| --- | ---: | --- | --- |
| Avengers Saga | 80 heroes, allies and villains | 50 / 60 / 80 | Rank, strength, combat, defense, speed, intellect, energy, endurance |
| Ben 10 Alien Clash | 80 aliens, heroes and enemies | 50 / 60 / 80 | Rank, strength, speed, durability, intellect, tech, versatility, energy |
| Shin-chan Chaos | 20 named characters × 4 original imagined situations | 50 / 60 / 80 | Rank, mischief, comedy, courage, imagination, friendship, speed, luck |
| DC Legends | 80 superheroes, allies and villains | 50 / 60 / 80 | Rank, strength, combat, defense, speed, intellect, energy, endurance |
| Naruto Shinobi Clash | 80 ninjas, beasts and legends | 50 / 60 / 80 | Rank, chakra, taijutsu, ninjutsu, genjutsu, speed, strategy, endurance |
| Cricket Legends | 80 international men's and women's players | 50 / 60 / 80 | Rank, batting, bowling, fielding, leadership, clutch, consistency, athleticism |
| Elemental Realms | 80 original fantasy creatures | 50 / 60 / 80 | Rank, might, agility, defense, magic, wisdom, stamina, versatility |

**Important:** The 2-player deck is 50 cards (25 each). The 3-player deck is 60 cards (20 each). The 4-player deck is 80 cards (20 each). Roster manifests are deterministic. Actual deals are securely shuffled. These modes are **solo practice against non-omniscient bots**, NOT multiplayer rooms. The existing Pokémon game stays exactly as it was in the branch baseline.

## What makes the categories meaningful?
- Every pack has exactly eight documented categories. Rank has *lower wins* semantics; the other twelve are *higher wins*.
- Popular or recognizably extreme character strengths have explicitly reviewed **example editorial** scores (e.g., Grey Matter intellect, XLR8 speed, Hulk strength, Batman intellect, Rock Lee taijutsu). Avengers' first 50 hand-edited profiles from the prior prototype are reused where names match.
- Remaining ratings are deterministic, scenario-tuned **draft game design values**, calculated from broad roles with explicit strengths/weaknesses to keep the prototype internally consistent. These **are not official factual measurements**, and still require character-by-character editorial review, fairness simulations, and licensing before release.
- Cricket numerical values are neither official career batting averages/wickets nor guaranteed lifetime rankings. All roles and names need editorial review, including player availability and name spelling.
- Shin-chan 80-card support uses invented **situations** rather than 80 distinct canonical characters; no claim is made that these are authentic TV episodes.
- Original fantasy deck avoids third-party character art/identity rights, but names and art still need originality/trademark review.

## Usage
```bash
npm install
python3 -m http.server 4173
# http://localhost:4173/themes/packs/
node --test tests/theme-packs.test.js
node themes/packs/qa/browser-smoke.mjs
```
Browser test requires installed Chrome; set `CHROME_PATH` as needed.

## Release integration architecture — deliberately NOT wired yet
1. Finish the isolated DeckVerse V2 hardening work and approve 004/005/006 only after backup, migration lock window, Hub resource registration and safety gates.
2. Define a server-side **theme manifest allowlist**, with an explicit `theme_id` column in the DeckVerse-only rooms schema (review a separate 007 migration). All theme associations are stored on the server and immutable for a match, including rematches.
3. Server should select `pack.decks[playerCount]`, validate the 50/60/80 manifest, choose an initial caller securely, compute turns using only server-side theme card stats, and sign snapshots with the persisted theme ID. Never trust client-supplied stats, deck order, rank, or theme changes on an existing room.
4. Promote a theme only after editorial reviews, fairness simulations for 2/3/4-player strategies, actual DB-backed HTTP tests, physical mobile QA and artwork-rights approval.
5. Add theme selection tiles to the main homepage after review and after the multiplayer UI agents are finished. Avoid independently modifying their shared files while work is underway.
6. Existing historic Pokémon sessions remain in a backwards-compatible mode; no global replacement of the original Pokémon catalog.
7. The stat engine in this prototype is a local demonstrator; the server integration must reuse the hardened authoritative V2 transactions and hidden-card guarantees, not send full deck state to browser clients.

## IP / commercial restrictions
Marvel/Avengers, Ben 10, DC, Naruto and Shin-chan characters and universes have third-party copyrights/trademarks; athlete names and likenesses also carry publicity and licensing considerations. This prototype embeds **no official character photography or logos**, uses only symbols/color motifs, and does not prove permission to publicly distribute character-branded content. Obtain permission or switch to entirely original packs before unrestricted commercial use.

## Acceptance
- 12 × 80 unique card identities across the twelve local packs; 50/60/80 valid manifests
- exactly 8 theme-specific stats, rank as only low-wins
- secure shuffle, hidden bot deck pre-reveal, strict card conservation, tie/jackpot/sudden death
- real Chrome mobile 320 / 390 and tablet 768 / desktop viewport test
- no changes to `api/game.js`, Supabase, Vercel, LiveKit, production Pokémon game, or other projects

**NOT verified:** licensed imagery, physical devices, true multiplayer rooms, production load, canonical character-to-character fairness, actual cricket performance figures. Keep PR draft.

## Wave 2 — Five more solo packs (October 2026)

- `dragonball` — Dragon Ball Power Clash (Saiyans, Z Fighters, gods, classic rivals).
- `onepiece` — One Piece Grand Line Clash (pirates, Navy, Revolutionaries and foes).
- `wwe` — WWE Wrestling Icons (classic and modern wrestling legends).
- `football` — Football Legends (men's and women's stars, historical and contemporary).
- `wizarding` — Wizarding Duels (Hogwarts, Order, Dark Arts, magical-world figures).

Each has 80 explicitly named collectible cards, exactly eight stat axes (Rank is lower-wins), 50/60/80-card deck manifests and local two-, three-, four-player bot matches. Ratings are editorial gameplay decisions, **not official franchise statistics or objective sporting measures**. No trademark logos, character likeness images, league badges or actor photographs are added for these new packs.

Solo practice only. The original Pokémon online multiplayer remains unchanged. New themes do not get online rooms until a separately approved database migration and additional API work. No release rights for third-party franchises or player likenesses are asserted.
