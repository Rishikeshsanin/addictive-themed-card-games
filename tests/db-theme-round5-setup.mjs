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
 await admin.unsafe('BEGIN;\n'+base+'\nCOMMIT;').simple();
 await admin.unsafe("ALTER ROLE deckverse_app LOGIN PASSWORD 'round5_fake_local_only'");
 // Original parity fixture always inserts explicit UUIDs: restore API-compatible
 // generated default in *test-only* fixture, never migration or live schema.
 await admin.unsafe("ALTER TABLE deckverse.rooms ALTER COLUMN id SET DEFAULT gen_random_uuid()");

 for(const script of ['004_multiplayer_rooms.sql','005_deckverse_rate_limits.sql','006_deckverse_presence.sql']){
  const migration=readFileSync(new URL('../migrations/'+script,import.meta.url),'utf8');
  assert.match(migration,/hub\.assert_app_scope\('deckverse','deckverse'\)/);
  await admin.unsafe('BEGIN;\n'+migration+'\nCOMMIT;').simple();
  console.log('ROUND5_DISPOSABLE_MIGRATION',script);
 }
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
 const oldFields="SELECT md5((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id)::text FROM deckverse.rooms r) || (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.room_id,p.seat)::text FROM deckverse.players p)) AS fingerprint";
 const before=(await admin.unsafe(oldFields))[0].fingerprint;
 for(let pass=1;pass<=2;pass++){
  const m=readFileSync(new URL('../migrations/007_theme_rooms.sql',import.meta.url),'utf8');
  await admin.unsafe('BEGIN;\n'+m+'\nCOMMIT;').simple();
  console.log('ROUND5_DISPOSABLE_MIGRATION','007_theme_rooms.sql','pass',pass);
 }
 const after=(await admin.unsafe("SELECT md5((SELECT jsonb_agg(to_jsonb(r) - 'theme_id' ORDER BY r.id)::text FROM deckverse.rooms r) || (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.room_id,p.seat)::text FROM deckverse.players p)) AS fingerprint"))[0].fingerprint;
 assert.equal(after,before,'007 rewrote an existing room, state, code or session');
 assert.equal(Number((await admin.unsafe("SELECT count(*)::int AS n FROM deckverse.rooms WHERE theme_id='pokemon'"))[0].n),2);
 await admin.unsafe("ALTER TABLE deckverse.rooms FORCE ROW LEVEL SECURITY; ALTER TABLE deckverse.players FORCE ROW LEVEL SECURITY").simple();
 await admin.unsafe("GRANT CONNECT ON DATABASE deckverse_round5_ci TO deckverse_app; GRANT USAGE ON SCHEMA deckverse TO deckverse_app").simple();
 app=postgres(APP,{ssl:'require',max:2,prepare:false,connect_timeout:5});
 const role=(await app.unsafe("SELECT current_user AS name,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) AS tls"))[0];
 assert.deepEqual({role:role.name,tls:role.tls},{role:'deckverse_app',tls:true});
 assert.equal(Number((await app.unsafe('SELECT count(*)::int AS n FROM deckverse.rooms'))[0].n),2);
 assert.equal((await admin.unsafe("SELECT convalidated FROM pg_constraint WHERE conrelid='deckverse.rooms'::regclass AND conname='rooms_theme_id_check'"))[0]?.convalidated,true);
 console.log('ROUND5_DB_SETUP_PASS legacy=2 PG17.6 migrations=004,005,006,007x2 role=deckverse_app TLS=true fingerprint=preserved');
}finally{
 if(app)await app.end({timeout:5});
 await admin.end({timeout:5});
}
