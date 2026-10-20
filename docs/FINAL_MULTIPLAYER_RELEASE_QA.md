# DeckVerse V2 — Final Multiplayer Release QA

**Branch:** `agent/d-final-multiplayer-release` → `integration/deckverse-v2-release-hardening`  
**Scope:** tests and this report only. No shared API, migration, live database, deployment, or other project changes.

## What is actually exercised

The existing [disposable PostgreSQL workflow](../.github/workflows/db-multiplayer-check.yml) provisions PostgreSQL 16 with local SSL and limited fictional `deckverse_app` and `deckverse_ci_fixture` roles. A fictional legacy 2-seat room is seeded, then the checked-in SQL **004 (twice), 005, 006** executes on that disposable instance. A local-only Hub assertion stub checks schema `deckverse`; it is **not proof** of real Hub migrations or schema equivalence with actual Supabase PostgreSQL 17.

Existing baseline tests verify SQL-backed 2/3/4 rooms, eight comparison categories, RLS, capacity, auto/manual reveal, jackpots, stale rounds/rematches, conservation, browser privacy and 320/390px layouts.

New `tests/db-multiplayer-final-release.mjs` is invoked **after** the existing browser suite, from `tests/db-multiplayer-browser.mjs`. It starts a fresh local HTTP server on port 4186; every gameplay request reaches the unmodified current `api/game.js` over a real loopback TCP connection and from there actual PostgreSQL transactions. No API routes are intercepted or mocked.

The new lane verifies:
- Strict credentials/URL fail-closed: `DB_MULTIPLAYER_TEST_ONLY=1`, exact `127.0.0.1:5432/deckverse_ci`, fictional `deckverse_app`/`deckverse_ci_fixture` logins and SSL.
- Legacy `LEGACY` 2P room and player preserved with default `player_count=2`, `host_seat=0`, `presence_version=0`, existing readiness, `left_at=NULL`, widened seat constraint, V2 columns and forced RLS on all three app tables.
- Seven concurrent join attempts competing for three free seats in a new 4P room; exactly three succeed, with occupied seats 0–3.
- Twelve parallel, identical select requests at the same expected round; exactly one commits a turn, stale duplicates reject with 409, state remains conserved.
- A 3P **started** match whose host's fictional last_seen_at is advanced seven minutes into the past via fixture-only SQL. Real authenticated guest heartbeat transfers host, active round pauses, no cards change; original host token reconnects, guest stays host, gameplay resumes.
- Two complete **natural engine-driven** real-HTTP/SQL matches per roster (2P, 3P, 4P): every turn uses the current chosen card and one of the existing eight legitimate categories; round and winner checks, correct Rank-min and others-max comparisons, card conservation, no duplicate IDs, periodic private snapshots and heartbeats. Tests accelerate reveal deadlines via **disposable fixture SQL** rather than waiting years for thousands of auto-reveals.
- Fresh match epoch and identical room/member seats after all original players consent, same-seat duplicate vote cannot complete quorum, stale rematch number returns 409, match resets, new deck order.

The synthetic source `127/8` address rotates across accelerated-game requests to avoid treating the separately verified durable per-IP **rate limiter** as a match-length limit. It is not a workload with real consumer IP or mobile network traffic.

## Exact reproducibility

GitHub Actions: open a draft PR modifying `tests/db-multiplayer-browser.mjs` to trigger `DeckVerse disposable PostgreSQL multiplayer QA`. The original workflow provisions the environment, executes `db-multiplayer-api.mjs`, `db-multiplayer-browser.mjs`, and the final release module, then uploads `deckverse-disposable-db-qa` evidence.

The final result is appended to the existing uploaded `/tmp/deckverse-db-multiplayer-results.json` as `finalRelease`, so previous API percentiles are retained. Tests abort if any assertions fail. Any offline repetition must provision a fresh **disposable** PostgreSQL instance with the workflow's exact roles/schema first; pointing at Supabase is prohibited.

## Release acceptance matrix

