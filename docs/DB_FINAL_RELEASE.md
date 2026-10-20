# DeckVerse V2 — final controlled database release safety dossier

**Branch:** `agent/a-final-migration-safety`  
**Target:** `integration/deckverse-v2-release-hardening`  
**Audited baseline:** `4e74e8d0307382f6de09bb5afa503a7def6ec1fe`  
**Release verdict:** **NO-GO for the live Hub until explicit approval, a restore drill using an authorized app-scoped real backup in isolated staging, PostgreSQL 17 compatibility confirmation, and final integration signoff**. Approval of this draft PR **does not** authorize live SQL or deployment.

## Boundaries and evidence

Read `AGENTS.md`, `SUPABASE_HUB_RULES.md`, repository README, previous `docs/DB_MIGRATION_RELEASE_AUDIT.md` and all three actual migration files. In this session, queried **`SELECT * FROM hub.read_me_first`** (a table) and read-only Hub metadata: `hub.apps.slug=deckverse` has `schema_name=deckverse` and acknowledged repository safety contract; the only registered DeckVerse app resources as observed were `deckverse` schema, `deckverse.rooms`, `deckverse.players`, and `deckverse-livekit`. `hub.app_resources` has a unique constraint on **(`resource_type`,`resource_name`)**; columns `app_id`, `resource_type`, `resource_name`, `resource_schema`, `is_shared`, `notes`; permitted resource types include `table` and `other`. No new resource was registered.

Prior independent PR #20 verified the real DeckVerse legacy schema and Postgres **17.6** using **read-only** queries (actual rooms, sessions and 0/1 constraint). Its disposable PG test [run 39452909656](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39452909656) passed two migration replays preserving fictional legacy rows; that run did **not** exercise backup/restore or held locks. This branch extends rather than rewrites that evidence. No Supabase mutation, production API modification, merge or deployment was undertaken.

## Revised migrations — actual proposed code, no live execution

**004**: bounded session `lock_timeout=3s`, `statement_timeout=30s`; rejects missing V1 tables and incompatible existing `player_count` or `players_seat_check`; adds 2/3/4 room size with legacy `DEFAULT 2`; changes exact legacy seat CHECK **once** to `0..3 NOT VALID` then `VALIDATE CONSTRAINT`; on replay leaves the validated widened constraint untouched. Adds two explicit **DeckVerse-only, SECURITY INVOKER triggers** backed by `deckverse.guard_room_capacity()`: (a) player seat insert/seat move locks the parent room row before validating `0 <= seat < player_count`; (b) decreases to `rooms.player_count` reject capacity below any occupied seat. This prevents seat 2 entering an old two-player room even if the global seat constraint allows 0..3. Both triggers are conditional-create and checked on replay. The function uses only fully-qualified `deckverse.*` objects, sets safe `search_path=pg_catalog`, and revokes direct PUBLIC function execution. The runtime role must retain existing SELECT/UPDATE on rooms and insert/update on players, *not* new cross-schema privileges.

**005**: retains original rate-limit counter contract, PK and expiry index. Repeated application **does not DROP/CREATE an existing RLS policy**; it creates the policy only when absent and asserts that no extra or unexpectedly permissive policies exist. Verifies five exact columns/types, constraints, required index, ENABLE+FORCE RLS, app-only CRUD grants and absence of SELECT to anon/authenticated/service_role. Any incompatible pre-existing table or index causes transaction failure instead of a misleading `IF NOT EXISTS` success. Enforced session lock/statement timeouts. Note that Supabase project-level service roles can have BYPASSRLS independently of table privileges; never give project admin credentials to the app.

**006**: verifies 004 already ran, rejects incompatible existing `host_seat`, `presence_version` or `left_at`; defaults 0,0 and NULL preserve historical two-player rows without touching original `last_seen_at`, tokens, codes, deck JSON or `active`. Validates exact types/defaults/non-null constraints and presence CHECKs. Enforced lock and statement timeouts.

**PostgreSQL transactional requirement:** Apply each **entire file** via a single explicit transaction (for `psql`, use `-X -v ON_ERROR_STOP=1 --single-transaction -f`). The SQL's `SET` / `RESET` timeouts are in the dedicated operator session; do not run in a pooled application session. A failure mid-file must roll back the **whole file**. No same-transaction application/API cutover until postflight gates pass.

### Lock and compatibility tradeoffs

