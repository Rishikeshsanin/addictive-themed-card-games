# DeckVerse V2 — disposable PostgreSQL presence QA

**Scope:** Agent C database presence validation, integration baseline `integration/deckverse-v2-api-wiring` at `b534fcbb54870c42c0b8f51bffb180638edadfb4`. Changes limited to this QA report, `tests/db-presence-check.mjs` and `.github/workflows/db-presence-check.yml`. **No production Supabase Hub connection, migration, user data, Vercel deployment, merge or device testing.**

## Test architecture and safety

- GitHub Actions starts disposable `postgres:16` with fictional credentials and database name `deckverse_presence_ci`. No external DB URL or repository secret is referenced.
- TLS is enabled only on the service container so the existing `api/game.js` `ssl:'require'` client can run unchanged. The CI-only temporary self-signed certificate is trusted by the runner via `NODE_EXTRA_CA_CERTS`. Do not copy this setting into production.
- Test setup first creates **synthetic**, narrow, API-compatible `deckverse.rooms` and `deckverse.players`, plus stub **local-only** `hub.assert_app_scope` and NOLOGIN role placeholders required by reviewed SQL. This is **not** a clone or proof of actual Hub metadata, backup or role privileges.
- Apply actual repository migrations **004, 005, 006**, and reapply **006** for idempotence. Real API code is imported unmodified and uses a separate restricted `deckverse_app` connection. Test harness sends authenticated mock HTTP request objects directly to its real handler; limits are exercised via real rate-limit SQL. This verifies server code and database SQL, not real browser networking.
- Test code refuses any database host except `127.0.0.1`/`localhost`, database except `deckverse_presence_ci`, missing disposable opt-in, or role names other than the fictional test roles. All timestamp manipulation is against disposable fixture rows.
- `node --test tests/db-presence-check.mjs` is intentionally separate from the ordinary no-database `npm test` suite.

## Scenarios and assertions

| Scenario | Expected assertion |
| --- | --- |
| Migration rehearsal | 004/005/006 apply to disposable schema, 006 repeat, RLS on limiter |
| Heartbeat | Original 64-hex token authenticates original seat; forged body timestamps/seat ignored |
| 15-second cadence | Artificial 15/16/30-second inactivity followed by authenticated heartbeat yields online |
| Suspected disconnect | 44s online; 46s grace; 119s lobby grace; 121s lobby disconnected |
| Lobby takeover | Valid seat-1 heartbeat transfers past grace; seat-0 rejected for settings/start |
| Multiplayer takeover | 2/3/4 seats, concurrent guest heartbeats elect exactly one clockwise owner |
| Battle grace | 299s playing grace; 301s host takeover; match paused, deck JSON/tokens unchanged |
| Reconnect | Original token reactivates original seat; transferred ownership not stolen |
| Pause and round | Block selection while peer stale; after reconnect two simultaneous selects advance once |
| Explicit leave | `active=false` and `left_at` recorded; same token cannot heartbeat |
| Browser hidden simulation | Missing heartbeat does not forfeit, mark inactive or mutate cards |
| Legacy/expiry | NULL heartbeat blocks automatic abandonment; expired room is not revived |
| Locking | Multiple simultaneous heartbeats preserve one authoritative host/version |
| Conflicting host claims | Concurrent original/new host settings: exactly one succeeds, other receives HTTP 403 |
| Leave vs heartbeat race | Lock ordering prevents departed seat from being revived |
| TTL policy mismatch | Proves 3h PostgreSQL expiry precedes 24h abandoned-playing policy horizon |
| Abandonment | Pure policy derives abandoned condition; **no background worker exists** |

**Verified 2026-10-20:** [Disposable PostgreSQL workflow run 39452815138](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39452815138) **SUCCESS**. Real PostgreSQL 16 service was initialized, TLS activated, migrations 004/005/006 applied in the synthetic schema, migration 006 replayed, and **15/15 Node integration tests passed (0 failures)**. Job 118731824495 completed successfully. This is a single deterministic integration run, not a load/soak test or a live Hub/physical-phone check. 

