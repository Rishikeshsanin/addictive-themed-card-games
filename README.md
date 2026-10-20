# ✦ DeckVerse — Addictive Themed Card Games

**Old-school rivalry. New-school magic.**

[Play DeckVerse (public beta)](https://addictive-themed-card-games.vercel.app) · [Passing CI tests](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions)

A gorgeous, mobile-first nostalgic trump-card game with themed cards. The homepage displays a Pokémon nostalgia deck plus future theme placeholders; only the Pokémon-inspired theme is playable at this stage. Room modes are Same Room and Remote Room, with optional, now-connected LiveKit voice and video in Remote Rooms.

## V1.2 status — verified 2026-10-20

| Component | Status |
| --- | --- |
| Hero and theme selection (3 theme tiles) | Implemented |
| Responsive 50-card solo-practice battle | Implemented; automated Chrome desktop/mobile smoke passed |
| 2-player rules, Rank lower, other stats higher, pot and second-tie chooser rotation | Implemented, automated tests |
| Reference Pokémon catalog | 200 entries; 80 cards have tuned game values |
| Curated deck manifests | 50 for 2, 60 for 3, 80 for 4 |
| 2-player online rooms and room API | **Connected and verified:** 2 independent production mobile browsers + API integration tests |
| App database schema | Isolated `deckverse` Project Hub app #16, RLS enabled; security advisor reports no DeckVerse findings |
| Optional LiveKit voice/video | **Connected:** two independent Chrome sessions joined, toggled microphone, published camera and subscribed to remote video (fake test devices; physical phones still pending) |
| 3-player / 4-player actual game engine | Planned, not implemented |
| Rights to publicly distribute Pokémon content | Not secured; fan-demo concept only |

**Verified beta:** Online 1v1, lobby updates and round reveals passed API and dual-mobile-browser automation. Real physical-device voice/video and network testing, reconnect/rematch hardening, and franchise licensing are not yet complete; see [deployment runbook](docs/DEPLOYMENT.md).

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
- Core rule tests, Chrome desktop/mobile practice, production API room flow, and two separate mobile-browser sessions run in CI. Production test metrics (one GitHub runner): create 302 ms, join 296 ms, ready 275 ms. The other player's visible lobby state updates via ~550ms polling; mobile latency varies by connection.

## V1.1 reveal options and lobby performance

- Both the winner and loser see the **same two played Pokémon cards** and the correct local-player-first stat comparison.
- During the reveal, both cards remain face-up and the next category is locked server-side.
- The room host chooses **Auto 2 seconds (default), 3, 5, 8 seconds** or **Manual** before starting the match.
- Manual mode requires **both players** to press Continue; a 90-second fallback prevents permanent deadlocks if someone disconnects.
- The Next Round power passes to the winner (or according to the consecutive-tie rule); no new top card may be played until the reveal closes.
- Optimistic ready-state feedback, 550ms lobby polling and Mumbai Vercel serverless deployment were introduced. These are improvements, not a claim of zero latency.
- The game's original eight categories, 50-card deck and balance data are unchanged.

## Latest LiveKit verification

- CI [run 39390420383 (attempt 2)](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39390420383) passed after updating the existing DeckVerse-only sensitive Vercel variables. No new LiveKit project or key was created.
- Two separate Chrome browsers joined a real DeckVerse LiveKit Cloud room using fake microphone/camera devices; mic mute/unmute, remote video subscription and leaving without affecting gameplay passed.
- Actual physical phone cameras/microphones, intermittent connectivity and reconnection under network loss remain unverified.
- The current LiveKit key was exposed in a chat screenshot: **rotate when practical**; until then limit usage, keep it server-only and never repeat it in docs or commits.

## Next prioritized features

1. **LiveKit device hardening:** test physical iPhone/Android devices, microphone/camera permission denial, reconnect, mobile autoplay and audio-only fallback; automated two-browser synthetic-media connection is verified.
2. **Real-time lobby:** replace polling with secure Realtime notifications or an app-scoped push stream and retain polling as fallback; test latency under load.
3. **Rematch & presence:** a proper rematch in the same room, app-background recovery, fair host transfer and presence timeout rules.
4. **Battle polish:** synchronized card-slide/audio/haptics, replay or battle history, accessible countdown animations.
5. **Configurable gameplay:** host can already change *future-round* reveal settings during play; add an optional decision timer and polish the settings UI.
6. **Three/four-player mode:** implement the actual 60/80-card authoritative engine and multiway ties after re-balancing those decks; manifests alone do not implement multiplayer.
7. **IP/commercial launch:** obtain permissions or replace trademarked images/names with licensed original content before unrestricted commercial distribution.

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