Adding/altering columns, triggers and dropping the old seat CHECK still require brief **ACCESS EXCLUSIVE** relation locks. `NOT VALID` followed by `VALIDATE` avoids holding the strongest lock for the entire validation scan, but does not eliminate lock acquisition during schema changes; 3-second `lock_timeout` prevents indefinite waiting. Parent row `FOR UPDATE` in the player insert trigger follows the current API's parent-room-before-player lock order. Review **other SQL writers**, on-conflict reactivation, cleanup and background tasks for contrary lock ordering before shipping. `UPDATE OF room_id,seat` means updates to readiness/heartbeat alone do not take the additional trigger lock. The room-capacity guard doesn't replace the server's count, authentication and simultaneous-join checks. A 2P lobby with inactive seat reservations may also require a future product decision on whether to reuse an old seat. Restored V1 schema is intentionally independent of these new guards.

## Exact scoped Hub registration — documentation ONLY; DO NOT RUN without approval

The SQL below is a **proposed, separate, explicit authorized operator step** before applying new 004/005 objects. It is **not called by tests against Supabase** and **not executed in this assignment**. The `other` type is used for internal trigger/function registrations because the registered `rpc` type would incorrectly describe a function returning `trigger` as a callable client RPC. The owner must verify the Hub's resource-naming conventions before approval.

~~~sql
-- CONTROLLED LIVE CHANGE ONLY AFTER SEPARATE EXPLICIT OWNER APPROVAL.
-- Operator is authorized for Hub registration, not deckverse_app runtime.
BEGIN;
SELECT hub.assert_app_scope('deckverse','deckverse');
DO $audit$
BEGIN
 IF (SELECT count(*) FROM hub.apps
     WHERE slug='deckverse' AND schema_name='deckverse'
       AND safety_contract_acknowledged_at IS NOT NULL) <> 1
 THEN RAISE EXCEPTION 'DeckVerse Hub registration/safety prerequisite failed'; END IF;
END $audit$;
INSERT INTO hub.app_resources(app_id,resource_type,resource_name,resource_schema,is_shared,notes)
SELECT a.id,r.resource_type,r.resource_name,'deckverse',false,
       'DeckVerse V2 owned resource; approved release registration'
FROM hub.apps a
CROSS JOIN (VALUES
  ('table','deckverse.rate_limit_counters'),
  ('other','deckverse.guard_room_capacity()'),
  ('other','deckverse.players.deckverse_players_capacity_guard'),
  ('other','deckverse.rooms.deckverse_rooms_capacity_guard')
) AS r(resource_type,resource_name)
WHERE a.slug='deckverse' AND a.schema_name='deckverse'
  AND a.safety_contract_acknowledged_at IS NOT NULL
ON CONFLICT (resource_type,resource_name) DO NOTHING;
DO $verify$
BEGIN
 IF (SELECT count(*) FROM hub.app_resources r JOIN hub.apps a ON a.id=r.app_id
     WHERE a.slug='deckverse' AND a.schema_name='deckverse'
       AND r.resource_schema='deckverse' AND r.is_shared=false
       AND (r.resource_type,r.resource_name) IN (
         ('table','deckverse.rate_limit_counters'),
         ('other','deckverse.guard_room_capacity()'),
         ('other','deckverse.players.deckverse_players_capacity_guard'),
         ('other','deckverse.rooms.deckverse_rooms_capacity_guard'))) <> 4
 THEN RAISE EXCEPTION 'Missing or cross-app collision on registration; rollback'; END IF;
END $verify$;
COMMIT;
-- READ ONLY POST-CONFIRMATION, app scoped:
SELECT r.resource_type,r.resource_name,r.resource_schema,r.is_shared
FROM hub.app_resources r JOIN hub.apps a ON a.id=r.app_id
WHERE a.slug='deckverse' AND r.resource_schema='deckverse'
ORDER BY r.resource_type,r.resource_name;
~~~

`ON CONFLICT` without reassignment cannot steal another app's registration; the guarded count then rejects any collision. **No unscoped Hub resource delete** is ever appropriate. Registration itself is an explicitly approved Hub-write step, and an earlier approval for repo changes does NOT count. Confirm Hub prefers pre-registration of not-yet-created table/function/trigger resources as part of the same change window.

## Executable disposable PostgreSQL release rehearsal

**Test:** `node --test tests/db-final-release.test.js` (also included in `npm test`). Uses `initdb`, `pg_ctl`, `psql`, `pg_dump`, `pg_restore` from the local executable PATH/standard versioned directory. It must run as **non-root**. Otherwise it visibly **SKIPs**, and cannot satisfy this gate. It creates a random temp local-only PostgreSQL instance (`listen_addresses=''`, UNIX socket only, TCP rejected), fictional legacy rooms, codes, hashed tokens, RLS/roles and a local-only `hub.assert_app_scope` stub. It **never uses a Supabase URL/secret**.

