-- DeckVerse-only V2 rate-limit migration. REVIEW ONLY; do not apply from this PR.
-- Read hub.read_me_first; verify hub.apps DeckVerse registration and repo safety contracts;
-- register only deckverse.rate_limit_counters with hub.app_resources before an authorized apply.
SELECT hub.assert_app_scope('deckverse','deckverse');
CREATE TABLE IF NOT EXISTS deckverse.rate_limit_counters (
 scope varchar(48) NOT NULL,
 key_hash char(64) NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
 window_start timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 hits integer NOT NULL DEFAULT 1 CHECK(hits BETWEEN 1 AND 100000),
 CONSTRAINT deckverse_rate_limit_counter_pk PRIMARY KEY(scope,key_hash,window_start),
 CONSTRAINT deckverse_rate_limit_expiry_check CHECK(expires_at > window_start)
);
CREATE INDEX IF NOT EXISTS deckverse_rate_limit_expiry_idx
 ON deckverse.rate_limit_counters(expires_at);
ALTER TABLE deckverse.rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE deckverse.rate_limit_counters FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE deckverse.rate_limit_counters FROM PUBLIC;
REVOKE ALL ON TABLE deckverse.rate_limit_counters FROM anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE deckverse.rate_limit_counters TO deckverse_app;
DROP POLICY IF EXISTS deckverse_app_rate_limit_counter_rw ON deckverse.rate_limit_counters;
CREATE POLICY deckverse_app_rate_limit_counter_rw ON deckverse.rate_limit_counters
 FOR ALL TO deckverse_app USING(true) WITH CHECK(true);
COMMENT ON TABLE deckverse.rate_limit_counters IS
 'DeckVerse-only hashed-actor fixed-window abuse counters; no raw IP, tokens or codes';
-- Coordinator: verify restricted grants/RLS, advisor, cleanup and concurrency in staging.
