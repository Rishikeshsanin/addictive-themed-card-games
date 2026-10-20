-- DeckVerse V2 004. REVIEW ONLY. Apply with psql -X -v ON_ERROR_STOP=1 --single-transaction.
-- Run only after Hub read-me, app scope/registration review, backup and explicit approval.
-- Timeouts are scoped to the dedicated migration session, not the application pool.
SET lock_timeout = '3s';
SET statement_timeout = '30s';
SELECT hub.assert_app_scope('deckverse','deckverse');

-- Stop on unexpected V1/V2 drift: IF NOT EXISTS alone is not a schema check.
DO $dv004_guard$
DECLARE definition text;
BEGIN
 IF to_regclass('deckverse.rooms') IS NULL OR to_regclass('deckverse.players') IS NULL THEN
   RAISE EXCEPTION '004 requires existing DeckVerse V1 rooms and players tables';
 END IF;
 IF EXISTS (
   SELECT 1 FROM pg_attribute a
   LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid='deckverse.rooms'::regclass
     AND a.attname='player_count' AND NOT a.attisdropped
     AND (a.atttypid <> 'pg_catalog.int2'::regtype OR NOT a.attnotnull
          OR COALESCE(pg_get_expr(d.adbin,d.adrelid),'') NOT IN ('2','2::smallint','2::int2'))
 ) THEN RAISE EXCEPTION '004 incompatible existing rooms.player_count column';
 END IF;
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint
 WHERE conrelid='deckverse.players'::regclass AND conname='players_seat_check' AND contype='c';
 IF definition IS NULL THEN RAISE EXCEPTION '004 expected players_seat_check missing'; END IF;
 IF definition NOT LIKE '%seat = ANY (ARRAY[0, 1])%'
    AND NOT (definition LIKE '%seat >= 0%' AND definition LIKE '%seat <= 3%') THEN
   RAISE EXCEPTION '004 unexpected players_seat_check: %',definition;
 END IF;
END $dv004_guard$;

ALTER TABLE deckverse.rooms
 ADD COLUMN IF NOT EXISTS player_count smallint NOT NULL DEFAULT 2
 CONSTRAINT rooms_player_count_check CHECK (player_count IN (2,3,4));

-- Replace legacy seat constraint exactly once, when it is truly still V1.
-- NOT VALID reduces time held during the constraint replacement; VALIDATE uses
-- a weaker lock than the initial ALTER and is independently checked below.
DO $dv004_seat$
DECLARE definition text;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint
 WHERE conrelid='deckverse.players'::regclass AND conname='players_seat_check' AND contype='c';
 IF definition LIKE '%seat = ANY (ARRAY[0, 1])%' THEN
   ALTER TABLE deckverse.players DROP CONSTRAINT players_seat_check;
   ALTER TABLE deckverse.players ADD CONSTRAINT players_seat_check
     CHECK (seat BETWEEN 0 AND 3) NOT VALID;
 END IF;
END $dv004_seat$;
ALTER TABLE deckverse.players VALIDATE CONSTRAINT players_seat_check;

-- Capacity must be enforced at the database edge even for direct SQL and
-- concurrent joins. Do not permit a seat in a 2P room just because CHECK allows 0..3.
-- Locks parent room first, matching the existing API's room-before-player ordering.
CREATE OR REPLACE FUNCTION deckverse.guard_room_capacity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog
AS $dv004_capacity$
DECLARE capacity smallint;
BEGIN
 IF TG_TABLE_NAME = 'players' THEN
   SELECT r.player_count INTO capacity FROM deckverse.rooms r
    WHERE r.id=NEW.room_id FOR UPDATE;
   IF capacity IS NULL OR NEW.seat < 0 OR NEW.seat >= capacity THEN
     RAISE EXCEPTION 'DeckVerse seat is outside room capacity' USING ERRCODE='23514';
   END IF;
 ELSE
   IF NEW.player_count < OLD.player_count AND EXISTS (
     SELECT 1 FROM deckverse.players p WHERE p.room_id=NEW.id AND p.seat >= NEW.player_count
   ) THEN
     RAISE EXCEPTION 'DeckVerse room capacity cannot exclude an occupied seat' USING ERRCODE='23514';
   END IF;
 END IF;
 RETURN NEW;
END $dv004_capacity$;
REVOKE ALL ON FUNCTION deckverse.guard_room_capacity() FROM PUBLIC;

DO $dv004_triggers$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger
   WHERE tgrelid='deckverse.players'::regclass AND tgname='deckverse_players_capacity_guard') THEN
  CREATE TRIGGER deckverse_players_capacity_guard
    BEFORE INSERT OR UPDATE OF room_id,seat ON deckverse.players
    FOR EACH ROW EXECUTE FUNCTION deckverse.guard_room_capacity();
 ELSIF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE
    tgrelid='deckverse.players'::regclass AND tgname='deckverse_players_capacity_guard'
    AND pg_get_triggerdef(oid) LIKE '%guard_room_capacity%') THEN
  RAISE EXCEPTION '004 incompatible players capacity trigger';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger
   WHERE tgrelid='deckverse.rooms'::regclass AND tgname='deckverse_rooms_capacity_guard') THEN
  CREATE TRIGGER deckverse_rooms_capacity_guard
    BEFORE UPDATE OF player_count ON deckverse.rooms
    FOR EACH ROW EXECUTE FUNCTION deckverse.guard_room_capacity();
 ELSIF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE
    tgrelid='deckverse.rooms'::regclass AND tgname='deckverse_rooms_capacity_guard'
    AND pg_get_triggerdef(oid) LIKE '%guard_room_capacity%') THEN
  RAISE EXCEPTION '004 incompatible rooms capacity trigger';
 END IF;
END $dv004_triggers$;

-- Postconditions: fail transaction on unexpected pre-existing columns or checks.
DO $dv004_verify$
DECLARE definition text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_attribute a LEFT JOIN pg_attrdef d
    ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='deckverse.rooms'::regclass AND a.attname='player_count'
      AND NOT a.attisdropped AND a.atttypid='pg_catalog.int2'::regtype
      AND a.attnotnull AND pg_get_expr(d.adbin,d.adrelid) IN ('2','2::smallint','2::int2'))
 THEN RAISE EXCEPTION '004 player_count postcondition failed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='deckverse.rooms'::regclass
  AND conname='rooms_player_count_check' AND contype='c' AND convalidated
  AND pg_get_constraintdef(oid) LIKE '%player_count%')
 THEN RAISE EXCEPTION '004 player_count CHECK missing/incompatible'; END IF;
 SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint WHERE
   conrelid='deckverse.players'::regclass AND conname='players_seat_check'
   AND contype='c' AND convalidated;
 IF definition IS NULL OR definition NOT LIKE '%seat >= 0%' OR definition NOT LIKE '%seat <= 3%'
 THEN RAISE EXCEPTION '004 seat CHECK postcondition failed: %', definition; END IF;
 IF EXISTS (SELECT 1 FROM deckverse.players p JOIN deckverse.rooms r ON r.id=p.room_id
    WHERE p.seat >= r.player_count)
 THEN RAISE EXCEPTION '004 existing player exceeds room capacity'; END IF;
END $dv004_verify$;

COMMENT ON COLUMN deckverse.rooms.player_count IS
 '2/3/4; legacy V1 rooms default to 2; enforced by DeckVerse capacity triggers.';
COMMENT ON FUNCTION deckverse.guard_room_capacity() IS
 'DeckVerse-only invoker trigger; serializes joins against room count and prevents unsafe shrink.';
RESET statement_timeout;
RESET lock_timeout;