Measured checks run only against that throwaway instance:
1. Compute a deterministic digest of old room/player columns; take `pg_dump -Fc --schema=deckverse` **before** migrations.
2. Run actual 004, 005, 006 as transactionally isolated files **twice**; fingerprint and legacy row counts must remain identical after each pass. Capture the ephemeral server version.
3. Exercise new 2/3/4 capacity triggers, rejecting cross-room seat overflow, invalid seat 4 and unsafe room downsizing; verify RLS/grants and an app-role limiter insert.
4. Hold an artificial session lock on `deckverse.players`; attempt 004 in another transaction; require a **3-second lock timeout**, no stuck migration or unintended data change.
5. Restore the backed-up **pre-migration V1 snapshot** into a distinct newly created disposable database (`deckverse_restore`) via `pg_restore`, never the source DB. Compare the *exact* original room/player digest, original 0/1 seat constraint, counts and absence of V2 tables. This proves a realistic schema+data restore in that fixture, not a production restore procedure or live-PITR guarantee.
6. Always stop the disposable server and remove temporary backups/data in a `finally` block; no database artifacts leave the runner.

The older test `tests/db-migration-audit-rehearsal.test.js` independently verifies source preservation; **both executed** in [DeckVerse CI run 39460320712](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39460320712): **96 tests passed, 0 failed, 0 skipped**. The runner reported **PostgreSQL 16.15 (Ubuntu 16.15-1.pgdg24.04+2)** and emitted `DISPOSABLE_BACKUP_RESTORE_PASS`, after applying 004/005/006 twice and verifying V1 restoration against the pre-migration original-row digest. The room-lock rehearsal exercised the bounded lock timeout. This is real PostgreSQL behavior in a fictional local cluster, **not a restore of live Supabase data**.