## Actual CI result and verification boundaries

- 15 integration tests completed successfully using the real V2 API handler and Postgres transactions, including 6 competing authenticated heartbeats, two concurrent round selections, an old/new host settings race and a leave/heartbeat race. Each host transfer persisted exactly one `host_seat` with `presence_version=1`; duplicate round selections resolved to HTTP 200 and 409 with exactly one game turn. This does not model prolonged database lock contention or mobile packet loss.
- `migration 006` was applied twice without error inside disposable PostgreSQL after synthetic base schema, 004 and 005. No live Supabase schema, permissions, role inventory or migration history was accessed.
- Simulated browser backgrounding advances `last_seen_at` in a *local test database*; **no actual Safari/Chrome background throttling** occurred.
- GHA engine suite and Vercel are separate checks. Vercel reported a plan/build-rate-limit failure URL on the initial PR commit; that is not a PostgreSQL test failure.

**Expanded-suite evidence:** [PostgreSQL run 39452815138](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39452815138) completed **15 passed / 0 failed** at commit `74940443`. The new competing-host and leave races both passed; a targeted assertion independently reproduced the 3h expiry versus 24h abandonment incompatibility. No physical-device testing occurred.

## Audit findings for coordinator to assess

1. **No abandoned-room sweep** in current server integration. `evaluateRoomPresence().abandoned` is computed but `api/game.js` never uses it to perform safe expiry. Active, abandoned rooms can linger until their separate `expires_at` value. Do not introduce destructive cleanup without review.
2. **3-hour sliding TTL vs 24-hour active-match abandonment.** Heartbeats extend `expires_at` by 3 hours. After all players go offline, previously extended expiry closes access much earlier than the 24-hour abandonment policy. A user reconnecting after TTL expiry cannot authenticate even though policy says retain the room; align this with an approved maximum room retention and recovery policy.
3. **GET uses separate unlocked queries.** `snapshot` loads the room and players separately, so an overlapping host-transfer transaction may yield a stale/inconsistent intermediate view; write-time host authorization correctly uses the locked room transaction. Consider snapshot consistency or revision-based retry.
4. **Transaction-start `now()` under wait.** `updatePresence` uses `now()` rather than `statement_timestamp()` or `clock_timestamp()`. In unusually long lock queues the stored heartbeat timestamp may predate lock acquisition. Consider DB-trusted per-statement time within serialized transactions, preserving monotonicity.
5. **Inactive rows filtered out.** `updatePresence` and `snapshot` query `active=true` rows only. This maintains the paused roster count but does not surface a `left` presence label, and `evaluateRoomPresence().abandoned` is not reliably usable for rooms with departed players. Coordinator should define cleanup and tombstone handling.
6. **Grace pause is conservative.** Any seat in `grace` pauses the full playing match (beginning at 45 seconds); preserves fairness but may cause frequent pauses on mobile/background switching. Must be validated on physical devices before claiming smooth UX.
7. **Migration owner collision.** Issue #11 assigns `migrations/006_deckverse_presence.sql` to Agent F (migration-safety). The current Agent C request also names it; this PR **leaves migration 006 unchanged** and reports any DDL findings to the coordinator/F. Do not concurrently rewrite it.

## Release decision

**NO-GO for production V2 presence until:**
- **Disposable PostgreSQL integration: SATISFIED for current branch** (15/15, 0 failed, linked run above). Re-run after shared-API or migration edits.
- Coordinator addresses or consciously accepts the TTL/abandonment discrepancy and snapshot/timestamp risks, demonstrates an authorized cleanup policy, and validates 2/3/4 real HTTP clients.
- Independent migration-safety owner reviews 004/005/006 scope, RLS, grants, rollback, staging and data-preserving sequence.
- **Separate explicit user authorization** is obtained for any migration against the real Supabase Project Hub, followed by scoped verification and advisors.
- Actual phone background/resume and adverse network validation are completed. Simulated-time/CI results do not prove physical-device reliability.

**Do not merge or deploy on the strength of this report alone.**
