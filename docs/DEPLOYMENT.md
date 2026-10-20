# DeckVerse — deployment and integration runbook

## Verified as of 2026-10-20
- Dedicated GitHub repository and Vercel project created.
- 200 Pokémon reference records are included. The 50-card 2P, 60-card planned 3P, and 80-card planned 4P deck manifests are static and nested. Only two-player engine implemented.
- The 50-card 2P gameplay balance has been optimized and validated using all 1,225 card pairs × 8 categories; this does **not** predict 1v1 match win probability or prove UX quality.
- JavaScript syntax checks, Node engine tests, and Chromium mobile/desktop local-source smoke tests were executed in GitHub Actions.
- Project Hub app #16: `deckverse`, schema `deckverse`; tables `deckverse.rooms` and `deckverse.players` with RLS. Initial security advisor had zero DeckVerse findings.
- Role `deckverse_app` has LOGIN enabled and is restricted to DeckVerse's own tables. Vercel's `DECKVERSE_DATABASE_URL` is configured as a sensitive production variable. **Online rooms are connected and tested.**
- Host-configurable card reveals, server-enforced manual acknowledgements and Mumbai Vercel serverless functions deployed. Chrome desktop/mobile tests and real two-mobile-browser rooms passed in GitHub Actions run 39384472880.
- No LiveKit credentials configured. **Remote voice/video is not connected yet.**

## Dedicated database connection — configured and verified

- The production DeckVerse database connection is **already established**. A live health check returns `{"status":"ready","app":"deckverse"}`.
- The environment variable belongs only to the new DeckVerse Vercel project and uses the dedicated `deckverse_app` PostgreSQL login.
- **Do not rotate the password or add another variable unless connection diagnostics justify it.** Never publish its value or commit it to Git.
- Project Hub's other applications remain out of scope. Avoid all changes outside the `deckverse` schema.
- Run after deploying: `https://addictive-themed-card-games.vercel.app/api/game?health=1`.

## LiveKit calling — setup needed
Create or designate a LiveKit environment specifically authorized for DeckVerse. In the **new DeckVerse Vercel project**, configure:
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Do not expose the last two values to frontend code or commits. Token endpoint `/api/livekit-token` verifies the app-scoped database role and active remote-room membership, only then issues a short-lived room-specific token. Calling must be independently tested from two phones and microphone/camera-denial flows.

## Supabase safety contract
Always read `hub.read_me_first` and the repository's `AGENTS.md` and `SUPABASE_HUB_RULES.md` before database activity. All schema names must remain `deckverse.*`. No shared service-role/database role keys in app, no public tables, and no unrelated-app mutations. Run the Supabase security advisor after meaningful DeckVerse DDL.

## Release gate
1. CI green on deployed commit, including local Chrome desktop/mobile and remote two-mobile-browser smoke — **verified in automated CI**.
2. Distinct-browser room code, join, ready, play, both-card reveal and manual continue — **verified in CI**. Physical mobile phones, ties, endgame and rematch still need dedicated field QA.
3. Verify no player can inspect the other player's future deck or manipulate another player's turn.
4. Verify real microphone/video connection and fail-gracefully behavior.
5. Measure first-chooser match advantage, match-length tails and device performance with finalized card data.
6. Resolve Pokémon imagery/names intellectual-property licensing before unrestricted commercial launch.
7. Verify Vercel deployment protection doesn't prevent intended public access.

Nothing else should be reported production-ready until these items are green.
