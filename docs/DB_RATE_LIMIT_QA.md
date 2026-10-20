# DeckVerse V2 — Disposable PostgreSQL Rate-Limit QA

**Review-only verification branch:** `agent/b-db-security-verification` from `integration/deckverse-v2-api-wiring` (baseline `b534fcbb54870c42c0b8f51bffb180638edadfb4`). **Never apply migration 005 to the real Supabase Hub. No production deploy, no real LiveKit credentials.**

## Safety and ownership

Read `AGENTS.md`, `SUPABASE_HUB_RULES.md`, repository README, migrations 004–006 and integration PRs #2/#10. This assignment supersedes the previous Agent H branch name; issue #11 already lists Agent F as migration-005 owner and Agent H as a parallel test-lane owner. **No edits to migration 005 or any shared source are proposed here** to avoid conflicting DB/schema changes. Coordinator must de-duplicate parallel PRs.

The CI job creates a fresh PostgreSQL 16-alpine service container with a **synthetic** local database named `deckverse_rate_test`. Test code refuses any connection that is not `127.0.0.1` / `localhost` port 5432 using that exact database name; URLs must be provided explicitly. The only Hub object is an **ephemeral stub** `hub.assert_app_scope` on that disposable database, so the exact migration SQL can be evaluated unchanged; this is not a test of the real Hub registration API or authorization. Disposable roles `deckverse_app`, `anon`, `authenticated`, and `service_role` are created only inside that service container. **Never point these tests at the connected Supabase Project Hub.**

## How to run

The actual workflow is `.github/workflows/db-rate-limit-check.yml`, using a scoped `pull_request` trigger or explicit workflow dispatch. Run locally only after starting **your own disposable PostgreSQL 16 server** on localhost:5432 with database `deckverse_rate_test`, admin credentials, and synthetic app password. Do not import a real Project Hub DB URL.

```bash
npm ci --no-audit --no-fund --ignore-scripts
node --check tests/db-rate-limit-postgres.mjs
node --test --test-concurrency=1 tests/db-rate-limit-postgres.mjs
```

Environment variables `PG_ADMIN_URL`, `PG_APP_URL`, and `PG_APP_PASSWORD` are mandatory and are configured in CI with throwaway credentials. The test runner creates the schema and applies migration 005 **twice in the disposable DB** to verify idempotence.

## Test plan and what counts as evidence

| Test | Verification expectation |
| --- | --- |
| 200 simultaneous attempts, eight independent SQL pools | At most 31 accepted and exactly 169 rejected; stored single counter at 31, no other SQL errors; measure wall time, p50 and p95 |
| Source isolation | RLS on and forced; browser/service roles denied, dedicated app role granted minimum DML; expiry and primary-key indexes present |
| Migration reproducibility | Review-only 005 succeeds twice in disposable DB |
| Create/join/code guessing and invalid sessions | 8/9 create, 8/9 per-code join, 12/13 invalid guesses, 15/16 authentication failures |
| LiveKit token issuance | 15/16 synthetic calls per session denied, another session succeeds; zero LiveKit Cloud calls |
| Household/NAT | Four synthetic players share a trusted IP; 361 read polls, four joins and one heartbeat are admitted without false-positive throttling |
| Header integrity | Untrusted X-Forwarded-For ignored; platform-controlled Vercel forwarding accepted only when flagged; malformed/missing identity uses strict shared fallback |
| Expiry and Retry-After | Live DB clock 1s rollover, HTTP 429 and Retry-After, no raw secrets in JSON |
| Cleanup and storage | Insert 700 synthetic expired buckets, reap in batches <=256 with app role, verify index and no residual fixture rows |
| Recover after DB failure | Closed SQL client rejects (fail closed); independent client preserves counter state |

