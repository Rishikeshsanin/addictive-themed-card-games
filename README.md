# DECKVERSE — Addictive Themed Card Games

Mobile-first nostalgia-inspired trump-card battles. Two players, fifty cards, eight original comparison categories, same-room and remote rooms, with optional LiveKit calling.

## Status
Build underway. Do not assume the live demo is production-ready until multiplayer, balance, security and mobile acceptance tests pass.

## Rules
1. Shuffle a 50-card curated pack and deal 25 to each player.
2. Random first chooser. Both players see only their own top card.
3. Chooser selects one of Rank (lower wins), Height, Weight, Attack, Defense, Speed, Energy Protection, HP (other seven higher win).
4. Decisive winner collects their current card, the opponent's current card, and any tied-card pot at the bottom of their own queue. Winner becomes chooser.
5. Consecutive ties put both cards into a pot. The chooser retains power on the first tie, and flips on every second successive tie (ties 2,4,6...). A decisive round awards the pot.
6. Last unresolved tied cards when a player runs out are adjudicated by unique Rank as a deterministic sudden death.
7. Win by acquiring all cards.

## Data
200 character reference records: original first-generation 151 + 49 selected favourites. Reference height and weight are sourced from veekun/Pokédex; adjusted game stats must be clearly labelled as game-tuned. Deck manifests are versioned and fixed: 2 players/50, future 3/60 and 4/80.

## Architecture
- Vanilla JavaScript ES modules, responsive HTML/CSS, installable PWA.
- Server-authoritative /api/game endpoints with an app-scoped PostgreSQL login in the existing Supabase Project Hub `deckverse` schema.
- Vercel deployment and server-only LiveKit token endpoint.
- No modification of other projects or shared admin credentials.

## IP
Pokémon characters, names and artwork are owned by their rights holders. This independent fan tribute is not endorsed. For public/commercial distribution, obtain permission or replace with original licensed content.

## Setup
When repository files are present: `npm install`, `npm run dev`, `npm test`.
Configure only **new-project-specific** secrets; never commit credentials.

See `AGENTS.md` and `SUPABASE_HUB_RULES.md` before any database operation.
