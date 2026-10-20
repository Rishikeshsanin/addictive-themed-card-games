# DeckVerse V2 — Final API Security Release Assessment

**Branch:** `agent/b-final-security-hardening` (base: `integration/deckverse-v2-release-hardening`)  
**Scope:** `src/server/rate-limit.js`, `tests/rate-limit.test.js`, `tests/db-rate-limit-postgres.mjs`, and this document.  
**Safety:** No production Supabase writes, migrations, deployment, LiveKit credentials, or shared API edits. Review and merge separately.

## Threat model and confirmed fixes

### SEC-01 — equivalent IPv6 strings could evade per-IP quotas (fixed)
Previously `normalizeIP` used `isIP(ip)` plus lowercasing. Alternate IPv6 representations (e.g. `2001:0DB8:0:0:0:0:0:1` versus `2001:db8::1`) resulted in different hashed identities and different durable counters. IPv4-mapped IPv6 could similarly differ from native IPv4. This enables a visitor to reset rate limits by changing the representation when an upstream proxy or runtime permits it.

The new limiter canonicalizes IPv6 using WHATWG URL parsing and converts IPv4-mapped IPv6 to dotted decimal. Existing valid IPv4 continues unchanged. This avoids counter duplication and maintains existing policies. Regression tests cover both real PostgreSQL and local unit cases (the latter run in standard CI). Existing PostgreSQL bucket data may represent old spelling until its natural expiry; this is not a backward-incompatible migration.

