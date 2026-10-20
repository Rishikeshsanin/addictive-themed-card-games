-- DeckVerse V2 006. REVIEW ONLY. Apply with a dedicated migration operator,
-- approved DeckVerse-only backup and a single bounded transaction.
-- Original host remains seat 0; last_seen_at and all token/session rows untouched.
SET lock_timeout = '3s';
SET statement_timeout = '30s';
SELECT hub.assert_app_scope('deckverse','deckverse');

-- Defensive drift check before attempting any ALTER. Existing columns must agree
-- exactly with the V2 release contract, not merely have the expected names.
DO $dv006_before$
BEGIN
 IF to_regclass('deckverse.rooms') IS NULL OR to_regclass('deckverse.players') IS NULL THEN
  RAISE EXCEPTION '006 requires rooms and players'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='deckverse.rooms'::regclass
   AND attname='player_count' AND atttypid='pg_catalog.int2'::regtype
   AND attnotnull AND NOT attisdropped) THEN
  RAISE EXCEPTION '006 requires completed 004 migration'; END IF;
 IF EXISTS (SELECT 1 FROM pg_attribute a
   LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid='deckverse.rooms'::regclass AND a.attname='host_seat'
     AND NOT a.attisdropped AND (a.atttypid <> 'pg_catalog.int2'::regtype
       OR NOT a.attnotnull OR COALESCE(pg_get_expr(d.adbin,d.adrelid),'') NOT IN ('0','0::smallint','0::int2')))
 OR EXISTS (SELECT 1 FROM pg_attribute a
   LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid='deckverse.rooms'::regclass AND a.attname='presence_version'
     AND NOT a.attisdropped AND (a.atttypid <> 'pg_catalog.int8'::regtype
       OR NOT a.attnotnull OR COALESCE(pg_get_expr(d.adbin,d.adrelid),'') NOT IN ('0','0::bigint','0::int8')))
 OR EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid='deckverse.players'::regclass
     AND a.attname='left_at' AND NOT a.attisdropped
     AND (a.atttypid <> 'pg_catalog.timestamptz'::regtype OR a.attnotnull))
 THEN RAISE EXCEPTION '006 incompatible existing presence columns'; END IF;
END $dv006_before$;

ALTER TABLE deckverse.rooms
 ADD COLUMN IF NOT EXISTS host_seat smallint NOT NULL DEFAULT 0
    CONSTRAINT rooms_host_seat_check CHECK(host_seat BETWEEN 0 AND 3),
 ADD COLUMN IF NOT EXISTS presence_version bigint NOT NULL DEFAULT 0
    CONSTRAINT rooms_presence_version_check CHECK(presence_version >= 0);
ALTER TABLE deckverse.players ADD COLUMN IF NOT EXISTS left_at timestamptz;

DO $dv006_verify$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_attribute a LEFT JOIN pg_attrdef d
  ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='deckverse.rooms'::regclass AND a.attname='host_seat'
    AND NOT a.attisdropped AND a.atttypid='pg_catalog.int2'::regtype AND a.attnotnull
    AND pg_get_expr(d.adbin,d.adrelid) IN ('0','0::smallint','0::int2'))
 OR NOT EXISTS (SELECT 1 FROM pg_attribute a LEFT JOIN pg_attrdef d
  ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE a.attrelid='deckverse.rooms'::regclass AND a.attname='presence_version'
    AND NOT a.attisdropped AND a.atttypid='pg_catalog.int8'::regtype AND a.attnotnull
    AND pg_get_expr(d.adbin,d.adrelid) IN ('0','0::bigint','0::int8'))
 OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='deckverse.players'::regclass
  AND attname='left_at' AND NOT attisdropped
  AND atttypid='pg_catalog.timestamptz'::regtype AND NOT attnotnull)
 THEN RAISE EXCEPTION '006 presence column postcondition failed'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='deckverse.rooms'::regclass
    AND conname='rooms_host_seat_check' AND contype='c' AND convalidated
    AND pg_get_constraintdef(oid) LIKE '%host_seat >= 0%'
    AND pg_get_constraintdef(oid) LIKE '%host_seat <= 3%')
 OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='deckverse.rooms'::regclass
    AND conname='rooms_presence_version_check' AND contype='c' AND convalidated
    AND pg_get_constraintdef(oid) LIKE '%presence_version >= 0%')
 THEN RAISE EXCEPTION '006 missing or incompatible presence checks'; END IF;
END $dv006_verify$;

COMMENT ON COLUMN deckverse.rooms.host_seat IS
 'Server-authoritative host seat (0 legacy default); updated inside locked room transaction.';
COMMENT ON COLUMN deckverse.rooms.presence_version IS
 'Monotonically increasing version for persisted host/presence transitions.';
COMMENT ON COLUMN deckverse.players.left_at IS
 'Intentional server-authorized exit only; NULL means no recorded explicit leave.';
RESET statement_timeout;
RESET lock_timeout;
