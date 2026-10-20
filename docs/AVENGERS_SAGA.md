# DeckVerse — Avengers Saga theme (isolated design + playable solo concept)

## Scope and status
- Branch: `feature/avengers-saga-theme` (based on the merged-into-V2 **development branch state**, not released main).
- Standalone entry: `/themes/avengers/` (or `themes/avengers/index.html` under a static server). This is **not yet linked from the main landing page**; the multiplayer agent currently owns shared `index.html`, `src/app.js` and `styles.css`.
- Implementation: 50 distinct characters, complete catalog / search / faction filters / stat explanations, private character inspector, mobile-first art direction, 2-player **SOLO PRACTICE** against a stat-selecting AI, 8 comparisons, collection and pot/tie rules. There is no Avengers PvP API or 3/4-player server rollout yet.
- No Marvel promotional photos, official Marvel logos, costume/actor likenesses, or artwork downloads. Card illustrations are CSS-generated abstract symbols. The concept is not endorsed by Marvel.
- **Do not merge and deploy a Marvel-branded public/commercial version without evaluating franchise character names, images, trademarks, and any necessary licenses.** This is development content, not legal clearance.

## Continuity and content principles
Choose one primarily **MCU screen-inspired** power frame rather than silently mixing comics, movies, alternate timelines and cosmic artifacts. In this scenario:
- Thanos does **not** wield the complete Infinity Gauntlet.
- Ronan does **not** wield a Power Stone.
- Ultron uses one strong synthetic body (not every body in an infinite swarm).
- Thor is a late-Infinity-Saga storm-wielding fighter; this does not claim every film's depiction has identical strength.
- Wanda has chaos magic; Doctor Strange uses ordinary sorcery, **not unrestricted Time Stone rewinds**.
- Spider-Man uses his general enhanced abilities; equipment and suits are described narratively but game values are not measured feats.
- Hulk includes Bruce Banner's intellectual ability; do not treat him as purely unintelligent.
- Mysterio's high energy category is **technology-powered illusions**, not actual magic.
- The setting includes allies and villains, not just people who have officially served on the Avengers roster. Do not describe every ally as an Avengers member.

