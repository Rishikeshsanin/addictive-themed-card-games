-- DeckVerse-only migration 007: immutable room theme. REVIEW ONLY.
-- Apply AFTER 004, 005, 006 and ONLY with approved DeckVerse-specific backup,
-- scoped Hub authorization, controlled window and -X -v ON_ERROR_STOP=1
-- --single-transaction. NEVER run automatically on the shared Project Hub.
SET lock_timeout = '3s';
SET statement_timeout = '30s';
SELECT hub.assert_app_scope('deckverse','deckverse');

-- This migration never modifies historical room/session/game-state rows or
-- revises the existing 2/3/4-player seat, capacity, rate-limit or presence rules.
DO $dv007_preflight$
DECLARE column_default text;
DECLARE definition text;
DECLARE allowed text[];
BEGIN
  IF to_regclass('deckverse.rooms') IS NULL
     OR to_regclass('deckverse.players') IS NULL
     OR to_regclass('deckverse.rate_limit_counters') IS NULL THEN
    RAISE EXCEPTION '007 requires completed DeckVerse V2 migrations 004-006';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'deckverse.rooms'::regclass
      AND attname = 'player_count' AND NOT attisdropped
      AND atttypid = 'pg_catalog.int2'::regtype AND attnotnull
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'deckverse.rooms'::regclass
      AND attname = 'host_seat' AND NOT attisdropped
      AND atttypid = 'pg_catalog.int2'::regtype AND attnotnull
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'deckverse.rooms'::regclass
      AND attname = 'presence_version' AND NOT attisdropped
      AND atttypid = 'pg_catalog.int8'::regtype AND attnotnull
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'deckverse.players'::regclass
      AND attname = 'left_at' AND NOT attisdropped
      AND atttypid = 'pg_catalog.timestamptz'::regtype
  ) THEN
    RAISE EXCEPTION '007 refuses partial or incompatible V2 room/player schema';
  END IF;

  -- IF NOT EXISTS is insufficient for drift detection.
  SELECT pg_get_expr(d.adbin, d.adrelid)
    INTO column_default
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attrelid = 'deckverse.rooms'::regclass
    AND a.attname = 'theme_id' AND NOT a.attisdropped
    AND a.attnum > 0;
  IF FOUND AND NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'deckverse.rooms'::regclass
      AND a.attname = 'theme_id' AND NOT a.attisdropped
      AND a.atttypid = 'pg_catalog.varchar'::regtype
      AND a.atttypmod = 36 -- varchar(32): typmod = 32 + 4
      AND a.attnotnull
  ) THEN
    RAISE EXCEPTION '007 incompatible existing rooms.theme_id type/nullability';
  END IF;
  IF FOUND AND (column_default IS NULL
     OR column_default NOT IN ('''pokemon''::character varying',
                               '''pokemon''::text', '''pokemon''')) THEN
    RAISE EXCEPTION '007 incompatible existing rooms.theme_id default: %', column_default;
  END IF;

  SELECT pg_get_constraintdef(oid) INTO definition
  FROM pg_constraint
  WHERE conrelid = 'deckverse.rooms'::regclass
    AND conname = 'rooms_theme_id_check' AND contype = 'c';
  IF definition IS NOT NULL THEN
    SELECT array_agg(m[1] ORDER BY m[1]) INTO allowed
    FROM regexp_matches(definition, '''([^'']+)''', 'g') AS m;
    IF allowed IS DISTINCT FROM ARRAY[
      'avengers','ben10','cricket','dc','fantasy','naruto','pokemon','shinchan'
    ]::text[] OR definition NOT LIKE '%theme_id%' THEN
      RAISE EXCEPTION '007 existing theme allowlist CHECK is incompatible: %', definition;
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'deckverse.rooms'::regclass
      AND conname = 'rooms_theme_id_check'
  ) THEN
    RAISE EXCEPTION '007 rooms_theme_id_check name occupied by non-CHECK constraint';
  END IF;
END $dv007_preflight$;

ALTER TABLE deckverse.rooms
  ADD COLUMN IF NOT EXISTS theme_id varchar(32) NOT NULL DEFAULT 'pokemon';

-- Explicit, DB-enforced allowlist; the server must independently validate the
-- same eight IDs and only pick packs available in its authenticated registry.
DO $dv007_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE
      conrelid = 'deckverse.rooms'::regclass
      AND conname = 'rooms_theme_id_check'
  ) THEN
    ALTER TABLE deckverse.rooms
      ADD CONSTRAINT rooms_theme_id_check
      CHECK (theme_id IN (
        'pokemon','avengers','ben10','shinchan',
        'dc','naruto','cricket','fantasy'
      )) NOT VALID;
  END IF;
END $dv007_check$;
ALTER TABLE deckverse.rooms VALIDATE CONSTRAINT rooms_theme_id_check;

-- SECURITY INVOKER by default; no SECURITY DEFINER privilege escalation.
-- This trigger covers *every* UPDATE, including room state/rematch updates.
-- Existing matching trigger/function definitions are verified below, not replaced.
DO $dv007_function$
BEGIN
  IF to_regprocedure('deckverse.reject_room_theme_change()') IS NULL THEN
    EXECUTE $ddl$
      CREATE FUNCTION deckverse.reject_room_theme_change()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY INVOKER
      SET search_path = pg_catalog
      AS $fn$
      BEGIN
        IF NEW.theme_id IS DISTINCT FROM OLD.theme_id THEN
          RAISE EXCEPTION 'DeckVerse room theme cannot change after creation'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END
      $fn$
    $ddl$;
  END IF;
END $dv007_function$;
REVOKE ALL ON FUNCTION deckverse.reject_room_theme_change() FROM PUBLIC;

DO $dv007_trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'deckverse.rooms'::regclass
      AND tgname = 'deckverse_rooms_theme_immutable'
  ) THEN
    CREATE TRIGGER deckverse_rooms_theme_immutable
      BEFORE UPDATE ON deckverse.rooms
      FOR EACH ROW
      EXECUTE FUNCTION deckverse.reject_room_theme_change();
  END IF;
END $dv007_trigger$;

DO $dv007_verify$
DECLARE column_default text;
DECLARE definition text;
DECLARE allowed text[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'deckverse.rooms'::regclass
      AND a.attname = 'theme_id' AND NOT a.attisdropped
      AND a.atttypid = 'pg_catalog.varchar'::regtype
      AND a.atttypmod = 36 AND a.attnotnull
      AND pg_get_expr(d.adbin, d.adrelid)
        IN ('''pokemon''::character varying','''pokemon''::text','''pokemon''')
  ) THEN RAISE EXCEPTION '007 theme_id column/default postcondition failed'; END IF;
  SELECT pg_get_constraintdef(oid) INTO definition FROM pg_constraint
  WHERE conrelid = 'deckverse.rooms'::regclass
    AND conname = 'rooms_theme_id_check' AND contype = 'c' AND convalidated;
  SELECT array_agg(m[1] ORDER BY m[1]) INTO allowed
    FROM regexp_matches(coalesce(definition, ''), '''([^'']+)''', 'g') AS m;
  IF allowed IS DISTINCT FROM ARRAY[
    'avengers','ben10','cricket','dc','fantasy','naruto','pokemon','shinchan'
  ]::text[] OR definition NOT LIKE '%theme_id%' THEN
    RAISE EXCEPTION '007 theme allowlist postcondition failed: %', definition;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'deckverse' AND p.proname = 'reject_room_theme_change'
      AND p.pronargs = 0 AND p.prorettype = 'pg_catalog.trigger'::regtype
      AND NOT p.prosecdef AND p.provolatile = 'v'
      AND pg_get_functiondef(p.oid) LIKE '%NEW.theme_id IS DISTINCT FROM OLD.theme_id%'
  ) THEN RAISE EXCEPTION '007 immutable trigger function missing or incompatible'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    WHERE t.tgrelid = 'deckverse.rooms'::regclass
      AND t.tgname = 'deckverse_rooms_theme_immutable' AND NOT t.tgisinternal
      AND t.tgenabled = 'O' AND t.tgtype = 19 -- row (1) + before (2) + UPDATE (16)
      AND t.tgfoid = 'deckverse.reject_room_theme_change()'::regprocedure
  ) THEN RAISE EXCEPTION '007 immutable room trigger missing or incompatible'; END IF;
  IF EXISTS (
    SELECT 1 FROM deckverse.rooms WHERE theme_id IS DISTINCT FROM 'pokemon'
      AND theme_id NOT IN (
        'avengers','ben10','shinchan','dc','naruto','cricket','fantasy'
      )
  ) THEN RAISE EXCEPTION '007 unexpected theme_id in existing rooms'; END IF;
END $dv007_verify$;

COMMENT ON COLUMN deckverse.rooms.theme_id IS
  'Immutable theme key, selected at room creation; V1/V2 legacy rooms use pokemon.';
COMMENT ON FUNCTION deckverse.reject_room_theme_change() IS
  'DeckVerse-only invoker trigger prevents theme switch on updates/rematches.';
RESET statement_timeout;
RESET lock_timeout;
