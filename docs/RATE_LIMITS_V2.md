# DeckVerse V2 — Durable rate limiting (Agent B)

**Status: implementation complete, not activated.** The migration is unapplied; shared API endpoints are unchanged. This document is for the coordinator integrating into `feature/rematch-multiplayer-reliability`.

## Existing behavior and threat model

`api/game.js` handles `create`, `join`, `get` (POST polling roughly every 550ms), and authenticated game mutations. Rooms use six-character codes, server-generated 64-hex tokens stored as SHA-256 hashes, and row-locked PostgreSQL transactions. `api/livekit-token.js` validates an active remote-game member and signs a room-restricted LiveKit JWT, with a separate non-signing GET configuration probe.

Attackers can spam room creation, guess room codes, try session tokens, hammer polling and mint unnecessary LiveKit tokens. A nickname, arbitrary forwarding header or user-supplied token is **never** a trusted standalone quota identity.

## Design

`src/server/rate-limit.js` exports `getClientIP`, `consumeQuota`, `enforceRateLimit`, `recordRateLimitFailure`, `cleanupExpired`, `writeRateLimitResponse` and `RateLimitError`. The existing limited `deckverse_app` postgres-js SQL instance is injected; **no new database connection, external service or credential** is needed.

Buckets key on SHA-256 of a server-owned namespace and the observed IP, optionally combining a valid code or token **only in addition to** the IP quota. PostgreSQL stores no raw IP, token, nickname or code. Low-entropy IP digests are *pseudonymous*, not fully anonymous. Only on Vercel (`VERCEL=1`) is its platform-overwritten `x-vercel-forwarded-for` trusted. Outside Vercel, only `req.socket.remoteAddress` is trusted. Multiple or malformed IPs are rejected, not parsed for a purported client-controlled first hop. Missing identity uses stricter shared fallback quotas; it never disables limiting. Check proxy behavior and shared NAT cases in staging.

A PostgreSQL-clock-aligned fixed-window `INSERT ... ON CONFLICT DO UPDATE ... WHERE hits < max RETURNING` makes each quota atomic under concurrency across Vercel function instances. `(scope,key_hash,window_start)` is the primary key. A rejected increment returns no hit row and produces 429 with a database-clock `Retry-After`. Hits stop at quota. Fixed windows can allow up to twice the limit at a boundary: not a sliding-window guarantee. Multiple quotas consume sequentially and can partially count denied attempts; this cannot grant extra access.

## Initial limits

| Classification | IP quota | Other quota |
|---|---|---|
| Create room | 8 / 10 minutes; 24 / hour | — |
| Join room | 40 / 5 minutes | 8 / 5 minutes per IP+valid room code |
| Poll game (POST `get`) | 1,200 / minute | — |
| Other game mutations | 180 / minute | — |
| LiveKit POST issuance | 240 / hour | 15 / minute per valid session token |
| Failed room discovery | 12 / 10 minutes | Separate from join checks |
| Failed session authentication | 15 / 5 minutes | Separate from route checks |

These generous defaults accommodate up to four friends polling every ~550ms behind one IP (~436/min), but require measured staging adjustment. Missing-IP clients share tighter quotas: create=3, join=10, LiveKit=6, poll=180, other mutations=30 for the corresponding window. Shared IPs can still be unfairly throttled; monitor and make changes based on actual errors.

## Exact coordinator integration instructions — no shared-file changes in this PR