Marvel official background research: [Avengers team overview](https://www.marvel.com/teams-and-groups/avengers/in-comics), [Infinity War character listing](https://www.marvel.com/movies/avengers-infinity-war), [Thanos profile](https://www.marvel.com/characters/Thanos), [Doctor Strange on screen](https://www.marvel.com/characters/doctor-strange-stephen-strange/on-screen).

## 50 playable characters
**Avengers (14):** Iron Man, Captain America (Steve Rogers), Thor, Hulk, Black Widow, Hawkeye, Scarlet Witch, Vision, War Machine, Falcon (Sam Wilson), Black Panther (T'Challa), Ant-Man (Scott Lang), Wasp (Hope van Dyne), Captain Marvel (Carol Danvers).

**Allied heroes (12):** Winter Soldier, Shuri, Okoye, Spider-Man, Doctor Strange, Wong, Quicksilver, Nick Fury, Valkyrie, Shang-Chi, She-Hulk, Kate Bishop.

**Guardians (10):** Star-Lord, Gamora, Drax, Rocket, Groot, Nebula, Mantis, Yondu, Adam Warlock, Kraglin.

**Opposition (14):** Thanos, Loki, Ultron, Hela, Killmonger, Ronan, Ebony Maw, Proxima Midnight, Corvus Glaive, Cull Obsidian, Red Skull, Taskmaster, Vulture, Mysterio.

Each entry is a **single character**, not repeated "Armor Mark 1," "God Thor," or alternate Iron Man variants added merely to pad the deck.

## Category design and limits
The original two-player Top Trumps gameplay rules remain unchanged. Avengers-specific category mapping:
| Key | Display | Winner | Narrative interpretation |
| --- | --- | --- | --- |
| rank | RANK | **lowest** | A distinct, subjective one-to-fifty game rank; tie-breaker, not Marvel's canonical ranking |
| strength | STRENGTH | highest | Physical might |
| combat | COMBAT | highest | Direct fight training, technique and precision |
| defense | DEFENSE | highest | Armor, wards and attack resistance |
| speed | SPEED | highest | Reaction and movement, including flight |
| intellect | INTELLECT | highest | Strategy, inventiveness and science |
| energy | ENERGY | highest | Magical/cosmic/technological projection |
| endurance | ENDURANCE | highest | Battle stamina |

All scores are **hand-tuned 1–100 scenario ratings** for entertainment. They are not official on-screen numeric facts, measurements or definitive power-scaling claims. Even rank is subjective. Each card shows its strengths and a coherent weakness in the inspector.

## First-pass balance audit (subject to reruns in CI)
50 distinct card pairs: 1,225. Eight comparisons per pair: 9,800. Preliminary deterministic matrix finds **89 pairs** where the stronger card dominates all eight categories (about 7.3%). The wide power gap is lore-plausible but may cause poor match variety. This first pass favors recognizability and sensible power relationships over verified competitive fairness.

**Do not declare the Avengers deck "balanced" or "ready for ranked games."** The dedicated fairness agent must examine PvP chooser advantage, character comparison rates, tie frequency, and whether a single power-rich deck slot is too influential. Recommended evaluation of countermeasures:
1. Offer a casual lore-accurate **Cinematic** preset and, if desired, a separate **Competitive Draft** preset with redesigned game values; do not silently overwrite the original ratings.
2. Explore first-player alternation in rematches and no-rules-change fairness tactics.
3. Never introduce unequal decks, in-app purchases or hidden handicaps to fix a balance problem.

## Multiplayer integration contract (for coordinator, not this theme agent)
To add a themed room safely:
1. Introduce a theme identifier to room creation and the **DeckVerse-only** room schema in a separately reviewed migration. An Avengers room must stay Avengers for all players for its lifetime, including rematches.
2. Server chooses the theme-approved deck `50/25+25`; future 60/80 manifests need 10/30 more *reviewed and scored* characters, not duplicates.
3. Game engine/catalog/stat definitions must be selected server-side by the room's theme; a client-provided theme must never control comparisons on an existing room.
4. Snapshots, turn actions, reveal payload, server validation and reconnection must remain theme-scoped. Hidden decks must never leak.
5. Update the main theme tile and home page only **after** the multiplayer agent is finished and merge conflicts are reconciled. This branch intentionally does not edit those shared files.
6. Do not apply any schema migrations from this branch; there are none. Follow Project Hub `hub.read_me_first` and all AGENTS.md/Hub rules in the future.
7. The theme is *separate from and does not mutate* the existing Pokémon collection or other applications.

## Candidate expansion pool (30 for future 80-card roster, NOT PLAYABLE NOW)
Yelena Belova, Red Guardian, U.S. Agent, Ghost, Sentry, Ms. Marvel, Moon Knight, Daredevil, Punisher, America Chavez, Monica Rambeau, Namor, M'Baku, Riri Williams, Agatha Harkness, Echo, Joaquin Torres, Sersi, Ikaris, Makkari, Druig, Phastos, Gorr, Wenwu, Abomination, Baron Zemo, High Evolutionary, Ego, Kaecilius, The Leader.

These are candidates requiring canon/version/scoring review, especially multiverse variations and characters with extreme power gaps. Do not assume all are Avengers members or evenly powerful.

## Existing-test and UX acceptance gates
- Unit: 50 unique complete records, 8 stat directions, 25/25 deal, concealed future opponent card, proper tie pot, 2nd tie chooser switch, bottom-of-deck award, sudden-death rank and conservation.
- Chrome: viewports 320, 390, 768, 1440; full roster, faction filters, search, inspector, hidden bot card, decisive reveal, responsive overflow.
- Human review: legibility on actual iPhone/Android, reduced-motion, character recognizability using legally cleared art, comparison fairness, screen reader, brand naming/rights, full match UX.
- No true PvP or LiveKit test claimed for this independent solo prototype. Once integrated, reuse 2/3/4 QA gates and the real-phone matrix.
