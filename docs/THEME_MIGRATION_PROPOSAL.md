# DeckVerse Round 4 — Migration 007: immutable room theme (review-only proposal)

**Source baseline:** integration/deckverse-v2-theme-preview-20261020 at \`c3d58abd7fcba152b92df1ffda57fedd4049c74e\`  
**Agent branch:** \`agent/a-theme-migration-design\`  
**Release verdict:** **NO-GO for any live Supabase SQL or theme rollout** until all dependency, licensing, PostgreSQL 17.6 rehearsal, backup and separate human approval gates below pass.

## Scope and repository contracts

Read \`AGENTS.md\`, \`SUPABASE_HUB_RULES.md\`, \`README.md\`, all migrations \`004\`–\`006\`, \`docs/DB_FINAL_RELEASE.md\`, actual \`api/game.js\`, and \`themes/packs/README.md\` / \`themes/packs/index.js\` / \`tests/theme-packs.test.js\`. The Hub safety instructions require a real read-me-first **TABLE**, \`SELECT * FROM hub.read_me_first\`, before any *future authorized Hub write*. **No actual Supabase connection of any kind was opened during this assignment.** Existing Hub facts in the previous independent DB audit are historical, not new current-state verification.

Only three paths are owned: \`migrations/007_theme_rooms.sql\`, \`tests/theme-migration-007.test.js\`, and this report. Migrations 004/005/006, APIs, theme manifests and UI remain untouched. Code changes neither register Hub resources nor run SQL automatically.

## Exact allowlist and legacy behavior

Seven isolated theme packs explicitly expose these IDs: \`avengers\`, \`ben10\`, \`shinchan\`, \`dc\`, \`naruto\`, \`cricket\`, \`fantasy\`. The existing multiplayer/classic Pokémon game remains \`pokemon\`. Therefore the **eight exact permitted persisted values** are:

\`pokemon\`, \`avengers\`, \`ben10\`, \`shinchan\`, \`dc\`, \`naruto\`, \`cricket\`, \`fantasy\`.

No arbitrary custom, translated or case-insensitive IDs; the CHECK rejects them. The SQL adds \`deckverse.rooms.theme_id varchar(32) NOT NULL DEFAULT 'pokemon'\` to preserve every historical room with no player/session/state rewrite. The column is a *creation-time identity*, **not** a per-round setting.

The existing \`api/game.js\` currently omits \`theme_id\` during room creation and uses the classic game engine; consequently after 007 it continues writing \`pokemon\` by default. Merely applying 007 **does not enable themed multiplayer**. A separate, reviewed server registry must validate theme IDs and license/availability, select theme-specific 50/60/80 card decks, authenticate actions, perform server-side state validation, and persist the chosen \`theme_id\` at INSERT. A user cannot switch the room theme after creation, including a rematch or host transfer; rematch preserves its room ID. Clients cannot be trusted with deck/catalog IDs, stats, category values, versions or shuffle.

## Migration 007 DDL and failure behavior

1. \`SET lock_timeout='3s'\`, \`statement_timeout='30s'\` in the dedicated migration connection; \`hub.assert_app_scope('deckverse','deckverse')\` must succeed. Requires existing rooms/players/rate-limit table and key \`004\`/\`006\` columns; refuses partial V2.
2. Detects a pre-existing \`rooms.theme_id\` with incompatible type (\`varchar(32)\`), nullability or \`pokemon\` default and raises before writing. \`ADD COLUMN IF NOT EXISTS\` is followed by exact postconditions, not treated as success by itself.
3. Creates \`rooms_theme_id_check\` with eight explicit values; uses \`NOT VALID\` then \`VALIDATE CONSTRAINT\` for an intentional staged validation, and checks the constraint is valid and has exactly those eight string literals. Existing incompatible same-name objects fail. The default does **not** rewrite existing tokens, player rows, JSON state, deck order or match history.
4. Creates \`deckverse.reject_room_theme_change() RETURNS trigger\` as **SECURITY INVOKER** with \`search_path=pg_catalog\`; revokes direct PUBLIC function execute. The \`deckverse_rooms_theme_immutable\` **BEFORE UPDATE ON deckverse.rooms FOR EACH ROW** trigger compares \`NEW.theme_id IS DISTINCT FROM OLD.theme_id\` and raises SQLSTATE \`23514\` on any actual change. This deliberately catches rematch/status/state updates too, while permitting unchanged or no-op values. Existing trigger/function names are checked on reruns, not blindly dropped or recreated.
5. Postconditions verify the type/default/NOT NULL, validated eight-value CHECK, enabled row-level update trigger and matching invoker function. SQL is PostgreSQL transactional DDL: run the **entire file** in one transaction, with \`psql -X -v ON_ERROR_STOP=1 --single-transaction -f migrations/007_theme_rooms.sql\`.

**Privileges and constraints:** no old PK/FK, room code, player seat/capacity/host, RLS policy, role grants or token/session schema is changed. Existing \`deckverse_app\` must retain current insert/update privileges on rooms, but has no ALTER/trigger-disabling privilege. A privileged table owner/superuser can disable user triggers; authorization and operational access remain a separate release boundary. Schema-level CHECK still enforces the allowlist even if a privileged actor disables the immutability trigger.

**Locks and idempotency:** the add-column/constraint/trigger DDL requires short-lived high-level locks; even metadata-only constant defaults require an ACCESS EXCLUSIVE lock while applied. If the lock is unavailable for 3 seconds, stop rather than wait indefinitely. A second clean execution must leave one constraint, one trigger/function and all existing room data untouched; drift (wrong default/type/constraint or trigger) must hard-fail the atomic transaction. Do **not** execute from a pooled runtime connection with shared session settings.

**Future pack versioning:** no \`theme_version\` column yet. Theme ID identifies a pack family, *not* a guarantee that ratings remain unchanged. The server should pin a stable manifest/revision and card-state provenance for matches; when a durable revision policy is approved, introduce a separately reviewed immutable \`theme_revision\` or equivalent version snapshot with migration and backward compatibility. Never silently reinterpret ongoing saved deck state after packs change.

## PostgreSQL 17.6-only test contract

\`node --test tests/theme-migration-007.test.js\` runs static checks locally. On GitHub CI it starts a **new local Docker \`postgres:17.6\` container** with a random \`127.0.0.1\` port, a strictly fictional database \`deckverse_theme_migration_007_test\`, and test-only credentials embedded in the runner. It never consumes \`DATABASE_URL\`, Supabase credentials or live data. It asserts \`SHOW server_version\` begins with **exactly 17.6**; any other version must fail, not be reported as a successful rehearsal. If CI has no local Docker or cannot pull 17.6, the test **fails closed**. Outside CI the DB portion reports a visible SKIP; that is not passing execution evidence. The container is force-removed in \`finally\`.

The test builds a fictionally accurate V1 room/player schema and local *stub* \`hub.assert_app_scope\`, applies actual 004→005→006 transactionally, seeds old 2P rooms (including playing and finished, match state, card IDs, hashed session tokens, host and inactive seats), then checks:
- \`BEGIN; [007]; ROLLBACK;\` leaves the pre-007 schema and data untouched.
- Incompatible pre-existing integer \`theme_id\` blocks 007 without leaving half-created objects; schema fixture is then reset **only inside disposable PostgreSQL**.
- A full 007 apply and identical second pass preserve legacy row fingerprints, defaults, room codes, JSON/cards and player/session states.
- All eight valid themes can be inserted into 2/3/4-player rooms; unknown/mixed-case/empty/oversized IDs and NULL fail.
- Changing any theme to another (including two individually approved themes, and Pokémon legacy rooms) fails SQLSTATE \`23514\`; unchanged-theme updates and rematch state/status updates succeed.
- Existing 2P seat capacity rejects seat 2; original seat CHECK remains unchanged.
- DeckVerse room/player RLS policies and table ACLs are bytewise identical before and after 007; the application role can create an approved theme room; an anonymous role cannot query the schema.
- A single enabled immutable trigger and validated allowlist constraint exist.

**Do not label this green before a verified CI run** with PG17.6 explicitly printed and no skips. PostgreSQL 16 CI from prior migration PRs is **not** acceptable evidence for this task.

## Production ordering, release and rollback gates

1. **STOP until authorized**: approved migrations 004/005/006 are already deployed and verified on *DeckVerse only*; the previous \`docs/DB_FINAL_RELEASE.md\` release gates must remain satisfied. Server registry and theme manifests must be signed off separately; the seven prototypes are explicitly not production-integrated.
2. Read the real Hub \`read_me_first\` TABLE and verify \`hub.apps\` slug/schema/acknowledgement, registered resources, exact historical room and player types, correct RLS/grants, and \`deckverse_app\` least-privilege login. Do this **only later**, with explicit change authorization. This task did not connect to Supabase.
3. Before DDL, take an encrypted app-scoped, recoverable \`pg_dump -Fc --schema=deckverse\`, capture secure checksums/row counts and privacy-preserving hashes of existing sessions and saved state; **prove restore in isolated staging**. Do not run cross-app/PITR restores.
4. Resource registration (future authorized operation only): coordinate the new \`deckverse.reject_room_theme_change()\` function and \`deckverse_rooms_theme_immutable\` trigger with the Hub registry conventions; no new table, storage bucket or public RPC is introduced by 007. Treat these as DeckVerse-owned internal resources, never shared. An approver must determine whether \`hub.app_resources.resource_type='other'\` should list them, by analogy with the approved 004 capacity guards. **No Hub INSERT/UPDATE in this PR.**
5. Schedule a DeckVerse-only low-traffic window, stop concurrent DDL, confirm lock wait budget and migration operator identity; apply 007 in one atomic file transaction after 006. During new app rollout, keep theme selection disabled until the authorized server registry is available.
6. Postflight: old rooms all have \`theme_id='pokemon'\`, old room/player digests and grant/RLS snapshots unchanged, eight-value constraint valid, immutable trigger enabled, invalid/updated IDs blocked, old 2P and 3P/4P flows pass, all current sessions survive, and Supabase security/performance advisors have no new DeckVerse findings. Do not assume a passed offline test proves live readiness.
7. Explicit final coordinator+owner approval is required for applying SQL, merging PRs and any public deployment. Rights clearance, non-omniscient fairness review and actual multi-device play of the seven third-party/unofficial packs are separate blockers.

### Safe read-only postflight examples (after approved migration)

~~~sql
SELECT column_name,data_type,character_maximum_length,is_nullable,column_default
FROM information_schema.columns WHERE table_schema='deckverse'
  AND table_name='rooms' AND column_name='theme_id';

SELECT theme_id,player_count,count(*) AS rooms
FROM deckverse.rooms GROUP BY theme_id,player_count ORDER BY theme_id,player_count;

SELECT conname,convalidated,pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid='deckverse.rooms'::regclass
  AND conname='rooms_theme_id_check';

SELECT tgname,tgenabled,pg_get_triggerdef(oid) AS definition
FROM pg_trigger WHERE tgrelid='deckverse.rooms'::regclass
  AND tgname='deckverse_rooms_theme_immutable';

SELECT schemaname,tablename,policyname,roles,cmd,qual,with_check
FROM pg_policies WHERE schemaname='deckverse';
~~~

### Rollback limitations

- **Before transaction COMMIT**: \`ROLLBACK\` reverts 007 column, CHECK, function and trigger atomically, leaving all rooms/sessions untouched. In CI this is explicitly rehearsed against PostgreSQL 17.6.
- **After COMMIT but before themed rooms**: an additive column and trigger can remain harmlessly unused; revert the API deployment if needed, keeping prior Pokémon rooms operational. Any destructive schema revert requires a separately approved migration, backup and validation.
- **After non-Pokémon rooms have been created**: old server code may wrongly interpret them as Pokémon if not theme-aware. **Do not silently reset themes, delete theme rooms, drop the immutable guard or drop the theme column.** Freeze new non-Pokémon creation, preserve existing state, consider a theme-aware API rollback/feature flag, and design an authorized per-room recovery path. Rematches must keep the original theme.
- **If state is lost or corrupted**: stop DeckVerse writes, restore the app-scoped backup to an isolated database first and reconcile only affected DeckVerse records with owner approval. Never restore an entire multi-app Project Hub or overwrite other application tables.

**Readiness: migration proposal is reviewable, not production-authorized.** Future live release remains **NO-GO** until all above requirements, PG17.6 execution and actual server registry integration pass.