1. **Migration first, with separate approval:** read `hub.read_me_first`, verify `hub.apps` deckverse schema mapping and the repo's `AGENTS.md` + `SUPABASE_HUB_RULES.md`; acknowledge the safety contract, register only `deckverse.rate_limit_counters` in `hub.app_resources`, then review and apply `migrations/005_deckverse_rate_limits.sql` exclusively within the DeckVerse schema. Verify grants/RLS and `deckverse_app` write/cleanup ability, run Supabase security/performance advisors. Do not deploy middleware before its table is available.
2. **`api/game.js` (coordinator only):** import `{enforceRateLimit, recordRateLimitFailure, writeRateLimitResponse}` from `../src/server/rate-limit.js`. After POST body/allowed-action validation and obtaining the existing `db` SQL instance, but **before** dispatch to create/join/action, call `await enforceRateLimit(db,req,{route:'game',action:b.action,code:b.code,token:b.token});`. The special `GET ?health=1` must remain exempt; the game's POST `get` remains gated. Do not add extra database clients.
3. **Game failure outcomes (coordinator only):** when a real join lookup returns 404 (`readRoom` could not find an unexpired code), call `await recordRateLimitFailure(db,req,{kind:'invalid-code'});`. When game authentication returns 401, call `recordRateLimitFailure(db,req,{kind:'auth-failure'});`. Do not count unrelated 4xx (full room, started match, conflicting round, form error). These classifications come from the server outcome, not body-provided labels. If the failure counter itself rejects, handle 429. If failure-counter storage fails, return generic 503 instead of silently permitting further work.
4. **`api/livekit-token.js` (coordinator only):** import the same helpers. For valid-shape POSTs, after configuration checks but before the membership query and before signing with `AccessToken`, call `await enforceRateLimit(db,req,{route:'livekit',code,token});`. On genuine membership failure (403), call `recordRateLimitFailure(db,req,{kind:'auth-failure'});`. Keep GET's configuration probe outside the token limit. Never mint a LiveKit token if the limiter throws.
5. **Error mapping (both endpoints):** handle `if (writeRateLimitResponse(res,error)) return;` **before** generic errors. This sends HTTP 429, `Retry-After: <seconds>`, `Cache-Control: no-store`, and `{error:'Too many requests. Please try again shortly.',retryAfterSeconds:N}`. All other limiter database errors are fail-closed generic HTTP 503 (no raw SQL, token or IP echoed). The existing outer catch in game.js currently maps all non-application errors to 500, and LiveKit catches them to 503; adjust these shared paths explicitly.
6. **Staging:** check Vercel-provided IP header, room spam and invalid-code guessing, 401 floods, 429/backoff, LiveKit repeated issuance, valid mobile reconnect, same-NAT 2/3/4 players, regular refresh and ~550ms polling, multiple serverless instances and failure under DB outages. Measure p50/p95 extra UPSERT latency, DB pool pressure and expired-row backlog. Do not load-test public production.

Basic coordinator snippet (provided for integration, not committed to shared endpoints):

```js
const db = await connected();
// Existing POST body and action validation has already passed.
await enforceRateLimit(db, req, {
  route: 'game', action: b.action, code: b.code, token: b.token
});
// Run existing create / join / action logic.
```

## Storage, database permissions and monitoring

`migrations/005_deckverse_rate_limits.sql` defines only `deckverse.rate_limit_counters` plus its expiry index and RLS policy. Browser roles `anon`/`authenticated` and public access are revoked. Only `deckverse_app` receives table-scoped SELECT/INSERT/UPDATE/DELETE for UPSERT and cleanup. No security-definer function or globally shared object is introduced. Migration is **review-only and unapplied**. After approved DDL, perform the mandatory Hub registration and RLS/permission/advisor checks.

Each counter expires at the end of its window plus 15 minutes. Roughly 1 in 32 requests performs a bounded 256-row `DELETE` of expired rows using `FOR UPDATE SKIP LOCKED` and the expiry index. Cleanup failures do not bypass successful admission checks; application monitoring must report them. This limits **cleanup work**, and normally controls ongoing storage growth, but is **not a hard maximum row count**: when traffic stops, old rows persist until requests resume or separately approved DeckVerse-only maintenance runs. Do not add project-wide pg_cron or external resources without impact review.

Monitor HTTP 429 by route/scope, 503 due to limiting storage, sampled UPSERT p50/p95, connection pool utilization, counter row count, expired backlog and missing-header/NAT pressure. Do not log raw client IDs, tokens or room codes. The new table remains private in the existing Supabase Project Hub app; no other app or schema is in scope.

## Verification and remaining release gates

`node --test tests/rate-limit.test.js` was executed locally: **17/17 passed** (mock SQL adapter). Coverage includes quota thresholds, 80-way synthetic concurrency, expiry and cleanup, missing/malformed/spoofed headers, unknown identity quotas, code guessing, auth failures, shared-IP polling, LiveKit per-token/IP quotas, fail-closed storage, and HTTP 429 formatting. The existing `npm test` file glob includes the new test.

**Unverified:** real PostgreSQL UPSERT concurrency under network contention, Vercel multi-instance behavior and latency, actual browser backoff after 429, and integration into either endpoint. A mocked atomic map does not establish these properties. The migration has not been run and no Supabase data or production configuration was changed. These checks remain blocked on coordinator integration and separately authorized isolated schema deployment. This work does not resolve presence recovery, competitive fairness, physical-device LiveKit QA or Pokémon licensing.
