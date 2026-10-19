# DeckVerse — deployment and integration runbook

## Verified as of 2026-10-20
- Dedicated GitHub repository and Vercel project created.
- 200 Pokémon reference records are included. The 50-card 2P, 60-card planned 3P, and 80-card planned 4P deck manifests are static and nested. Only two-player engine implemented.
- The 50-card 2P gameplay balance has been optimized and validated using all 1,225 card pairs × 8 categories; this does **not** predict 1v1 match win probability or prove UX quality.
- JavaScript syntax checks, Node engine tests, and Chromium mobile/desktop local-source smoke tests were executed in GitHub Actions.
- Project Hub app #16: `deckverse`, schema `deckverse`; tables `deckverse.rooms` and `deckverse.players` with RLS. Initial security advisor had zero DeckVerse findings.
- Role `deckverse_app` exists with **NOLOGIN** and is restricted to only the two tables (RLS policies defined). **Online rooms are not connected yet.**
- No LiveKit credentials configured. **Remote voice/video is not connected yet.**

## Dedicated database credential — setup needed
Project Hub owner must use **Supabase SQL Editor**, for the existing Project Hub only, and execute only this role-specific command after replacing placeholder with a strong randomly generated unique password, not stored in this repository:

```sql
ALTER ROLE deckverse_app WITH LOGIN PASSWORD '<YOUR_LONG_RANDOM_UNIQUE_PASSWORD>';
```

This intentionally changes only the already-created DeckVerse app's PostgreSQL role, not database-wide keys or other app roles.
Then go to the **new DeckVerse Vercel project** (not Imposter X, BlindRank or any other app), Settings > Environment Variables, and add `DECKVERSE_DATABASE_URL` using the connection string from the Project Hub **Connect** menu. Select the **dedicated role** `deckverse_app`, use the host/port exactly displayed for transaction or session pooler and the generated password; do not use `postgres`, `service_role`, `supabase_admin` or shared credentials. Vercel environment type must be Sensitive/Encrypted and server-only; set production and preview as appropriate, then redeploy.

The isolated Vercel API endpoint `/api/game/health` must return `{"status":"ready","app":"deckverse"}` before testing friend-to-friend room create, join and play. If it returns `setup_required`, stop and troubleshoot connectivity without widening permissions.

## LiveKit calling — setup needed
Create or designate a LiveKit environment specifically authorized for DeckVerse. In the **new DeckVerse Vercel project**, configure:
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Do not expose the last two values to frontend code or commits. Token endpoint `/api/livekit-token` verifies the app-scoped database role and active remote-room membership, only then issues a short-lived room-specific token. Calling must be independently tested from two phones and microphone/camera-denial flows.

## Supabase safety contract
Always read `hub.read_me_first` and the repository's `AGENTS.md` and `SUPABASE_HUB_RULES.md` before database activity. All schema names must remain `deckverse.*`. No shared service-role/database role keys in app, no public tables, and no unrelated-app mutations. Run the Supabase security advisor after meaningful DeckVerse DDL.

## Release gate
1. CI green on the deployed commit, including Chrome desktop/mobile smoke.
2. On 2 distinct browsers/phones verify rooms, code invites, ready, play, ties, winning, rematch.
3. Verify no player can inspect the other player's future deck or manipulate another player's turn.
4. Verify real microphone/video connection and fail-gracefully behavior.
5. Measure first-chooser match advantage, match-length tails and device performance with finalized card data.
6. Resolve Pokémon imagery/names intellectual-property licensing before unrestricted commercial launch.
7. Verify Vercel deployment protection doesn't prevent intended public access.

Nothing else should be reported production-ready until these items are green.