**Evidence classification:** The old `tests/rate-limit.test.js` suite uses an in-memory SQL simulation and does not prove transactional correctness. This new runner uses actual PostgreSQL SQL and 8 independent connection pools. It exercises limiter calls by semantic action (create/join/auth/LiveKit), **not a complete external HTTP game match, Vercel edge, or LiveKit Cloud token endpoint**. No physical network/phone measurements are claimed.

## Findings and attack-surface notes

1. **Critical verification gate:** PostgreSQL `ON CONFLICT DO UPDATE ... WHERE hits < max` must serialize concurrent workers and return a stable 429; this is proven only if the disposable PostgreSQL CI suite passes.
2. The middleware uses a single IP-based bucket for most operations. A shared public gateway can exhaust create, join or token budgets for innocent players; even with 1,200 reads/minute there is no guarantee under a very large NAT. Test intended player count and adjust defaults on observed abuse data, not guesses.
3. The limiter trusts `x-vercel-forwarded-for` when `VERCEL=1`. **This requires the coordinator to verify in actual Vercel documentation/edge observations that clients cannot inject or override the trusted header.** An arbitrary header must never authenticate a client without a trustworthy proxy boundary.
4. The SQL strategy is fixed-window, not a sliding token bucket. Attempts at a boundary can effectively double a short-window limit. Repeated 429s hold at the capped hit count but still incur a hot-row conflict lookup/DB round trip; substantial public abuse still benefits from upstream Vercel/WAF controls.
5. Expiry cleanup is opportunistic (normally 1 in 32 requests, 256 rows maximum each). It bounds **per-call cleanup effort**, not lifetime table size when traffic stops or high-cardinality traffic outpaces deletion. Retention monitoring or separately approved app-scoped maintenance is still required.
6. Each POST `get` costs one table UPSERT in addition to room/auth/presence queries. Polling every ~550ms by 4 friends generates roughly 436 quota updates/minute per IP; only disposable CI measurements are included, not a production load limit.
7. Integration review: `api/game.js` checks quotas before action dispatch and classifies missing rooms/401; `api/livekit-token.js` checks membership and failure rate before signing. Both map `RateLimitError` to 429 and storage failure to generic 503. Invalid request shapes are rejected before quota consumption, so heavy malformed-body floods remain an edge/WAF concern. **These shared endpoints are coordinator-owned and unchanged in this PR.**
8. **Potential join/reconnect false positive:** per-IP+code 8 joins/5min and a shared IP can penalize many friends retrying the same room. Ensure legitimate reconnects use the authenticated `get`/heartbeat route, not repeated `join` resets; test against actual client paths.
9. Migration 005 includes a `hub.assert_app_scope` call and a table-scoped `deckverse_app` RLS policy, but the service container cannot attest to real Project Hub registration, role inheritance or advisor state. Post-approval staging checks are mandatory.

## CI execution and results

**Status:** Awaiting CI proof when this document was authored. A successful run link, actual numeric output and any corrected defects must be added before marking the agent deliverable verified. Mocked results must not be presented as real PostgreSQL evidence.

## Coordinator-only release requirements

- Review Agent F migration safety changes and resolve 005 file conflicts before applying any SQL. Confirm `hub.read_me_first` is a **table** and only `deckverse.*` is targeted. Obtain separate explicit real-project authorization and register `deckverse.rate_limit_counters` in `hub.app_resources`.
- Validate real `deckverse_app` schema usage, minimum grants and RLS, run post-DDL Supabase security/performance advisors; test rollback/restoration. Never create global cron or modify other projects to solve cleanup.
- Review GitHub Actions logs for concurrency counts, p95 query times and permission tests; avoid a production stress test. Inspect PR diff scope before merging.
- Coordinator must own any changes to `api/game.js`, `api/livekit-token.js`, `src/server/rate-limit.js` or central workflow. Use existing server-only credentials and test with an isolated environment before production deployment.
- Confirm Vercel forwarding provenance, 429/retry UX, 503 behavior, multi-user NAT, real browser refresh/reconnect, and actual 2/3/4-player functionality. This PR is **not** production approval.