| Lane | Gate | Evidence |
|---|---|---|
| MIG-1 | Legacy room preservation, V2 schema, repeated 004, 005/006, forced RLS | disposable SQL checks |
| HTTP-1 | 2/3/4 full room and match flow, 50/60/80 exact conserved unique cards | real loopback HTTP + SQL |
| HTTP-2 | 4P seven-way join for three seats, 12-way round race | SQL row locks, 200/400/409 outcomes |
| HTTP-3 | Two completed match epochs each 2/3/4, fresh rematch, quorum, no old votes | 6 organic accelerated matches |
| HTTP-4 | Correct winners in all decisive rounds, private opponent futures, shared reveals | persisted state + per-seat API views |
| PRES-1 | Stale host transfer, pause, original-token reconnect, no card loss | DB timestamp fixture plus authentic heartbeats |
| UI-1 | 2/3/4 isolated Chromium sessions on mobile dimensions | existing SQL/browser suite |
| LAT-1 | p50/p95/max request times, sample counts and turn totals | JSON CI artifact |
| PROD-1 | Actual PG17 schema, backup/restore, Hub app_resources and grants, approved migration and real phone tests | **NOT tested / coordinator approval gate** |

## Post-migration, DeckVerse-only coordinator procedure (NOT executed)

1. Obtain **separate explicit owner authorization** for the real DeckVerse-only change. Follow `AGENTS.md`, `SUPABASE_HUB_RULES.md`; first read `SELECT * FROM hub.read_me_first;` (**table**, not function), validate `hub.apps` slug/schema `deckverse`, safety acknowledgement, resource registry. Do not touch any other app. Verify migration/checksum/version and archive an encrypted, restorable, **app-scoped** PostgreSQL 17 backup of rooms/players and current schema DDL.
2. Before 004: stop new V2 room creation, enumerate DeckVerse-only active/playing room counts and existing constraints/indexes, RLS/grants and schema drift; explicitly validate all legacy seat constraints, column types and migration role grants. Confirm staff on call, bounded lock and statement timeouts, rehearsed rollback/restore. Never use a project-wide service key as runtime credential.
3. Apply approved **004 only**, in bounded transaction, then verify old 2P row digests/session auth/room IDs and state unchanged; new defaults 2, seat 0..3. Re-test 2P create/join/ready/start/reveal/select/rematch before continuing.
4. Confirm only `deckverse.rate_limit_counters` is registered in `hub.app_resources` using the approved Hub workflow. Apply **005** in its own controlled transaction, inspect restricted grants, FORCE RLS, and durable concurrent quota behavior. Stop on any unexpected changes.
5. Apply **006** separately under the approved lock plan, inspect `host_seat=0`, `presence_version=0`, nullable `left_at`, and existing `last_seen_at`/active untouched. Repeat legacy 2P session/token checks.
6. In an **approved DeckVerse-only staging environment**, execute full 2/3/4 real HTTP and browser sessions against staging using separate non-production accounts; check 50/60/80 uniqueness and secrecy, all eight stats, ties, elimination, host transfer/reconnect, duplicate/parallel actions, rematch epochs, rate-limits and latency at expected production load. Never run fixture SQL that backdates timestamps or moves decks against production.
7. Run Hub security/performance advisors restricted to findings relevant to DeckVerse; compare deployed code and final approved migration SHAs, RLS policies, row counts, index health and latency against preflight baseline. Conduct iOS+Android two-/three-/four-phone Wi-Fi/cellular and LiveKit tests, and separately resolve franchise rights.
8. **Go/no-go**: fail closed on app scope mismatch, stale backup, DB lock timeout, elevated grants/RLS, card leak, duplicate state transition, failed 2P continuity, non-unanimous rematch, unhandled disconnect or unacceptable latency. If any gate fails **before commit**, roll back the current transaction. If a committed migration fails, roll back V2 *application deployment* first; do **not** blindly revert destructive columns/seat constraints or touch unrelated Project Hub apps.

## Known limitations / release verdict

- Fake DeckVerse-only legacy fixture approximates inspected production schema but does not prove exact live PG17 parity, permissions, RLS ownership or pre-existing data characteristics. Staging proof, migration authorization and backup/restore are separate owners' tasks.
- Chromium is synthetic (not actual iPhone/Android); IP/network latency not represented. Auto-reveal time acceleration is fixture-only, not representative human experience.
- Any abnormal failure in the new end-to-end CI must be logged with exact assertion, minimal reproducible requests, and an **API-only proposed patch** to the coordinator—never patched outside Agent D ownership.
- No real Supabase SQL executed; no merge, deploy, or other application modified.
- **Verdict remains NO-GO for production V2 until separate deployment gates are approved.**

## CI evidence

**Pending validation of this newly added final stress suite.** Record the passing/failing latest-run URL, measured latency and exact remaining blockers here and in the PR after the run completes. Do not equate a submitted test with a pass.