Two independent disposable PostgreSQL 16 lanes also passed on the identical migration commit: [real multiplayer/API/mobile-browser QA run 39460320725](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39460320725) completed organic 2P/3P/4P API/SQL full matches (133/72/216 accelerated rounds) and SQL-backed Chrome 2P/3P/4P mobile-browser lobby/reveal/reconnect flows; [presence validation run 39460320730](https://github.com/Rishikeshsanin/addictive-themed-card-games/actions/runs/39460320730) passed **15/15** tests, zero skipped. These are synthetic/disposable tests, **not** verification against the actual PG17.6 Hub, physical phones, or a copied production dataset.

## Preconditions: exact controlled deployment checklist

- [ ] **Separate explicit authorization** from the user for any real Hub metadata write, DeckVerse schema DDL, production API change and scheduled downtime. This PR and CI success are not authorization.
- [x] Read Hub read-me table and verified correct repo safety contracts/app mapping in a read-only session. No Hub writes.
- [ ] Final reviewer checks the **approved SQL file checksums**, dependencies, provenance, current live PG version, room/player row counts, indexes, triggers, CHECK names/defaults, RLS, grants, and orphaned sessions via **DeckVerse-only SELECTs**.
- [ ] Confirm original V1 `players_seat_check` normalized definition matches the expected 0/1 form; no duplicate/incompatible column, policy, trigger or unconstrained player seat exists. The new scripts **fail closed on schema drift**.
- [ ] Confirm all DeckVerse SQL writers follow consistent parent room → player lock order, and reviewer approves trigger privilege/schema-registration implications. Test 2P/3P/4P concurrent join, reactivation and host transfer against this exact migration commit.
- [ ] Schedule a short low-traffic migration window. Maintain old API until schema and postflight pass, freeze other migrations; set dedicated migration role with restricted review, not runtime `deckverse_app`.
- [ ] Obtain scoped custom-format **`pg_dump -Fc --schema=deckverse`** backup of *real DeckVerse-owned* data/DDL only, securely encrypted off-host with strict access/retention, and **test restore in a separate isolated database**. Backup must include restored indexes/triggers/policies/grants as appropriate. Document checksum, operator, recovery time and export timestamp. Hub registration metadata needs its own read-only snapshot; don't attempt a cross-app Hub restore.
- [ ] Confirm the new app-owned table/function/trigger resources are **registered** via the exact separately authorized Hub procedure above (no cross-app names/objects).
- [ ] Require **executed, passing disposable PostgreSQL backup+restore rehearsal**, bounded lock contention, idempotence, legacy digest and role/RLS checks; record exact PG version and any limitations.

### Controlled execution sequence (never run by this agent)

1. Record existing production API revision and original resource IDs; protect/backup DeckVerse-only records, stage rollback captain, use an approved **dedicated** migration connection (no application pooled runtime).
2. Validate the approved Hub resource registration separately as above. **Stop** on unresolved resource collision, privilege or schema mismatch.
3. Run **004** via an atomic session/transaction with 3-second lock wait. Verify legacy rooms default to 2, 0..3 seat restriction, new cross-table capacity trigger in 2P/3P/4P rooms, no code/hash/state changes.
4. Run **005** atomically; confirm counter PK/index, FORCE RLS, one app-only policy and CRUD grants to `deckverse_app`, and no anon/authenticated/service_role table SELECT. Test 80–200 concurrent UPSERTs in an approved isolated environment first.
5. Run **006** atomically; confirm original host seat 0, version 0, `left_at IS NULL` for legacy rows, all original `last_seen_at` and status preserved.
6. Run Supabase security **and** performance advisors after each meaningful schema/policy change. Require no newly introduced DeckVerse-specific findings. Check privileges and registered resources remain DeckVerse-only.
7. Exercise existing **real 2P sessions**, room-code joins and completed matches, then full 3/4-player join/start/turn/rematch, rate-limit denial/retry and host-loss/reconnect in a safe staging window. Verify 2P sessions and state before switching API traffic.
8. Obtain signoff from coordinator and owner before any V2 API release. Monitor 429/503 rates, lock waits, counter expiry, presence write errors, increased latency, sessions and public access.

### Exact operator commands — template only, not executed on real Hub

~~~bash
# Dedicated, approved, TLS-authenticated DeckVerse migration connection only.
# Do not print/export DATABASE_URL in a CI artifact, issue or chat.
pg_dump --schema=deckverse --format=custom --file=deckverse-v1-before-v2.dump \
  --dbname="<APPROVED_MIGRATION_CONNECTION>"
sha256sum deckverse-v1-before-v2.dump
# In a separate, isolated, disposable database (NEVER the Hub):
pg_restore --dbname="<DISPOSABLE_RESTORE_CONNECTION>" \
  --no-owner deckverse-v1-before-v2.dump

psql -X -v ON_ERROR_STOP=1 --single-transaction \
  --dbname="<APPROVED_MIGRATION_CONNECTION>" -f migrations/004_multiplayer_rooms.sql
psql -X -v ON_ERROR_STOP=1 --single-transaction \
  --dbname="<APPROVED_MIGRATION_CONNECTION>" -f migrations/005_deckverse_rate_limits.sql
psql -X -v ON_ERROR_STOP=1 --single-transaction \
  --dbname="<APPROVED_MIGRATION_CONNECTION>" -f migrations/006_deckverse_presence.sql
~~~

Only the **readiness-approved future operator** may choose/use the real connection strings. Running these commands without separate explicit user approval is prohibited.

## Rollback and recovery

**Uncommitted DDL:** any script statement/lock/policy failure rolls back that entire transaction; return to V1 without partially adding columns/triggers.

**After committed migrations, before V2 app deploy:** continue serving old 2P API, verify legacy sessions. Additive columns remain safe to leave in place. Do not blindly remove the 004 seat widening, triggers or original room data.

**After V2 has written rows:** first roll back **the application** to its prior verified version and halt *new* 3/4 sessions, while preserving all existing room state; do not narrow seats or DROP rate-limit table. New multi seats/host changes may make schema downgrade unsafe. Investigate and stage a data-preserving correction before requesting separate cleanup authorization.

**Recoverable data loss:** stop DeckVerse writes, preserve forensic evidence, restore the **encrypted DeckVerse-only dump into a separate isolated database** and compare PK/FK/session hashes/room codes/state and timestamps; then formulate an approved per-app reconciliation plan. **Never restore the whole Project Hub / shared PITR snapshot as an automatic rollback**: it would endanger unrelated apps. Observe retention/privacy policy for backups and resource registry cleanup. There is no automatic destructive rollback SQL.

**GO requires all gates:** real executed disposable PostgreSQL rehearsal plus PG17 compatibility, recoverable restore, lock and schema idempotency, accurate Hub registration, signed-off 2/3/4 API and role/RLS tests, verified backups and **separate explicit live-change approval**. Without these: **NO-GO**. No SQL has been applied or registered in the live Supabase Hub by this task.
