-- New DeckVerse-owned objects ONLY. Old Pokemon tables are never altered.
SET lock_timeout='3s';
SET statement_timeout='45s';
SELECT hub.assert_app_scope('deckverse','deckverse');
DO $pre$
BEGIN
 IF (SELECT count(*) FROM hub.apps WHERE slug='deckverse' AND schema_name='deckverse' AND safety_contract_acknowledged_at IS NOT NULL)<>1
 THEN RAISE EXCEPTION 'DeckVerse scoped registration missing'; END IF;
 IF to_regclass('deckverse.rooms') IS NULL OR to_regclass('deckverse.players') IS NULL
 THEN RAISE EXCEPTION 'Original Pokemon tables missing'; END IF;
 IF to_regclass('deckverse.online_rooms') IS NOT NULL OR to_regclass('deckverse.online_players') IS NOT NULL
   OR to_regclass('deckverse.online_rate_limit_counters') IS NOT NULL
 THEN RAISE EXCEPTION 'Online resources already exist; refuse duplicate migration'; END IF;
END $pre$;
CREATE TABLE deckverse.online_rooms(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code varchar(6) NOT NULL UNIQUE CHECK(code ~ '^[A-Z0-9]{6}$'),
 mode text NOT NULL CHECK(mode IN ('same','remote')),
 status text NOT NULL DEFAULT 'lobby' CHECK(status IN ('lobby','playing','finished')),
 state jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours'),
 reveal_mode text NOT NULL DEFAULT 'auto' CHECK(reveal_mode IN ('auto','manual')),
 reveal_seconds smallint NOT NULL DEFAULT 2 CHECK(reveal_seconds IN (2,3,5,8)),
 reveal_until timestamptz,
 reveal_acks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(reveal_acks)='array'),
 player_count smallint NOT NULL DEFAULT 2 CHECK(player_count IN (2,3,4)),
 host_seat smallint NOT NULL DEFAULT 0 CHECK(host_seat BETWEEN 0 AND 3),
 presence_version bigint NOT NULL DEFAULT 0 CHECK(presence_version>=0),
 theme_id varchar(32) NOT NULL DEFAULT 'pokemon'
 CONSTRAINT online_rooms_theme_id_check CHECK(theme_id IN ('pokemon','avengers','ben10','shinchan','dc','naruto','cricket','fantasy','dragonball','onepiece','wwe','football','wizarding'))
);
CREATE INDEX deckverse_online_rooms_expiry_idx ON deckverse.online_rooms(expires_at);
CREATE TABLE deckverse.online_players(
 room_id uuid NOT NULL REFERENCES deckverse.online_rooms(id) ON DELETE CASCADE,
 seat smallint NOT NULL CHECK(seat BETWEEN 0 AND 3),
 name varchar(40) NOT NULL,
 token_hash char(64) NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 ready boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true,
 joined_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 left_at timestamptz,
 CONSTRAINT online_players_pk PRIMARY KEY(room_id,seat)
);
CREATE INDEX deckverse_online_players_hash_idx ON deckverse.online_players(room_id,token_hash);
CREATE TABLE deckverse.online_rate_limit_counters(
 scope varchar(48) NOT NULL,
 key_hash char(64) NOT NULL CHECK(key_hash ~ '^[a-f0-9]{64}$'),
 window_start timestamptz NOT NULL,
 expires_at timestamptz NOT NULL,
 hits integer NOT NULL DEFAULT 1 CHECK(hits BETWEEN 1 AND 100000),
 CONSTRAINT online_rate_limit_pk PRIMARY KEY(scope,key_hash,window_start),
 CONSTRAINT online_rate_limit_expiry_check CHECK(expires_at>window_start)
);
CREATE INDEX deckverse_online_rate_limit_expiry_idx ON deckverse.online_rate_limit_counters(expires_at);
CREATE FUNCTION deckverse.online_guard_capacity() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $guard$
DECLARE cap smallint;
BEGIN
 IF TG_TABLE_NAME='online_players' THEN
  SELECT r.player_count INTO cap FROM deckverse.online_rooms r WHERE r.id=NEW.room_id FOR UPDATE;
  IF cap IS NULL OR NEW.seat<0 OR NEW.seat>=cap
  THEN RAISE EXCEPTION 'Seat outside room capacity' USING ERRCODE='23514'; END IF;
 ELSIF NEW.player_count<OLD.player_count AND EXISTS(
  SELECT 1 FROM deckverse.online_players p WHERE p.room_id=NEW.id AND p.seat>=NEW.player_count)
 THEN RAISE EXCEPTION 'Cannot shrink below occupied seat' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $guard$;
CREATE FUNCTION deckverse.online_reject_theme_change() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $guard$
BEGIN
 IF NEW.theme_id IS DISTINCT FROM OLD.theme_id
 THEN RAISE EXCEPTION 'Room theme is immutable' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $guard$;
CREATE TRIGGER deckverse_online_players_capacity_guard
 BEFORE INSERT OR UPDATE OF room_id,seat ON deckverse.online_players
 FOR EACH ROW EXECUTE FUNCTION deckverse.online_guard_capacity();
