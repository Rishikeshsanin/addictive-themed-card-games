# ✦ DeckVerse — Addictive Themed Card Games

**Old-school rivalry. New-school magic.**

[Play DeckVerse (public beta)](https://addictive-themed-card-games.vercel.app) · [Passing CI tests](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions)

A gorgeous, mobile-first nostalgic trump-card game with themed cards. The homepage displays a Pokémon nostalgia deck plus future theme placeholders; only the Pokémon-inspired theme is playable at this stage. Room modes are Same Room and Remote Room, with optional LiveKit voice and video after server credentials are configured.

## V1 status — accurate, as of 2026-10-20

| Component | Status |
| --- | --- |
| Hero and theme selection (3 theme tiles) | Implemented |
| Responsive 50-card solo-practice battle | Implemented; automated Chrome desktop/mobile smoke passed |
| 2-player rules, Rank lower, other stats higher, pot and second-tie chooser rotation | Implemented, automated tests |
| Reference Pokémon catalog | 200 entries; 80 cards have tuned game values |
| Curated deck manifests | 50 for 2, 60 for 3, 80 for 4 |
| 2-player online rooms and room API | Implemented but **not connected**: dedicated database role still NOLOGIN |
| App database schema | Isolated `deckverse` inside existing Supabase Project Hub app #16, RLS enabled |
| Optional LiveKit voice/video | Integration implemented but **not connected**: DeckVerse-specific credentials missing |
| 3-player / 4-player actual game engine | Planned, not implemented |
| Rights to publicly distribute Pokémon content | Not secured; fan-demo concept only |

**Do not call this production-complete yet.** The online multiplayer and calling features have never been verified end-to-end against real two-phone users; see [deployment runbook](docs/DEPLOYMENT.md).

## Rules

1. Shuffle a **fixed 50-card deck**, deal 25 face-down to each player, and randomly choose the first category caller.
2. Both players see only their own top card. The category caller can choose **Rank** (lower wins), **Height, Weight, Attack, Defense, Speed, Energy Protection, HP** (higher wins).
3. A decisive winner takes both drawn cards to the bottom of their own deck and receives category-selection power for the next round.
4. On a **tie**, put both drawn cards aside in a central jackpot; first consecutive tie retains chooser, second consecutive tie changes chooser, third retains, fourth changes, etc. A decisive winner gets the jackpot.
5. A unique Rank sudden-death comparison resolves the final tied pair if either player's deck is exhausted in a tie.
6. Win by collecting every card. No power-ups or paid unfair advantage.

## Balance and diagnostics

- Reference values from [veekun Pokédex CSV](https://github.com/veekun/pokedex). `src/catalog.js` keeps true reference height/weight and base stats separate from **made-for-this-game** comparisons.
- **50-card active set** comparison-balance objective: each card's overall per-category win score near 50%, no 8-category total domination; automated tests enforce bounds.
- Fixed 60/80-card subset manifests are prepared for future multiplayer, but the final balance process for 3–4 players is **not complete**.
- Seeded 2,000-match gameplay simulation (`npm run simulate`) with global-best-percentile chooser: 2,000 finished, no stalled games, median 55 rounds, p90 149 rounds, first chooser match win 59.4%. Heuristic simulation, not a human-play predictor.
- Core rule tests and actual Chrome desktop/mobile practice smoke run in CI.

## Run locally

```bash
npm install
npm run dev
npm test
npm run balance
npm run simulate
```

The basic static practice client runs without backend credentials; the two online room buttons are automatically disabled if `GET /api/game?health=1` does not report a ready isolated DB. To run serverless endpoints locally, use an appropriate Vercel development environment with app-only secrets.

## Runtime architecture

- Vanilla ES modules, accessible mobile-first HTML/CSS, PWA.
- Node Vercel serverless game API, row-locked PostgreSQL transactions, private player sessions and strict card-count validation.
- **Supabase Project Hub** project `nowlwprtcnieihelqjoa`, app #16, schema `deckverse`, with **zero cross-project database mutations**.
- LiveKit browser client plus a separate server-only token endpoint, room-scoped credentials and remote-room membership verification.
- Never expose any DB credential, LiveKit key or service-role/admin key to a browser or GitHub.

See [AGENTS.md](AGENTS.md), [SUPABASE_HUB_RULES.md](SUPABASE_HUB_RULES.md), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), and [.env.example](.env.example).

## Intellectual property

Pokémon franchise character names, designs and images belong to their respective owners. This is an independent prototype **not affiliated with, endorsed or licensed by Pokémon**. For any unrestricted public/commercial release, get the appropriate permission or substitute original/cleared characters and artwork. Planned Avengers, Shinchan and other theme names are not authorization to use their IP.
