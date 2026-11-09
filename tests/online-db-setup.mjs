/**
 * Agent A Round 5 disposable PostgreSQL 17.6 bootstrap.
 * NEVER connects to Supabase or accepts a caller-chosen host, DB or role.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import postgres from 'postgres';
import {startServerThemeMatch,validateServerThemeMatch} from '../src/server/theme-match.js';

const NAME='deckverse_round5_ci';
function checked(name,role){
 const value=process.env[name]||'';
 assert.equal(process.env.DECKVERSE_ROUND5_DISPOSABLE,'YES','Explicit disposable CI-only opt-in required');
 const u=new URL(value);
 assert.ok(['postgres:','postgresql:'].includes(u.protocol));
 assert.equal(u.hostname,'127.0.0.1','Only localhost fixture permitted');
 assert.equal(u.port,'5432','Expected isolated Docker PostgreSQL port');
 assert.equal(u.pathname,'/'+NAME,'Only fictional CI database is allowed');
 assert.equal(decodeURIComponent(u.username),role,'Only known fictional test roles allowed');
 assert.equal(u.searchParams.get('sslmode'),'require','TLS required');
 return value;
}
const ADMIN=checked('ROUND5_PG_ADMIN_URL','postgres');
const APP=checked('DECKVERSE_DATABASE_URL','deckverse_app');
const digest=s=>createHash('sha256').update(s).digest('hex');
const admin=postgres(ADMIN,{ssl:'require',prepare:false,max:1,connect_timeout:5});
let app;
try{
 const version=(await admin.unsafe('SHOW server_version_num'))[0].server_version_num;
 assert.equal(Number(version),170006,'Exactly PostgreSQL 17.6 required');
 console.log('ROUND5_DB_POSTGRES_VERSION',version);

 // Existing fictitious V1 fixture, original 2P rows and Hub scope test stub.
 const base=readFileSync(new URL('./fixtures/pg17-v1-deckverse.sql',import.meta.url),'utf8');
 await admin.unsafe('BEGIN;\n'+base+'\n\n-- Synthetic ownership registry; no connection to any real Supabase instance.\nCREATE TABLE hub.apps(id uuid PRIMARY KEY,slug text NOT NULL UNIQUE,schema_name text NOT NULL,safety_contract_acknowledged_at timestamptz);\nCREATE TABLE hub.app_resources(app_id uuid NOT NULL REFERENCES hub.apps(id),resource_type text NOT NULL,resource_name text NOT NULL,resource_schema text NOT NULL,is_shared boolean NOT NULL DEFAULT false,notes text,UNIQUE(resource_type,resource_name));\nINSERT INTO hub.apps(id,slug,schema_name,safety_contract_acknowledged_at)\nVALUES (\'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa\',\'deckverse\',\'deckverse\',clock_timestamp());\n\nCOMMIT;').simple();
 await admin.unsafe("ALTER ROLE deckverse_app LOGIN PASSWORD 'round5_fake_local_only'");
 // Original parity fixture always inserts explicit UUIDs: restore API-compatible
 // generated default in *test-only* fixture, never migration or live schema.
 await admin.unsafe("ALTER TABLE deckverse.rooms ALTER COLUMN id SET DEFAULT gen_random_uuid()");

 const migration=readFileSync(new URL('../migrations/008_isolated_online_rooms.sql',import.meta.url),'utf8');
 assert.doesNotMatch(migration,/ALTER TABLE deckverse\\.(?:rooms|players)\\b/i);
 const oldDigest="SELECT md5((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)::text FROM deckverse.rooms r) || (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.room_id,p.seat)::text FROM deckverse.players p)) AS fingerprint";
 const before=(await admin.unsafe(oldDigest))[0].fingerprint;
 await admin.unsafe('BEGIN;\n'+migration+'\nCOMMIT;').simple();
 const after=(await admin.unsafe(oldDigest))[0].fingerprint;
 assert.equal(after,before,'Original Pokemon rooms or players were changed');
 console.log('ONLINE_ISOLATION_MIGRATION_PASS old Pokemon fingerprint preserved');
 // Valid V2 Pokémon match with known fictional test token (real server hashing).
 const game=startServerThemeMatch({themeId:'pokemon',playerCount:2,chooser:0});
 game.matchNumber=1;
 game.revealPolicy={mode:'auto',seconds:2};
 assert.equal(validateServerThemeMatch(game,'pokemon'),true);
 const token0='a'.repeat(64),token1='b'.repeat(64);
 const seeded=await admin.unsafe("UPDATE deckverse.rooms SET state=$1::jsonb WHERE code='ABC123' RETURNING code,jsonb_typeof(state) AS kind,state->>'status' AS phase",[game]);
 assert.equal(seeded.length,1,"Legacy playing room must exist for seeded state");
 assert.deepEqual({kind:seeded[0].kind,phase:seeded[0].phase},{kind:"object",phase:"playing"});
 console.log("ROUND5_LEGACY_FIXTURE_GAME_SEEDED",seeded[0].code,seeded[0].kind,seeded[0].phase);
 await admin.unsafe("UPDATE deckverse.players SET token_hash=$1,last_seen_at=clock_timestamp() WHERE room_id=(SELECT id FROM deckverse.rooms WHERE code='ABC123') AND seat=0",[digest(token0)]);
 await admin.unsafe("UPDATE deckverse.players SET token_hash=$1,last_seen_at=clock_timestamp() WHERE room_id=(SELECT id FROM deckverse.rooms WHERE code='ABC123') AND seat=1",[digest(token1)]);
 const origCount=(await admin.unsafe("SELECT count(*)::integer AS n FROM deckverse.rooms"))[0].n;
 assert.equal(origCount,2);
 const onlineCount=(await admin.unsafe("SELECT count(*)::integer AS n FROM deckverse.online_rooms"))[0].n;
 assert.equal(onlineCount,0);
 await admin.unsafe("ALTER TABLE deckverse.rooms FORCE ROW LEVEL SECURITY; ALTER TABLE deckverse.players FORCE ROW LEVEL SECURITY").simple();
 await admin.unsafe("GRANT CONNECT ON DATABASE deckverse_round5_ci TO deckverse_app; GRANT USAGE ON SCHEMA deckverse TO deckverse_app").simple();
 app=postgres(APP,{ssl:'require',max:2,prepare:false,connect_timeout:5});
 const role=(await app.unsafe("SELECT current_user AS name,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls"))[0];
 assert.deepEqual({role:role.name,tls:role.tls},{role:'deckverse_app',tls:true});
 assert.equal(Number((await app.unsafe('SELECT count(*)::int AS n FROM deckverse.rooms'))[0].n),2);
 assert.equal((await admin.unsafe("SELECT convalidated FROM pg_constraint WHERE conrelid='deckverse.online_rooms'::regclass AND conname='online_rooms_theme_id_check'"))[0]?.convalidated,true);
 console.log('ONLINE_DB_SETUP_PASS preserved_pokemon=2 isolated_tables=3 PG17.6 role=deckverse_app TLS=true');
}finally{
 if(app)await app.end({timeout:5});
 await admin.end({timeout:5});
}
