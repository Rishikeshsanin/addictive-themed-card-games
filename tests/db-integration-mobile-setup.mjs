// Disposable PostgreSQL CI bootstrap. NEVER connect this script to a real Supabase/Hub instance.
// Requires DB_INTEGRATION_LOCAL_ONLY=YES and loopback PostgreSQL service URLs.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';

if (process.env.DB_INTEGRATION_LOCAL_ONLY !== 'YES') throw Error('Disposable CI opt-in missing');
const adminUrl=process.env.DB_INTEGRATION_ADMIN_URL||'';
const appUrl=process.env.DECKVERSE_DATABASE_URL||'';
for(const raw of [adminUrl,appUrl]){
 const url=new URL(raw);
 assert.ok(['localhost','127.0.0.1','::1','[::1]'].includes(url.hostname),'Refusing non-loopback database');
 assert.equal(url.pathname,'/deckverse_ci','Refusing non-disposable database');
}
const admin=postgres(adminUrl,{ssl:false,prepare:false,max:1});
try {
 // Test data and roles exist ONLY in the ephemeral service container.
 await admin.unsafe("CREATE ROLE deckverse_app LOGIN PASSWORD 'ci_disposable_app_only'");
 await admin.unsafe('CREATE ROLE anon NOLOGIN');
 await admin.unsafe('CREATE ROLE authenticated NOLOGIN');
 await admin.unsafe('CREATE ROLE service_role NOLOGIN');
 await admin.unsafe('CREATE SCHEMA deckverse');
 await admin.unsafe('CREATE SCHEMA hub');
 await admin.unsafe(`CREATE FUNCTION hub.assert_app_scope(slug text, schema_name text)
 RETURNS void LANGUAGE plpgsql AS $$ BEGIN
 IF slug <> 'deckverse' OR schema_name <> 'deckverse' THEN
  RAISE EXCEPTION 'CI fixture rejects non-DeckVerse scope';
 END IF;
 END $$`);
 await admin.unsafe(`CREATE TABLE deckverse.rooms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code varchar(6) NOT NULL UNIQUE,
 mode text NOT NULL CHECK (mode IN ('same','remote')),
 status text NOT NULL DEFAULT 'lobby',
 state jsonb,
 reveal_mode text NOT NULL DEFAULT 'auto',
 reveal_seconds integer NOT NULL DEFAULT 2,
 reveal_until timestamptz,
 reveal_acks jsonb NOT NULL DEFAULT '[]'::jsonb,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '3 hours',
 updated_at timestamptz NOT NULL DEFAULT now()
 )`);
 await admin.unsafe(`CREATE TABLE deckverse.players (
 room_id uuid NOT NULL REFERENCES deckverse.rooms(id),
 seat integer NOT NULL,
 name varchar(24) NOT NULL,
 token_hash char(64) NOT NULL,
 ready boolean NOT NULL DEFAULT false,
 active boolean NOT NULL DEFAULT true,
 last_seen_at timestamptz DEFAULT now(),
 CONSTRAINT players_seat_check CHECK (seat BETWEEN 0 AND 1),
 CONSTRAINT players_room_seat_unique UNIQUE(room_id,seat)
 )`);
 // Apply checked-in V2 migrations *only* to the CI database. Do not use Project Hub.
 for(const filename of ['004_multiplayer_rooms.sql','005_deckverse_rate_limits.sql','006_deckverse_presence.sql']){
  const sql=await readFile(new URL('../migrations/'+filename,import.meta.url),'utf8');
  assert.match(sql,/hub\.assert_app_scope\('deckverse'/,'Every migration must carry DeckVerse scope guard');
  assert.doesNotMatch(sql,/\b(?:DROP SCHEMA|TRUNCATE|CASCADE)\b/i,'No destructive migration shortcuts');
  await admin.unsafe(sql);
  console.log('APPLIED TO DISPOSABLE DB ONLY: '+filename);
 }
 await admin.unsafe('GRANT CONNECT ON DATABASE deckverse_ci TO deckverse_app');
 await admin.unsafe('GRANT USAGE ON SCHEMA deckverse TO deckverse_app');
 await admin.unsafe('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE deckverse.rooms,deckverse.players TO deckverse_app');
 const [check]=await admin.unsafe(`SELECT
 (SELECT count(*) FROM information_schema.columns WHERE table_schema='deckverse' AND table_name='rooms' AND column_name='player_count') AS multiplayer,
 (SELECT count(*) FROM information_schema.columns WHERE table_schema='deckverse' AND table_name='rooms' AND column_name='host_seat') AS presence,
 (SELECT count(*) FROM information_schema.tables WHERE table_schema='deckverse' AND table_name='rate_limit_counters') AS limiter`);
 assert.equal(Number(check.multiplayer),1);
 assert.equal(Number(check.presence),1);
 assert.equal(Number(check.limiter),1);
 console.log('PASS: disposable V1 schema fixture + V2 004/005/006 application and contract');
} finally { await admin.end(); }