### SEC-02 — incorrect proxy trust assumption (hardened, deployment verification pending)
The previous limiter used `x-vercel-forwarded-for` when `VERCEL=1` and described it as an explicitly overwritten platform-owned header. The official [Vercel request header documentation](https://vercel.com/docs/headers/request-headers#x-forwarded-for) **specifically says Vercel overwrites `x-forwarded-for` to prevent IP spoofing**; `x-vercel-forwarded-for` is described as normally identical but potentially differing when a proxy is on top. We now select `x-forwarded-for` **only when** the server's `VERCEL=1` deployment flag is true. Outside Vercel, only `req.socket.remoteAddress` is used. We never trust `Forwarded`, `x-real-ip`, `x-vercel-forwarded-for`, client nicknames, arbitrary user-submitted headers, or IP lists.

Malformed, comma-separated or duplicated `x-forwarded-for` values are rejected into the limited shared-unknown bucket (not accepted as a new client identity). `req.rawHeaders` is checked for multiple same-name headers if supplied; `headers` arrays are rejected.

**Residual deployment assumption:** `VERCEL` must be set by the server platform, not by the request; Vercel must actually overwrite the header on all intended domains/routes. Direct origin bypass, custom reverse-proxy or Trusted Proxy configurations require a separate security review. Local tests cannot prove production header provenance; run a controlled, low-volume Vercel staging header check before release. Do **not** treat an attacker-supplied forged `x-forwarded-for` value as trusted on a custom/non-Vercel host simply because its environment mimics Vercel.

## Existing durable protections reconfirmed by inspection

- PostgreSQL atomic `INSERT ... ON CONFLICT DO UPDATE WHERE hits < max` with a composite primary key `(scope,key_hash,window_start)` prevents lost increments across serverless instances. Database time, not JavaScript time, determines windows and `Retry-After`.
- IP-based general limits: 8 creates/10min and 24/hour; 40 joins/5min; 1,200 reads/min; 180 mutations/min; 240 LiveKit token requests/hour. Additional 8 joins per IP+code per 5min and 15 LiveKit requests per session per minute; 12 failed-code guesses/10min and 15 failed-auth requests/5min.
- Unknown trusted IPs share stricter quotas; missing identifiers never cause an unlimited allowance. This intentionally trades potential false positives for no spoofed-origin bypass.
- HTTP 429 provides `Retry-After` and sanitized JSON. Limiter database errors propagate and **must map to HTTP 503 without running the protected game or LiveKit operation**.
- `deckverse.rate_limit_counters` has forced RLS, app-role-only grants, primary and expiry indexes; `cleanupExpired` limits each pass to at most 256 records by default, uses `FOR UPDATE SKIP LOCKED`, and runs opportunistically (~1/32 admitted/denied protected calls). Denied calls cap counters but still perform SQL; volume is not a hard-bounded guarantee during ongoing abuse or idle periods.

## Real PostgreSQL and CI evidence: distinguish previous from current

[Earlier PR #16 disposable PostgreSQL CI run #39452856445](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39452856445) passed 11/11 on PostgreSQL 16, **before the changes in this PR**. It measured 200 requests over eight independent pools: 31 allowed, 169 denied, persisted hits 31; p95 211.75ms under burst contention (measurement from the earlier comparable run). A same-IP four-player cohort performed 361 polling calls with no 429, and observed p95 1.36ms for the limiter. It deleted 700 expired entries in 256/256/188 bounded batches; with 12,000 synthetic counter rows PostgreSQL selected the expiry index, a 0.199ms EXPLAIN ANALYZE operation in that environment.

The updated `tests/db-rate-limit-postgres.mjs` preserves 200-way concurrency and adds real-SQL regression assertions for equivalent IPv6 and mapped IPv4 forms, for canonical Vercel header handling and duplicate header rejection. **The repository's existing DB-specific workflow is still scoped to PRs targeting `integration/deckverse-v2-api-wiring`. A PR targeting the user's required `integration/deckverse-v2-release-hardening` branch does not trigger that workflow automatically.** Its modification is outside this agent's ownership. Thus the previous run must **not** be presented as new-commit real PostgreSQL evidence. The coordinator should extend that workflow's PR base filter on a separately owned change, or manually dispatch the existing `workflow_dispatch` job using this PR's exact head SHA and attach logs.

**Current PR verification:** [DeckVerse CI #39459210613](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39459210613) passed **95/95 Node unit tests**, including the new header trust and canonicalization regressions. [Disposable PostgreSQL multiplayer CI #39459210721](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39459210721) passed under the current PR with the updated limiter loaded in actual game API flows: PostgreSQL schema 004/005/006 applied **only to the isolated CI database**, 2P/3P/4P SQL-backed full matches, reconnect/refresh, multiway turn/pot checks, and browser interactions. The game API's local CI measurements include 219 GET calls (p95 3.5ms), 37 joins (p95 4.9ms), 40 heartbeats (p95 4.9ms). These figures cover the **whole local API action**, not pure limiter operations, and should not be treated as Vercel production latency.

**New-code 200-way rate-limit concurrency suite:** not rerun at this head. The dedicated database rate-limit workflow still has a PR base filter on the old API-wiring branch and did not start for this PR; the last explicitly measured 200-way burst is earlier PR #16. The new `db-rate-limit-postgres.mjs` canonical-identity checks are committed but pending that specific workflow. This is a deliberate release gate, not an implied pass.

## Coordinator-owned endpoint review — patches requested, not made

1. `api/game.js`: keep `enforceRateLimit` before game create/join/mutations, count genuine 404 room guesses and 401 auth failures, map `RateLimitError` to 429 before generic 503, preserve `GET health` behavior and prevent credentials from appearing in responses or logs. The current route's early invalid-body 400 handling happens **before** the durable limiter, so malformed-body request storms bypass SQL quotas: request a tested Vercel WAF/edge rule or separate cheap ingress limit before JSON validation; avoid making normal polling more expensive.
2. `api/livekit-token.js`: current shape validation occurs before rate limiting; malicious malformed token bodies can be sent at high frequency without SQL charge. Apply ingress flood controls. Keep database membership check and quotas strictly before signing; never call LiveKit Cloud when the limiter rejects. No real LiveKit keys should be used in regression tests.
3. If any proxy setup changes (Verified Proxy/Enterprise), document the client IP chain and repeat the spoofing checks; do not simply parse the first untrusted `X-Forwarded-For` value. Header trust is part of infrastructure authentication, not a generic parsing rule.
4. Monitor `429` by scope, `503` when the database is unavailable, p95 quota latency at common 2/3/4-player polling rates, high-cardinality growth and expired-row backlog. Add upstream filtering for abuse that would otherwise create PostgreSQL hot-row contention. Do not log raw IPs or tokens.

## Readiness verdict

**Security module: hardened and ready for coordinator review, subject to CI. Full production V2: NO-GO until remaining gates pass.** Even after the unit test succeeds, obtain new real PostgreSQL CI evidence for this commit, confirm Vercel overwrites `x-forwarded-for` at the actual deployed boundary and any proxy configuration, validate normal shared Wi-Fi/mobile reconnect and room joins, and ensure the coordinator's early-request flood controls are in place. Do not apply real Hub migrations or deploy based on this PR alone.

Other independent DeckVerse release gates (database migration approval, complete multiplayer QA, presence, IP rights) are outside this security branch.
