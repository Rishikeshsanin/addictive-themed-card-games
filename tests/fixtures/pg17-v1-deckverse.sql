-- LOCAL CI ONLY. This synthetic V1 fixture MUST NOT be used against real Hub.
-- The PG17 workflow boots a fresh disposable PostgreSQL container.
CREATE ROLE deckverse_app NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA hub;
CREATE SCHEMA deckverse;
CREATE FUNCTION hub.assert_app_scope(slug text,schema_name text) RETURNS text
LANGUAGE plpgsql AS $scope$
BEGIN
 IF slug <> 'deckverse' OR schema_name <> 'deckverse' THEN
  RAISE EXCEPTION 'bad scope';
 END IF;
 RETURN slug;
END $scope$;
CREATE TABLE deckverse.rooms(
 id uuid PRIMARY KEY,
 code varchar(6) NOT NULL UNIQUE CHECK(code ~ '^[A-Z0-9]{6}$'),
 mode text NOT NULL CHECK(mode IN ('same','remote')),
 status text NOT NULL DEFAULT 'lobby' CHECK(status IN ('lobby','playing','finished')),
 state jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
 reveal_mode text NOT NULL DEFAULT 'auto' CHECK(reveal_mode IN ('auto','manual')),
 reveal_seconds smallint NOT NULL DEFAULT 2 CHECK(reveal_seconds IN (2,3,5,8)),
 reveal_until timestamptz,
 reveal_acks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(reveal_acks)='array')
);
CREATE TABLE deckverse.players(
 room_id uuid NOT NULL REFERENCES deckverse.rooms(id) ON DELETE CASCADE,
 seat smallint NOT NULL CONSTRAINT players_seat_check CHECK(seat IN (0,1)),
 name varchar(40) NOT NULL,
 token_hash char(64) NOT NULL CHECK(token_hash ~ '^[0-9a-f]{64}$'),
 ready boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true,
 joined_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(room_id,seat)
);
CREATE INDEX deckverse_players_hash_idx ON deckverse.players(room_id,token_hash);
CREATE INDEX deckverse_rooms_expiry_idx ON deckverse.rooms(expires_at);
ALTER TABLE deckverse.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE deckverse.players ENABLE ROW LEVEL SECURITY;
CREATE POLICY deckverse_rooms_app_only ON deckverse.rooms FOR ALL TO deckverse_app USING(true) WITH CHECK(true);
CREATE POLICY deckverse_players_app_only ON deckverse.players FOR ALL TO deckverse_app USING(true) WITH CHECK(true);
GRANT USAGE ON SCHEMA deckverse TO deckverse_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON deckverse.rooms,deckverse.players TO deckverse_app;
INSERT INTO deckverse.rooms(id,code,mode,status,state,reveal_acks,expires_at)
VALUES
 ('11111111-1111-1111-1111-111111111111','ABC123','remote','playing','{"round":8,"chooser":1}'::jsonb,'[0]'::jsonb,'2027-01-01'),
 ('22222222-2222-2222-2222-222222222222','DEF456','same','lobby',NULL,'[]'::jsonb,'2027-02-01');
INSERT INTO deckverse.players(room_id,seat,name,token_hash,ready,active,last_seen_at)
VALUES
 ('11111111-1111-1111-1111-111111111111',0,'Host',repeat('a',64),true,true,'2026-10-19'),
 ('11111111-1111-1111-1111-111111111111',1,'Guest',repeat('b',64),true,true,'2026-10-19'),
 ('22222222-2222-2222-2222-222222222222',0,'Other',repeat('c',64),true,true,'2026-10-19');
