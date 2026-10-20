# DeckVerse — eight-theme V2 controlled release handoff

> **Development candidate, NOT production approval.** Current protected production `main` is the original Pokémon build. This document deliberately does not contain or authorize live Hub writes, merges, production Vercel deployments or credentials.

## What is implemented

The following eight server-owned themes have real 2-, 3-, and 4-player HTTP multiplayer room, deck, game view and battle UI support:

| Theme ID | UI universe |
| --- | --- |
| `pokemon` | Pokémon (original classic, preserved) |
| `avengers` | Avengers Saga |
| `ben10` | Ben 10 Alien Clash |
| `shinchan` | Shin-chan Chaos |
| `dc` | DC Legends |
| `naruto` | Naruto Shinobi Clash |
| `cricket` | Cricket Legends |
| `fantasy` | Elemental Realms |

The host chooses the theme at creation. Guests inherit the room's immutable theme. The server owns card IDs, deck order, categories, stats, turn resolution and concealed state. Room sizes are 50 total unique cards / 2 players; 60 / 3; 80 / 4. Rank wins **lower**, other category scores **higher**. Per-room host transfer, disconnect/pause, rematch and legacy Pokémon compatibility have disposable database regressions. Same-room/remote and synthetic LiveKit regressions exist.

All seven new rosters and local Theme Lab remain available; original CSS symbols deliberately substitute for unlicensed imagery.

## Exact code integration lineage

