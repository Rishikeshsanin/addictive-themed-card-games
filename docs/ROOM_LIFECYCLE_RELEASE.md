# DeckVerse V2 — final room lifecycle and release verification

**Review-only draft PR.** Baseline: `integration/deckverse-v2-release-hardening` at `4e74e8d0307382f6de09bb5afa503a7def6ec1fe`. Edit scope: `api/game.js`, `src/presence.js`, Agent C's `tests/db-presence-check.mjs`, this document. **No migrations changed; no real Supabase DB access, production deployment, merge or cross-project writes.**

## Contract: explicit finite recovery windows

| Status at last authenticated activity | `expires_at` lease | Subsequent behavior |
| --- | --- | --- |
| Lobby | 30 minutes | Reconnect with original token until expiry, seat preserved, no automatic forfeit |
| Playing | 24 hours | Original session can reconnect even after 5m host transfer; decks, pot, chooser and history unchanged |
| Finished | 30 minutes | Existing participants may review result/rematch if otherwise eligible; no unlimited renewal without authenticated requests |

Newly created rooms start with **30 minutes**, replacing the 3-hour DB default at insert time. Lobby joins, ready/settings and heartbeats renew the 30-minute lease. **Start** and rematch restart set the active 24-hour lease in their existing locked transactions. Every authenticated active-game heartbeat/authorized command renews **24 hours** from DB time. Natural game completion or an intentional in-game forfeit transitions to finished and replaces the active lease with **30 minutes**. Finished-room heartbeats renew the 30-minute lease, allowing ongoing consensual rematch discussion. A lobby with no active members is expired immediately. Each phase has a *sliding* lease; active connected players can stay longer than 24 hours, but a room with **no activity** cannot remain accessible indefinitely.

These lease durations equal the `DEFAULT_PRESENCE_POLICY.abandonedMs` defaults; `retentionSeconds` rejects unknown statuses. Existing fixed-grace thresholds remain **heartbeat every 15s in active foreground**, online under 45s, 2m lobby host grace, 5m playing host grace, 3m finished host grace. Network/background loss never calls `leave` automatically or forfeits a card.

An active game with an older legacy `expires_at` written by V1 cannot automatically be revived once that old deadline has passed; no historical data is rewritten or silently reactivated. On an authorized rollout, independently review legacy room preservation/rollback, especially sessions with less than 24 hours remaining under old TTL. Deployment requires separate approval.

## Non-destructive cleanup and historical retention

At `expires_at <= clock_timestamp()`, `readRoom` and all snapshots return generic **404**; neither a hidden card nor a token is exposed. Expired sessions cannot heartbeat, restart, or bypass the old lease.

`sweepExpiredRoomSessions(db,{batch=32})` performs an *opportunistic bounded soft cleanup* before a rate-limited room creation: inside **one statement** it selects at most 32 expired DeckVerse rooms that still have active seats, takes **room-first `FOR UPDATE SKIP LOCKED`** locks and sets only their player rows `active=false,ready=false`. This prevents future token use, and cannot lock out a concurrently refreshed room. It **never deletes records**, clears decks, alters winner/round/card/pot state, changes `left_at`, rewrites history or touches another schema. Expiration is distinct from intentional `leave`: `left_at` is untouched. Repeated sweep is idempotent, bounded to 1–128, and makes no attempt to reopen an expired room.

Soft cleanup is opportunistic, **not a guaranteed background scheduler**. Even if no future creates occur, expired rooms are immediately inaccessible because all APIs check `expires_at`. Physical historical rows remain; privacy/data-retention archival or permanent deletion needs a separate explicitly approved plan and job. Do not claim persistent data deletion or storage reclamation. Operators should monitor expired-row counts and provision a separately authorized archival/retention schedule if necessary.

## Snapshot consistency, locks and authorization

The old `snapshot` performed an unlocked room query then a separate player query, permitting cross-commit combinations. The new snapshot uses **one PostgreSQL MVCC SELECT with joined active players**, checking expiration in the same statement. All its rows therefore see the same committed room/game/host/presence state. It authenticates only the requesting token hash before composing the response. No `token_hash`, opposing deck order or hidden cards are serialized. Snapshot is **read-only** and never transfers host.

All mutating routes still acquire `deckverse.rooms FOR UPDATE` first, then authenticate the original active seat, use **PostgreSQL `clock_timestamp()`** after the room lock (never client-supplied clock), update trusted `last_seen_at` monotonically and compute the deterministic `hostSeat` under the same transaction. Old host cannot issue start/settings once authority transfers. Lost clients preserve their original seat; simultaneous heartbeat vs `leave` cannot resurrect an exited token. Concurrent selections remain guarded by `expectedRound` and the pause/chooser rules. The heartbeat endpoint remains behind Agent B's durable rate limiter.

## Real disposable PostgreSQL verification

The existing `db-presence-check.yml` CI workflow provisions a fictional local PostgreSQL 16 container with TLS and applies actual 004/005/006 **only** inside the disposable test DB, with a mock local Hub scope guard. It imports the **real API handler**, uses two SQL connections and verifies host, card-state and expiry transactions. No production credentials or real Hub migrations are used.

The updated Agent C suite tests: 15s/45s/2m/5m thresholds, 2/3/4 transfer, 24h active TTL and four-hour recovery, lobby/finished 30m leases, database-trusted timestamps, old token invalidation, forged session/timestamp inputs, expired-seat soft cleanup, idempotency, simultaneous cleanup and heartbeat, host-settings race, leave/heartbeat race, concurrent round selection, hidden-card/token protection and consistent multi-request snapshots. Synthetic browser background testing is **not physical device testing**.

**CI result:** Record the actual run URL, number of passing/failing tests and commit SHA only after the workflow finishes. Do not assert a pass from mocked time. Run: `node --test tests/db-presence-check.mjs` under the disposable-only CI environment. `npm test` covers pure game and policy units separately.

## Release gates

- [ ] Disposable PostgreSQL updated suite passes, and existing CI remains green
- [ ] Verify the real DeckVerse schema, RLS/grants, legacy `expires_at` rows and rollout/rollback sequence **read-only**, then obtain separate explicit approval for any future real migration
- [ ] Confirm operational metrics and policy for indefinite **stored** historical rows, bounded opportunistic cleanup, and whether separately authorized archival/deletion is desired
- [ ] Real physical iOS/Android background/suspend/network switch and cross-instance Vercel stress tests
- [ ] Security and commercial IP/legal issues remain independently tracked

**No-Go to merge/deploy without coordinator review, migration-release authorization and field QA.** The work fixes the code-level 3h/24h mismatch and snapshot inconsistency but does not imply that V2 is production ready.
