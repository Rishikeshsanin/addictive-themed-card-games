# DeckVerse — deployment and integration runbook

## Verified as of 2026-10-20
- Dedicated GitHub repository and Vercel project created.
- 200 Pokémon reference records are included. The 50-card 2P, 60-card planned 3P, and 80-card planned 4P deck manifests are static and nested. Only two-player engine implemented.
- The 50-card 2P gameplay balance has been optimized and validated using all 1,225 card pairs × 8 categories; this does **not** predict 1v1 match win probability or prove UX quality.
- JavaScript syntax checks, Node engine tests, and Chromium mobile/desktop local-source smoke tests were executed in GitHub Actions.
- Project Hub app #16: `deckverse`, schema `deckverse`; tables `deckverse.rooms` and `deckverse.players` with RLS. Initial security advisor had zero DeckVerse findings.
- Role `deckverse_app` has LOGIN enabled and is restricted to DeckVerse's own tables. Vercel's `DECKVERSE_DATABASE_URL` is configured as a sensitive production variable. **Online rooms are connected and tested.**
- Host-configurable card reveals, server-enforced manual acknowledgements and Mumbai Vercel serverless functions deployed. Chrome desktop/mobile tests and real two-mobile-browser rooms passed in GitHub Actions run 39384472880.
- LiveKit credentials are configured. Two independent Chrome sessions have connected to LiveKit Cloud with synthetic microphone/camera media; physical-phone field testing remains pending.

## Dedicated database connection — configured and verified

- The production DeckVerse database connection is **already established**. A live health check returns `{"status":"ready","app":"deckverse"}`.
- The environment variable belongs only to the new DeckVerse Vercel project and uses the dedicated `deckverse_app` PostgreSQL login.
- **Do not rotate the password or add another variable unless connection diagnostics justify it.** Never publish its value or commit it to Git.
- Project Hub's other applications remain out of scope. Avoid all changes outside the `deckverse` schema.
- Run after deploying: `https://addictive-themed-card-games.vercel.app/api/game?health=1`.

## LiveKit calling — configured, field QA pending
The DeckVerse Vercel project has the following server-only variables configured:
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`

Do not expose the last two values to frontend code or commits. Token endpoint `/api/livekit-token` verifies the app-scoped database role and active remote-room membership, only then issues a short-lived room-specific token. Synthetic two-browser media has passed; real iPhone/Android permission, autoplay, backgrounding and network-loss tests remain required.

## Supabase safety contract
Always read `hub.read_me_first` and the repository's `AGENTS.md` and `SUPABASE_HUB_RULES.md` before database activity. All schema names must remain `deckverse.*`. No shared service-role/database role keys in app, no public tables, and no unrelated-app mutations. Run the Supabase security advisor after meaningful DeckVerse DDL.

## Release gate
1. CI green on deployed commit, including local Chrome desktop/mobile and remote two-mobile-browser smoke — **verified in automated CI**.
2. Distinct-browser room code, join, ready, play, both-card reveal and manual continue — **verified in CI**. Physical mobile phones, ties, endgame and rematch still need dedicated field QA.
3. Verify no player can inspect the other player's future deck or manipulate another player's turn.
4. Verify microphone/video and fail-gracefully behavior on physical iPhone and Android devices; synthetic Chrome media is already verified.
5. Measure first-chooser match advantage, match-length tails and device performance with finalized card data.
6. Resolve Pokémon imagery/names intellectual-property licensing before unrestricted commercial launch.
7. Verify Vercel deployment protection doesn't prevent intended public access.

Nothing else should be reported production-ready until these items are green.


## V1.2 — in-match host settings and LiveKit integration

- The **host** can open **Reveal Settings** from the battle header and choose Manual or Automatic 2/3/5/8 seconds, both before and during a game.
- The policy for an already revealed round is snapshotted in authoritative game state. Host changes apply to the **next** round only, so neither player can prematurely hide or skip cards.
- Only the host may update settings. Other players cannot call the `settings` API successfully.
- DeckVerse uses a lazy-loaded LiveKit client with microphone-only opt-in, optional video, local thumbnail, remote video, mute/unmute, supported camera switching, minimize, and reconnection status. Calling is independent from card gameplay.
- Token issuance checks the private DeckVerse room, active membership, `remote` room type and active match. It returns a token restricted to `deckverse-<room_uuid>`; no LiveKit key is sent to the browser.
- `GET /api/livekit-token` returns only `{"configured": true/false}` (never credentials) so the UI can explain missing LiveKit setup.

**Still required for field readiness:** open a Remote Room on physical iPhone and Android devices, start the match, join voice, permit microphone, and separately try optional cameras. Test denied permissions, disconnect, reconnect, backgrounding and mobile browser autoplay rules. Rotate the previously exposed LiveKit key as a separate credential-maintenance task; do not place its value in issues, documentation, chat, or commits.

**Verification boundary:** automated tests prove a real LiveKit Cloud connection with synthetic Chrome media, not physical-device behavior or hostile-network recovery.