- [PR #31](https://github.com/Rishikeshsanin/addictive-themed-card-games/pull/31): seven-theme prototypes plus V2 review branch.
- [PR #37](https://github.com/Rishikeshsanin/addictive-themed-card-games/pull/37): Round 4 migration 007, registry, fairness audit, Theme Lab and CI parity.
- [PR #38](https://github.com/Rishikeshsanin/addictive-themed-card-games/pull/38): initial server-owned theme HTTP integration.
- [PR #44](https://github.com/Rishikeshsanin/addictive-themed-card-games/pull/44): combined Round 5 backend security, eight-theme frontend, 560-card balance edits and 24-case API + 24-case UI-driven test suite. Five green workflows on head `43b8c5106ed2a37a4db20a303e075c05915e1b09`.
- [PR #46](https://github.com/Rishikeshsanin/addictive-themed-card-games/pull/46): **current eight-theme release candidate**; carries Round 5 and the independently reviewed extra disposable 004–007 parity / migration / mobile fixtures from alternative [PR #45](https://github.com/Rishikeshsanin/addictive-themed-card-games/pull/45). Keeps the tested Round 5 UI and server instead of overwriting it.
- Original main has **not** been merged or deployed by these integration PRs. This is a multi-PR stack; release manager must confirm the exact parent chain, compare main versus final commit, and merge/promote **only** a reviewed, verified consolidation (not blindly click Merge on #46).

### Automated test acceptance

For the earlier Round 5 exact head, GitHub Actions proved:
- 24/24 localhost HTTP scenarios on **all 8 themes × 2/3/4 seats** using disposable PostgreSQL, room creation, joining, server validation, security and rematches.
- 24/24 genuine **UI-click** Chromium scenarios for the same theme/player matrix: host deck selection, guest's server-controlled theme, ready/start, eight matching stat buttons, private top cards, real persisted turn.
- PostgreSQL 17.6 migrated 004–007 twice against fictional V1 rows; **546 assertions** including session/legacy preservation, host recovery and concurrency. Some terminal states were fixture-assisted, not natural full games.
- 156/156 Node tests, 0 failed/0 skipped; original synthetic LiveKit browser regression and earlier human device claims are *not* replaced by this.
- Additional old-schema / PG17 / mobile / rate-limit / theme QA lanes have been incorporated as release checks on PR #46. **Check the PR #46 exact head checks before signoff**, since workflow configurations and statuses may change.

**Do not label runtime as error-free or launch-ready solely because CI is green.** Genuine two-phone experience, latency, media permissions, Safari/Android and app-scoped database restore must still be verified.

## Only owner-authorized activities left before public release

### 1. Franchise and image rights decision (human)

- Obtain necessary permission for commercial/public use of recognizable Pokémon, Marvel/Avengers, DC, Naruto, Ben 10 and Shin-chan names, character representations and artwork, plus any athlete images or protected branding.
- **No assumption that CSS-only art eliminates name/character rights.** The original Pokémon artwork pulled from external PokeAPI sprite URLs also needs verification.
- If rights are unavailable, approve a legally reviewed original-character alternative or a private, legally permissible testing scope. This gate cannot be solved by coding alone.

### 2. Hub authorization and backup/restore (human-gated operational change)

Use ONLY the existing Supabase **Project Hub** `nowlwprtcnieihelqjoa`, existing `deckverse` schema and `deckverse_app` role; **never** create a new Supabase project or alter another app. Before any **authorized** live DB operation:
1. Read `hub.read_me_first` **table**, not a function; verify `hub.apps` exact DeckVerse registration, safety contract, `hub.app_resources` ownership and current installed 004–007 schema state, and the real deployed API revision.
2. Review `AGENTS.md`, `SUPABASE_HUB_RULES.md`, `docs/DB_FINAL_RELEASE.md`, migration 007 proposal and checked-in SQL checksums. Confirm app-specific read-only grants/RLS, triggers, `lock_timeout` and dependencies. Obtain separate explicit owner approval for all real Hub metadata writes, database DDL, backup and cutover.
3. Take a **DeckVerse-only encrypted live backup**, verify restore in an isolated owned staging DB and compare exact room/player digests. This is distinct from disposable CI. Do not access other Hub schemas.
4. Have an approved operator apply app-scoped resource registration and migrations **004, 005, 006, 007 in order**, each atomic with drift checks. Do not run an automated migration implicitly on Vercel startup.
5. Verify indexes/RLS/grants, legacy sessions, 2/3/4 capacity, immutable `theme_id`, SQL host transfer/limiter behavior and resource registration. Stop on any mismatch.

No DB action was performed while preparing this document.

### 3. Vercel production cutover and LiveKit (human-gated operational change)

1. Confirm the existing project/domain is the intended `addictive-themed-card-games` app. Preserve prior production deployment as rollback candidate.
2. Review preconfigured **server-side** `DECKVERSE_DATABASE_URL` for limited DeckVerse-only role and the existing LiveKit configuration, without exposing values or adding secrets to commits.
3. Build/verify the **exact final candidate** in a non-production preview/staging route once the user approves preview deployment. Confirm `/api/health` if supported, `/api/game` create/join/get actions and LiveKit-token API (the app health endpoint may be `/api/game` with its documented action; do not invent URLs).
4. With owner approval, perform approved DB migration and only then promote a verified Vercel deployment. Do not promote a backend expecting 007 before storage is migrated.
5. Record old/new deployment hashes; monitor 400/403/409/429/5xx and rejoin/reconnect behavior; restore previous API deployment if needed, leaving additive DB schema in place unless a separately proven rollback is approved.

### 4. Real-phone and real-call acceptance (human)

At minimum, open separate **iPhone Safari and Android Chrome** sessions over actual separate mobile networks (or trusted testers); do:
- Two independent people complete create, join, ready, first category selection, reveal, reconnect, full natural match and rematch for Pokémon and at least two expansion themes (including a 3P and 4P game).
- Representative room/theme selection for every remaining theme; check all 8 displayed stat labels and no hidden-card leaks across 2/3/4 seats.
- Test 320/390px widths, notches/keyboard safe areas, low-bandwidth/resume from background, expanded audio/video call dock, actual mic/camera permissions, LiveKit two-way media and camera/track cleanup.
- Sign off UI responsiveness, performance and accessibility (keyboard/reduced-motion); automated Chromium tests cannot substitute for physical devices.

### 5. Explicit game content signoff (human)

Balance corrections preserve 560 card identities and the 50/60/80 manifests; earlier 2,268 seeded heuristic simulations had **39 capped matches** after improvements (down from 47). These are not proven infinite loops. Review outstanding chooser bias and subjective character/taxonomy issues. Do not silently rewrite approved victory/tie/pot rules.

## Decision / release gate

- **Engineering integration:** ready for automated QA and approved staging once exact-head CI passes.
- **Public release:** **NO-GO until** separate owner approval for app-scoped DB procedures, franchise/IP rights review, actual LiveKit/two-phone verification, and explicit deployment/cutover authorization.
- **Owner message needed at cutover:** approve a concrete, reviewed change set and live Hub / Vercel operations, not a generic “finish the work.”
- Keep all PRs drafts until merge/release authorization. Do not modify Project Hub's BlindRank, MostLikely, Imposter X or other apps.

The remaining gates are intentionally human-authorized; no assistant should mark them completed based only on CI.
