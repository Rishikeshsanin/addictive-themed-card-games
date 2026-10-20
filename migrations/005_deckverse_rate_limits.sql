-- DeckVerse V2 005. REVIEW ONLY. Register DeckVerse-only resources in hub.app_resources
-- only after a separately authorized change; run via psql --single-transaction.
SET lock_timeout = '3s';
SET statement_timeout = '30s';
SELECT hub.assert_app_scope('deckverse','deckverse');

CREATE TABLE IF NOT EXISTS deckverse.rate_limit_counters (
 scope varchar(48) NOT NULL,
 key_hash char(64) NOT NULL CHECK(key_hash ~ '^[0-9a-f]{64}$'),
 window_start timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 hits integer NOT NULL DEFAULT 1 CHECK(hits BETWEEN 1 AND 100000),
 CONSTRAINT deckverse_rate_limit_counter_pk PRIMARY KEY(scope,key_hash,window_start),
 CONSTRAINT deckverse_rate_limit_expiry_check CHECK(expires_at > window_start)
);
CREATE INDEX IF NOT EXISTS deckverse_rate_limit_expiry_idx
 ON deckverse.rate_limit_counters(expires_at);

-- The runtime identity alone can read/upsert/prune counters. Do not GRANT to
-- the client-facing roles; PostgreSQL service_role BYPASSRLS is not an app key.
ALTER TABLE deckverse.rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE deckverse.rate_limit_counters FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE deckverse.rate_limit_counters FROM PUBLIC;
REVOKE ALL ON TABLE deckverse.rate_limit_counters FROM anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE deckverse.rate_limit_counters TO deckverse_app;

-- Do not drop/recreate the same policy during a replay.
DO $dv005_policy$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='deckverse'
    AND tablename='rate_limit_counters'
    AND policyname='deckverse_app_rate_limit_counter_rw') THEN
  CREATE POLICY deckverse_app_rate_limit_counter_rw
   ON deckverse.rate_limit_counters FOR ALL TO deckverse_app
   USING(true) WITH CHECK(true);
 END IF;
END $dv005_policy$;

-- An IF NOT EXISTS notice is NOT enough: verify the pre-existing table shape,
-- index, constraints, enabled/forced RLS, actual policy and table privileges.
DO $dv005_verify$
BEGIN
 IF to_regclass('deckverse.rate_limit_counters') IS NULL THEN
   RAISE EXCEPTION '005 table missing'; END IF;
 IF (SELECT count(*) FROM pg_attribute a WHERE a.attrelid='deckverse.rate_limit_counters'::regclass
    AND a.attnum>0 AND NOT a.attisdropped) <> 5 THEN
   RAISE EXCEPTION '005 incompatible column set'; END IF;
 IF EXISTS (
 SELECT 1 FROM (VALUES
  ('scope','character varying(48)',true),
  ('key_hash','character(64)',true),
  ('window_start','timestamp with time zone',true),
  ('expires_at','timestamp with time zone',true),
  ('hits','integer',true)
 ) AS req(name,typename,nonnull)
 WHERE NOT EXISTS (SELECT 1 FROM pg_attribute a
   WHERE a.attrelid='deckverse.rate_limit_counters'::regclass
     AND a.attname=req.name AND a.attnotnull=req.nonnull
     AND format_type(a.atttypid,a.atttypmod)=req.typename)
 ) THEN RAISE EXCEPTION '005 incompatible column types or nullability'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE
    conrelid='deckverse.rate_limit_counters'::regclass
    AND conname='deckverse_rate_limit_counter_pk' AND contype='p'
    AND pg_get_constraintdef(oid)='PRIMARY KEY (scope, key_hash, window_start)')
 OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE
    conrelid='deckverse.rate_limit_counters'::regclass
    AND conname='deckverse_rate_limit_expiry_check' AND contype='c' AND convalidated)
 OR (SELECT count(*) FROM pg_constraint
     WHERE conrelid='deckverse.rate_limit_counters'::regclass AND contype='c') <> 3
 THEN RAISE EXCEPTION '005 constraints missing/incompatible'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='deckverse'
     AND tablename='rate_limit_counters' AND indexname='deckverse_rate_limit_expiry_idx'
     AND indexdef LIKE '%USING btree (expires_at)%')
 THEN RAISE EXCEPTION '005 expiry index missing/incompatible'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid='deckverse.rate_limit_counters'::regclass
   AND relkind='r' AND relrowsecurity AND relforcerowsecurity)
 THEN RAISE EXCEPTION '005 FORCE RLS not enabled'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='deckverse'
    AND tablename='rate_limit_counters') <> 1
 OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='deckverse'
    AND tablename='rate_limit_counters'
    AND policyname='deckverse_app_rate_limit_counter_rw'
    AND roles::text='{deckverse_app}' AND cmd='ALL' AND qual='true' AND with_check='true')
 THEN RAISE EXCEPTION '005 policy missing/incompatible'; END IF;
 IF NOT has_table_privilege('deckverse_app','deckverse.rate_limit_counters','SELECT,INSERT,UPDATE,DELETE')
 OR has_table_privilege('anon','deckverse.rate_limit_counters','SELECT')
 OR has_table_privilege('authenticated','deckverse.rate_limit_counters','SELECT')
 OR has_table_privilege('service_role','deckverse.rate_limit_counters','SELECT')
 THEN RAISE EXCEPTION '005 forbidden grants or missing app privileges'; END IF;
END $dv005_verify$;

COMMENT ON TABLE deckverse.rate_limit_counters IS
 'DeckVerse-only SHA-256 actor buckets; never store raw IPs, room codes or tokens.';
RESET statement_timeout;
RESET lock_timeout;
