# DeckVerse V2 Database Migration — Independent Release Safety Audit

**Audit date:** 2026-10-20 · **Auditor:** Agent A (independent DB safety)  
**Repository:** Rishikeshsanin/addictive-themed-card-games  
**Audited integration baseline:** integration/deckverse-v2-api-wiring @ b534fcbb54870c42c0b8f51bffb180638edadfb4  
**Audit branch:** agent/a-db-release-audit · **Change scope:** this document and tests/db-migration-audit-*.test.js only.

## Readiness verdict: **NO-GO for applying V2 SQL to real Project Hub today**

The proposed migrations appear **DeckVerse-schema-scoped** and broadly compatible with the observed PostgreSQL 17.6 V1 schema, but release is blocked until all of the following are independently satisfied:

1. **Disposable PostgreSQL replay PASS, but further concurrency/parity work remains:** CI run [39452909656](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39452909656) executed both 004→005→006 runs on a new local PG cluster with preservation, permissions and RLS checks (not skipped). **Still required:** exact PG17-parity attestation, lock-contention/timeout trials, realistic concurrent counter UPSERT and end-to-end existing 2P+V2 session tests. Passing a synthetic fixture alone does not certify production.
2. **Register new resource \`deckverse.rate_limit_counters\` in \`hub.app_resources\`** using the approved Hub workflow *only in a separately authorized production change*. At audit time only DeckVerse's existing schema/tables and LiveKit resource were registered.
3. **Approve maintenance/locking plan for 004**: its \`ALTER TABLE ... DROP CONSTRAINT; ADD CONSTRAINT\` takes an ACCESS EXCLUSIVE table lock and validates all existing player rows. \`ALTER TABLE\` on rooms in 004/006 likewise acquires strong locks. Do not run this into ongoing 2P transactions without assessed lock waits, tested lock timeouts and explicit user approval.
4. **Capture and test an app-scoped recoverable backup before DDL**, plus V1 fingerprints and application smoke results. No safe data-restoration procedure has yet been executed and verified.
5. **Review corrected migration hardening** by the migration owner before approval: schema drift detection, row-bound/constraint preflight, explicit idempotency assertions and all privileges/Hub registration prerequisites must be gates (see below). This audit does not edit the migration files.
6. **Staging and postflight signoff:** dedicated deckverse_app grants/RLS checks, existing 2P session/room regression, multiroom 3/4 sessions, room-code uniqueness, atomic limiter UPSERT, heartbeat/presence and live-state compatibility, security/performance advisors; API deployment order must be coordinated.

**Nothing has been applied to the real project. No real schema/row/permission was written, no release, merge or deployment was performed.** Only read-only metadata and aggregate-count queries were executed against the known DeckVerse Project Hub app.

## Source of truth and verified live preflight (read-only)

Read \`AGENTS.md\`, \`SUPABASE_HUB_RULES.md\`, \`README.md\`, \`docs/DEPLOYMENT.md\`, \`docs/RATE_LIMITS_V2.md\`, \`docs/PRESENCE_V2.md\`, three migrations and the integration-branch server SQL paths. Followed explicit correct prerequisite: **\`SELECT * FROM hub.read_me_first;\`** — a *table*, not the nonexistent \`hub.read_me_first()\` function.

Live Project Hub ref is \`nowlwprtcnieihelqjoa\`. \`hub.apps\` confirms app #16 \`slug=deckverse\`, \`schema_name=deckverse\`, matching repository and acknowledged safety contract. Only \`deckverse\` schema, scoped app resource registration and relevant database role metadata were inspected. PostgreSQL reports **17.6** and \`hub.assert_app_scope(text,text)\` exists. These checks **do not approve production SQL execution**.

At the audit moment, DeckVerse had **112 rooms** and **184 player rows**, including **1 room with \`status='playing'\`** and **32 player rows with \`active=true\`**. These are stored-state counts, **not** proof that connections or sessions are currently online. The registered resources are \`deckverse\` (schema), \`deckverse.rooms\`, \`deckverse.players\` and \`deckverse-livekit\`. **No registration for \`deckverse.rate_limit_counters\`.** Existing \`deckverse.rooms\` has no \`player_count\`, \`host_seat\` or \`presence_version\`; \`deckverse.players\` has no \`left_at\`. Migration 004/005/006 has not modified these objects as observed.

The original constraint **\`players_seat_check CHECK (seat = ANY (ARRAY[0,1]))\`** exists by that exact name. Original rooms/players have RLS enabled and app-specific \`FOR ALL TO deckverse_app USING(true) WITH CHECK(true)\` policies. Table owner is \`postgres\`; \`deckverse_app\` has table-scoped SELECT/INSERT/UPDATE/DELETE and schema USAGE, but **rolsuper=false, rolbypassrls=false, rolinherit=false**. Role \`service_role\` has **rolbypassrls=true** and must not be used as the ordinary server application identity. \`anon\` lacks DeckVerse schema USAGE. Room code uniqueness, players' composite PK \`(room_id,seat)\`, player room FK \`ON DELETE CASCADE\`, hash lookup index and rooms expiry index were observed. No secrets or individual player data were retrieved.

## Per-migration safety and compatibility

| Migration | Verified against source/live V1 | Concerns | Decision |
|---|---|---|---|
| **004** multiplayer rooms | Adds \`rooms.player_count SMALLINT NOT NULL DEFAULT 2 CHECK IN (2,3,4)\`; expands \`players_seat_check\` from [0,1] to [0,3]. Existing 2P rooms receive 2; existing seats remain legal; PK and room codes untouched. | **ACCESS EXCLUSIVE locks**, constraint replacement and validation; \`IF NOT EXISTS\` can mask an incompatible pre-existing column. Reapplying DROP/ADD takes the lock again. Check all other seat restrictions, triggers/permissions and constraints, then prove 2/3 inserts and 4 rejection. | CONDITIONAL, NOT APPROVED |
| **005** durable limiter | Creates only \`deckverse.rate_limit_counters\` with \`(scope,key_hash,window_start)\` PK, expiry index, bounded hits, lowercase SHA-256 format, expiry check, ENABLE+FORCE RLS, app-only policy and table grants. No existing rooms/players are rewritten. | Missing **Hub resource registration**; requires existing \`anon,authenticated,service_role,deckverse_app\` roles and privileged owner/executor; \`CREATE TABLE IF NOT EXISTS\` does not verify shape; repeated DROP/CREATE POLICY is not a no-op and takes locks; project \`service_role\` bypasses RLS by design even when explicit table grants are revoked. Verify role inheritance/schema privileges rather than assuming REVOKE provides absolute secrecy. | **BLOCKED** until registration and real SQL rehearsal |
| **006** presence | Adds \`rooms.host_seat SMALLINT NOT NULL DEFAULT 0 CHECK 0..3\`, nonnegative \`presence_version BIGINT NOT NULL DEFAULT 0\`, nullable \`players.left_at\`. Original host seat 0 remains, last_seen_at/active/session hash/room state untouched. | Strong DDL locks; \`IF NOT EXISTS\` can silently accept incompatible existing columns; no FK tying \`host_seat\` to live occupied player (enforce authoritative locked room transaction). Existing 2P code must retain fallback and prove host controls, unknown historical timestamps, heartbeat and expiration behavior. | CONDITIONAL, NOT APPROVED |

**Order:** 004 -> 005 -> 006. 004 must precede creating live 3/4-player rooms, and 006 host persistence requires the 004 expanded seat constraint. 005 can technically create its table independently, but the coordinated rollout should use the published order with a stop/verify gate after each migration. Each SQL file calls \`hub.assert_app_scope('deckverse','deckverse')\`; migration execution requires the privileged migration identity, not the restricted \`deckverse_app\` runtime role. **Do not set search_path to public or run any shared global grants.**

**Idempotency review (source-level only):** \`004\` replays column additions harmlessly only when types/defaults match, but deliberately drops/re-adds the named seat constraint on every run. \`005\` replays CREATE table/index and drop/create policy, but can hide an incompatible table/column or inherited permission; \`006\` uses IF NOT EXISTS but does not validate pre-existing definitions. These are repeatable SQL *forms*, not yet proven a successfully idempotent deployed migration. A failed statement must abort the relevant entire file transaction; use a migration tracking ledger and do not silently skip errors.

**Concurrency:** \`ADD COLUMN ... DEFAULT 2/0\` with constant defaults is normally metadata-only on modern PostgreSQL, avoiding per-row backfill, but its \`ACCESS EXCLUSIVE\` lock still blocks reads and writes while held. Adding a CHECK can scan rows; 004's constraint drop/add unconditionally repeats this work. Configure and measure \`lock_timeout\`, \`statement_timeout\` and transaction duration in rehearsal/staging; schedule one DeckVerse-only DDL operator, inspect \`pg_stat_activity\`/relation locks for **DeckVerse objects only**, and fail without partial rollout if the lock cannot be obtained promptly. Never set unbounded lock waits during live play.

## Reproducible, strictly disposable PostgreSQL rehearsal

**File:** \`tests/db-migration-audit-rehearsal.test.js\`. Included automatically by existing \`npm test\` glob; run directly with \`node --test tests/db-migration-audit-rehearsal.test.js\`. It performs a static scope/DDL check on any host. When \`initdb\`, \`pg_ctl\`, \`psql\` are available and the user is **non-root**, it creates a random temporary directory, starts a fresh Postgres instance using **Unix socket only (\`listen_addresses=''\`)**, creates *fictional* V1 DeckVerse rooms/players and dummy roles, supplies a **mock local Hub assertion function**, runs **each actual checked-in SQL file in its own transaction twice**, and tests:

- Legacy 2P rooms/players \`md5\` row fingerprint unchanged across both passes; original \`state\`, codes, token hashes, flags and last_seen_at stay the same.
- \`player_count=2\`, \`host_seat=0\`, \`presence_version=0\`, \`left_at IS NULL\` for original data.
- Expanded seat constraint accepts seats 2/3 and rejects seat 4; original PK still exists; exact seat constraint present once.
- New rate-limit expiry index, enabled/forced RLS, single expected app policy, CRUD grants to deckverse_app, and absence of ordinary browser-role SELECT privileges; actual app-role INSERT works.
- Cleanup stops the disposable cluster and removes its temporary directory; no real project connection, production DATABASE_URL or Hub role/credential is used.

**Execution status:** this agent's container has **no PostgreSQL server tools or Docker** and cannot reach package mirrors. Local Postgres rehearsal **not executed here**; static analysis **does not count** as a green runtime gate. The test is designed to report a visible **SKIP**, not invent success. If a non-root disposable PostgreSQL runner is available in CI, verify the actual CI step executed this test rather than skipped it. Test's synthetic schema and stubbed \`hub.assert_app_scope\` cannot verify actual Hub internals; use live read-only metadata separately, as done above.

**Minimum additional rehearsal gates for coordinator/Agent F:** PG 17 reproduction, intentionally malformed existing columns/constraints (must hard-fail), artificially held room/player locks (must time out without any half-migration), 100+ concurrent limiter UPSERTs under deckverse_app, legacy 2P room API integration, V2 3/4 join/host/presence, repeat execution, and postflight database schema diff. If CI lacks binaries, provide an actual ephemeral PostgreSQL service in a coordinator-approved workflow. No production connection strings in test runs.

## Preflight checklist — stop if any item fails

- [ ] Obtain **separate explicit user approval** after DB PR reviews. Confirm no active cross-application dependency and maintenance window.
- [x] Read Hub guidance via \`SELECT * FROM hub.read_me_first;\` and check matching registered DeckVerse app, schema and safety-contract acknowledgement (read-only).
- [x] Read-only compare existing rooms/players constraint names, PK/FK/unique indexes, app privileges/RLS and PG version; verify source-compatible 2P defaults.
- [ ] Coordinator verifies all PR dependencies and that 004/005/006 reviewed SHA is the exact approved SQL. Ensure other workers have no simultaneously running DDL.
- [ ] Authoritatively register only the new DeckVerse rate-counter table through Hub's documented registration workflow **after separate approval**; verify registration before executing 005.
- [ ] Take a **recoverable app-scoped backup** of \`deckverse.rooms\`, \`deckverse.players\` and schema DDL (including policies, indexes, grants and dependent objects), store encrypted with restricted access and retention, test a full restore in another disposable database. Full Project Hub PITR is not an excuse to revert unrelated apps.
- [ ] Establish row counts (including active/playing by status), constraint/index manifests, RLS/role ACL snapshots, and privacy-preserving digest of existing room/seat/code/session hash/state data. Do not output raw session hashes or room codes to logs. Preserve any still-active room.
- [ ] Confirm no incompatible existing 004/006 columns or 005 table and that \`players_seat_check\` has exactly the expected old definition; audit other CHECKs/triggers that may still restrict seats to [0,1].
- [x] **Executed** disposable PG migration double-replay and legacy data/RLS/ACL assertions in CI (94/94 tests passed, no skip: [run 39452909656](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39452909656)).
- [ ] Verify **PostgreSQL 17 parity**, explicit lock-wait failure safety, real concurrent limiter UPSERTs, and full V1/V2 API integration; SQL owner approves.
- [ ] Verify migration user can run Hub assertion, ALTER old tables, CREATE table/index, CREATE POLICY and GRANT without privileged actions outside DeckVerse.
- [ ] Freeze release at old API while SQL applies. Configure short \`lock_timeout\`/bounded \`statement_timeout\`; execute one migration at a time in an explicit transaction with ON_ERROR_STOP. Never deploy V2 API before DB postflight.

## Approved-only rollout sequence (NOT EXECUTED)

1. Reconfirm app identity/registered resources and newly approved SQL checksums. Document operator, backup identifier, change window, rollback captain and old API commit SHA.
2. **004** in its own short bounded transaction. Abort on lock failure. After commit, check old room/player hashes/codes/state/permissions remain stable, all existing rooms report \`player_count=2\`, and new 0..3 seat CHECK is valid.
3. **005** after approved \`hub.app_resources\` registration. Confirm exactly one counter table, index and RLS policy; test with restricted deckverse_app that legitimate UPSERT works and anon/authenticated cannot access. Do not expose hashed actor keys in audit output.
4. **006** last. Confirm host defaults to seat 0 for existing rooms, initial version 0, no old departure timestamps were fabricated; \`last_seen_at\` and active status unchanged.
5. Run Supabase security + performance advisors after meaningful DDL/policy changes; ensure there are no new DeckVerse-specific findings and no changed grants outside \`deckverse\`.
6. Verify old 2P create/join/ready/select/reveal/rematch, old tokens and refresh; verify 3P/4P fresh rooms, host transfer, heartbeat and limiter using approved staging/isolation *before* V2 public deploy. Compare original saved room/session snapshots. Require actual stable game/full-match results, not mocked unit tests.
7. Obtain coordinator and owner signoff, then separately approve/deploy app API/client. Monitor errors, latency, locked queries, expired counter cleanup, restoration progress, 429/503, stalled rounds and presence changes for the agreed observation period.

### Safe postflight SQL examples (read-only; deckverse scoped)

~~~sql
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='deckverse'
  AND table_name IN ('rooms','players','rate_limit_counters')
ORDER BY table_name,ordinal_position;

SELECT conrelid::regclass::text AS relation,conname,pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN ('deckverse.rooms'::regclass,'deckverse.players'::regclass,
                   'deckverse.rate_limit_counters'::regclass)
ORDER BY relation,conname;

SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='deckverse';

SELECT room.player_count,count(*) FROM deckverse.rooms room GROUP BY room.player_count;
SELECT host_seat,presence_version,count(*) FROM deckverse.rooms
GROUP BY host_seat,presence_version;
SELECT count(*) FILTER (WHERE left_at IS NOT NULL) AS explicit_leavers
FROM deckverse.players;
~~~

The new rate-counter table does not exist **before** 005; do not run a regclass-dependent postflight query until after checking its existence. Avoid printing room codes/tokens or per-user rows.

## Rollback and emergency response

**Before commit:** \`ROLLBACK\` the *currently executing* migration transaction if any check or lock fails. Preserve 2P app traffic on the old code and investigate before retrying. PostgreSQL transactional DDL can roll back these statements, but **a committed migration cannot be rolled back by closing another transaction**.

**After 004/006 committed:** For an immediately broken API, first **roll back the application deployment** to the verified 2P commit; added optional columns/defaults and widened seat CHECK are intended to be backwards compatible. **Do not immediately drop columns, tighten seat constraint or delete rooms**—new 3/4 seats, host transfers or state written since deployment might be destroyed or invalidated. Block new V2 room creation while investigating, check whether any 3/4 rows exist, then design an explicit data-preserving revert with coordinator approval.

**After 005 committed:** Disable/roll back V2 limiter middleware in the app if it fails closed, keeping existing original game code operational; preserve counter records and investigate. If table cleanup/removal is necessary, follow retention/privacy policy and separate approval. **Never blindly \`DROP TABLE\` in production or remove shared roles.**

**Data corruption or loss:** stop DeckVerse writes; retain forensic snapshots and migrate only with the pre-tested app-scoped restore/merge procedure. Do not restore the *entire* multi-tenant Project Hub (which would overwrite other applications) without separately approved project-wide recovery governance. No blanket schema reset, cross-app rollback, global role change or PITR invocation is authorized here.

**Rollback acceptance:** historical room/player row fingerprints, code uniqueness, PK/FK, active sessions, old 2P API health, login/session continuity and absent cross-schema changes are verified after whichever safe action is taken. Report incident timeline and new release gate before resuming.

## Coordinator handoff — required responsible-agent corrections

- **Migration owner (Agent F):** make the 004 seat constraint adjustment demonstrably safe for repeated execution and blocked locks (review \`NOT VALID\` / later \`VALIDATE CONSTRAINT\` when appropriate), add explicit existing-column-type/default drift guards and automated schema assertions for 004–006; do not change target DDL without approval. Show whether the exact existing index/constraint set was preserved. Ensure 005 resource is registered only through an approved Hub workflow.
- **API coordinator:** release sequencing, fallback for old rooms, host authority and authenticated heartbeat, timeouts, 2P legacy behavior and app-only DB identity. Do not make schema assumptions before postflight succeeds.
- **Integration-test agents:** real disposable PG17 2/3/4 full-room API tests, limiter concurrency, presence transfer/reconnect, old-token conservation and lock contention (not just mocks); check existing automated CI jobs actually execute PostgreSQL and don't silently skip.
- **Release owner:** separate explicit approval to operate on the real Hub, encrypted recoverable app-scoped backup and tested restore, RLS/grants/security advisor and zero unintended cross-schema changes.

**Final release disposition: NO-GO for real DB migration.** Review-only draft PR can be assessed and merged by the coordinator at their discretion; none of its code authorizes migrations, production deployment, other apps, or changes to the previous fairness PR #6.
