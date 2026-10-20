# DeckVerse V2 — real SQL multiplayer QA (disposable PostgreSQL)

**Target:** `integration/deckverse-v2-api-wiring`  
**Test branch:** `agent/d-db-multiplayer-validation`  
**Coordination:** [#11](https://github.com/Rishikeshsanin/addictive-themed-card-games/issues/11) and [#3](https://github.com/Rishikeshsanin/addictive-themed-card-games/issues/3)

## Boundary and non-production guarantee

These tests invoke the existing, **unmodified** `api/game.js` handler and run all game mutations through real PostgreSQL queries and row-locking transactions. Separate headless Chrome contexts run the existing frontend against a local HTTP instance of that same real handler. This is materially stronger than mocked API responses, but it is **not** a real Supabase Hub staging test, licensed-content review, full production load test or physical-device test.

The GitHub Actions job provisions **disposable, localhost-only PostgreSQL 16** using fictional room and player data. Environment variables are hard-coded to test-only localhost `deckverse_ci` with non-secret disposable passwords, and the API tests refuse to run otherwise. The script uses no Supabase URL, project-wide admin credential, remote production endpoint, Vercel deploy or live migration. Real Project Hub is **not touched**.

For this isolated CI fixture only:
- Create a pre-V2 2-seat `deckverse.rooms` / `deckverse.players` contract and a legacy 2-player room.
- Emulate only `hub.assert_app_scope` with a **test-only** function that rejects any schema other than `deckverse`. This is not a replacement for the real Hub app-registration/read-me-first process.
- Apply existing **review-only 004, 005, 006** SQL to the disposable database so the current API dependencies exist; grant access to dedicated fictional `deckverse_app` and `deckverse_ci_fixture` users.
- Enable RLS for the app-owned tables and enforce SSL connections to the local PostgreSQL cluster.
- The fixture account can mutate the isolated game state for deterministic corner cases. Such state injections are explicitly distinguished below from unmodified live-play rounds.

## How to reproduce from the PR

Open GitHub Actions for **DeckVerse disposable PostgreSQL multiplayer QA** on this draft pull request; inspect the workflow steps and the `deckverse-disposable-db-qa` screenshot/JSON artifact.

```bash
# This script intentionally only works with ephemeral loopback PostgreSQL whose
# schema, migrations and roles were provisioned by the CI workflow.
DB_MULTIPLAYER_TEST_ONLY=1 \
DECKVERSE_DATABASE_URL='postgres://deckverse_app:disposable_only_ci@127.0.0.1:5432/deckverse_ci?sslmode=require' \
DB_MULTIPLAYER_FIXTURE_URL='postgres://deckverse_ci_fixture:disposable_fixture_only@127.0.0.1:5432/deckverse_ci?sslmode=require' \
node tests/db-multiplayer-api.mjs
```

The test suite requires a **disposable** PostgreSQL 16 schema prepared by its associated workflow, with migrations 004/005/006. Do not run it against Supabase.

## SQL-backed acceptance matrix

| Coverage | Method / assertion | Boundary |
|---|---|---|
| Legacy upgrade | Existing room gets `player_count=2`; original seat remains and 004 permits seat 3 | Disposable approximation of V1.2 schema, not inspection of real Hub constraints |
| Create/join/ready/start | 2/3/4 active seats, 25/20/20 cards; room locking serializes duplicate starts | Actual V2 API + PostgreSQL |
| Room capacity | Four simultaneous joins for two available seats yield two winners only | Actual Postgres constraint and room locks |
| Card privacy | Each actor gets only own top card; no opponent deck or stored hash in JSON | API snapshots and persisted DB state |
| Eight categories | Winner compared against authoritative stored card IDs; Rank is min; other 7 are max | Actual API turns and DB-conserved state |
| Auto reveal | Early select blocked, deadline expires, concurrent duplicate selects commit once | Uses one real 2s wait; fixture-accelerated later turns |
| Manual reveal | Two, three or four acknowledgments, deduplication, stale ack, premature select blocked | Real API transaction and multi-browser clicks |
| Jackpot/ties | Multiway best-value ties, pot conservation, decisive distribution and chooser | Deterministic deck-order fixture, then actual SQL-backed API turn |
| Full victory | Natural heuristic game progression; separate near-end engineered fixture | Natural matches accelerate reveal time only; seeded endgames explicitly fixture-assisted |
| Rematch | All N consent, same room members, new shuffles, round 0, cleared pot, new match epoch | Concurrent real SQL transactions |
| Stale epoch | Votes with older `expectedMatchNumber` must return HTTP 409 even after later match finishes | Current coordinator guard |
| Leave/forfeit | Finished or aborted state, blocked rematch | Actual API and persisted state |
| Mobile UI | 320/390px, multi-card visibility, no horizontal overflow, duplicate session isolation, refresh | Real local API+Postgres, headless Chromium, NOT physical phones |
| Latency | P50, P95, max for create, join, start, get, select, ack, rematch | Local CI runner only, no internet/radio latency |

The `/tmp/deckverse-db-multiplayer-results.json` artifact captures run-specific timings and uncovered coordinator blockers. A successful CI run is necessary before claiming PASS for any matrix row.

## Known API behavior to report to coordinator

**Validation errors currently surface as HTTP 503:** In the shared `api/game.js` catch, errors thrown by the pure engine for a non-chooser actor or unknown category are plain `Error` values with no `status`. The final catch reports a 503 service outage rather than an actionable 400/403 invalid player move. The real SQL test asserts the turn remains unmodified and records a coordinator blocker for any 503.

**Proposed coordinator-only patch:** Within the `select` branch, validate `b.stat` against `STAT_FIELDS` and compare authenticated `me.index` with room state's `chooser` *before* calling `takeTurn`/`multiTurn`, throwing `fail('Invalid category.',400)` or `fail('Not your category-selection turn.',403)`. Keep authoritative transactional checks and expected-round validation, rather than globally changing all untyped errors to 400.

**Migration 004 ownership coordination:** Issue #11 assigns `migrations/004_multiplayer_rooms.sql` to Agent F / #12 and DB E2E files to Agent G / #13, whereas this assignment names a new Agent D branch and includes 004. To avoid competing SQL changes, this PR **does not edit 004**. Any defect found is to be handed to F and the coordinator for review. No approval to execute SQL in real Supabase is implied.

## Release gating / verdict

**Default verdict: NO-GO for deploying V2 solely on this PR.** A green isolated CI is evidence that PostgreSQL room transactions work in a clean fixture; it does not establish migration safety on actual historic Hub rows or verify physical mobile/reconnect under real networks. Before release, coordinator must resolve any reproduced API errors, integrate Agent F migration approvals, complete safe schema-scoped read-only preflight/backups and secure **separate explicit authorization** for real 004/005/006 SQL. Then rerun 2/3/4 full-session staging tests and advisors, verify no other apps affected, and review fairness, rate-limiting, presence, licensing and device gates. No agent may merge or deploy from this branch.

## Measured CI results

**Verified successful baseline:** [Actions run 39453454974](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39453454974), commit `c9fb786e086d79225225196a22de5105f6976086`.

- Disposable PostgreSQL 16 provisioning, SSL, restricted `deckverse_app` role and legacy 004/005/006 migration: **PASS**.
- API/SQL create/join/ready/start, 2/3/4 card counts, all eight stats, hidden decks, database row-lock collisions, manual 2/3/4 consent, stale round and rematch epochs, unanimous rematches and forfeit: **PASS**.
- Unmodified API/SQL natural heuristic full games completed in **65 rounds (2P), 283 rounds (3P), 156 rounds (4P)**. Reveal expiry was accelerated by mutating **only the disposable fixture**, so match lengths do not represent human gameplay.
- Separate Chromium contexts connecting to real local API and disposable PostgreSQL passed at 2P, 3P and 4P, including 320px/390px layouts, card concealment, all-N manual acknowledgements and refresh.
- **Known blocker reproduced:** invalid category and unauthorized category caller return HTTP 503 instead of appropriate client error; `api/game.js` is not modified by this PR.

Local runner timings for that verified run (milliseconds, all per API request; not user-network latency):

| Action | Calls | p50 | p95 | Max |
|---|---:|---:|---:|---:|
| Create | 12 | 3.9 | 6.9 | 76.5 |
| Join | 26 | 4.1 | 7.0 | 7.4 |
| Start | 33 | 6.3 | 9.8 | 55.8 |
| Get/snapshot | 177 | 3.0 | 4.8 | 54.7 |
| Select/turn | 562 | 4.6 | 6.1 | 16.9 |
| Rematch | 29 | 9.1 | 17.8 | 21.6 |
| Ack | 18 | 4.3 | 5.9 | 9.2 |

[Baseline CI artifacts](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39453454974/artifacts/12279128884) include the latency JSON and phone screenshots. Later commits add 004 reapplication, chained ties, eliminated-seat skipping and duplicate rematch tests. Consult the **latest** PR workflow status before claiming the expanded suite passed.