CREATE TRIGGER deckverse_online_rooms_capacity_guard
 BEFORE UPDATE OF player_count ON deckverse.online_rooms
 FOR EACH ROW EXECUTE FUNCTION deckverse.online_guard_capacity();
CREATE TRIGGER deckverse_online_rooms_theme_immutable
 BEFORE UPDATE ON deckverse.online_rooms
 FOR EACH ROW EXECUTE FUNCTION deckverse.online_reject_theme_change();
REVOKE ALL ON FUNCTION deckverse.online_guard_capacity() FROM PUBLIC;
REVOKE ALL ON FUNCTION deckverse.online_reject_theme_change() FROM PUBLIC;
REVOKE ALL ON TABLE deckverse.online_rooms,deckverse.online_players,deckverse.online_rate_limit_counters
 FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE
 deckverse.online_rooms,deckverse.online_players,deckverse.online_rate_limit_counters TO deckverse_app;
ALTER TABLE deckverse.online_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE deckverse.online_rooms FORCE ROW LEVEL SECURITY;
ALTER TABLE deckverse.online_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE deckverse.online_players FORCE ROW LEVEL SECURITY;
ALTER TABLE deckverse.online_rate_limit_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE deckverse.online_rate_limit_counters FORCE ROW LEVEL SECURITY;
CREATE POLICY deckverse_online_rooms_app_only ON deckverse.online_rooms FOR ALL TO deckverse_app USING(true) WITH CHECK(true);
CREATE POLICY deckverse_online_players_app_only ON deckverse.online_players FOR ALL TO deckverse_app USING(true) WITH CHECK(true);
CREATE POLICY deckverse_online_limits_app_only ON deckverse.online_rate_limit_counters FOR ALL TO deckverse_app USING(true) WITH CHECK(true);
INSERT INTO hub.app_resources(app_id,resource_type,resource_name,resource_schema,is_shared,notes)
SELECT a.id,v.kind,v.label,'deckverse',false,'DeckVerse online friend rooms, original Pokemon data untouched'
FROM hub.apps a CROSS JOIN (VALUES
 ('table','deckverse.online_rooms'),
 ('table','deckverse.online_players'),
 ('table','deckverse.online_rate_limit_counters'),
 ('other','deckverse.online_guard_capacity()'),
 ('other','deckverse.online_reject_theme_change()'),
 ('other','deckverse.online_players.deckverse_online_players_capacity_guard'),
 ('other','deckverse.online_rooms.deckverse_online_rooms_capacity_guard'),
 ('other','deckverse.online_rooms.deckverse_online_rooms_theme_immutable')
) AS v(kind,label)
WHERE a.slug='deckverse' AND a.schema_name='deckverse' AND a.safety_contract_acknowledged_at IS NOT NULL
ON CONFLICT(resource_type,resource_name) DO NOTHING;
DO $verify$
BEGIN
 IF (SELECT count(*) FROM hub.app_resources r JOIN hub.apps a ON a.id=r.app_id
 WHERE a.slug='deckverse' AND r.resource_schema='deckverse' AND r.is_shared=false
 AND r.resource_name IN ('deckverse.online_rooms','deckverse.online_players','deckverse.online_rate_limit_counters',
 'deckverse.online_guard_capacity()','deckverse.online_reject_theme_change()',
 'deckverse.online_players.deckverse_online_players_capacity_guard',
 'deckverse.online_rooms.deckverse_online_rooms_capacity_guard',
 'deckverse.online_rooms.deckverse_online_rooms_theme_immutable'))<>8
 THEN RAISE EXCEPTION 'Scoped online object registration failed'; END IF;
 IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='deckverse' AND c.relname IN ('online_rooms','online_players','online_rate_limit_counters')
 AND c.relrowsecurity AND c.relforcerowsecurity)<>3
 THEN RAISE EXCEPTION 'Online RLS not enabled and forced'; END IF;
 IF has_table_privilege('anon','deckverse.online_rooms','SELECT')
 OR has_table_privilege('authenticated','deckverse.online_players','SELECT')
 OR has_table_privilege('service_role','deckverse.online_rate_limit_counters','SELECT')
 OR NOT has_table_privilege('deckverse_app','deckverse.online_rooms','SELECT,INSERT,UPDATE,DELETE')
 OR NOT has_table_privilege('deckverse_app','deckverse.online_players','SELECT,INSERT,UPDATE,DELETE')
 OR NOT has_table_privilege('deckverse_app','deckverse.online_rate_limit_counters','SELECT,INSERT,UPDATE,DELETE')
 THEN RAISE EXCEPTION 'Online ACL verification failed'; END IF;
 IF (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O'
 AND tgrelid IN ('deckverse.online_rooms'::regclass,'deckverse.online_players'::regclass))<>3
 THEN RAISE EXCEPTION 'Missing online room safety trigger'; END IF;
END $verify$;
COMMENT ON TABLE deckverse.online_rooms IS 'DeckVerse online rooms only. Legacy Pokemon records untouched.';
COMMENT ON TABLE deckverse.online_players IS 'Server-private online room player sessions.';
COMMENT ON TABLE deckverse.online_rate_limit_counters IS 'Server-private hashed online rate limits.';
RESET lock_timeout;
RESET statement_timeout;
