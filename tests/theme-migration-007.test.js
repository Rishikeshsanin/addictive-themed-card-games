// DeckVerse 007: never uses DATABASE_URL or Supabase, only disposable PostgreSQL 17.6.
// In CI start postgres:17.6 on loopback. Outside CI the DB subtest visibly skips;
// no PostgreSQL 16 or other server version is ever used for 007 validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import postgres from 'postgres';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file=n=>readFileSync(path.join(root,n),'utf8');
const migration=file('migrations/007_theme_rooms.sql');
const themeIDs=['pokemon','avengers','ben10','shinchan','dc','naruto','cricket','fantasy'];
const database='deckverse_theme_migration_007_test';
const password='synthetic-ci-only-not-secret';
function docker(args,timeout=200000){
 const r=spawnSync('docker',args,{encoding:'utf8',timeout,maxBuffer:1024*1024,
    env:{...process.env,DOCKER_HOST:'unix:///var/run/docker.sock'}});
 if(r.error||r.status!==0)throw Error('Disposable Docker error: '+(r.stderr||r.error?.message||r.stdout||'').slice(0,600));
 return r.stdout.trim();
}
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
const fixture=[
 'CREATE ROLE deckverse_app NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;',
 'CREATE SCHEMA hub; CREATE SCHEMA deckverse;',
 "CREATE FUNCTION hub.assert_app_scope(slug text,schema_name text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN IF slug<>'deckverse' OR schema_name<>'deckverse' THEN RAISE EXCEPTION 'wrong Hub scope'; END IF; RETURN slug; END $$;",
 "CREATE TABLE deckverse.rooms(id uuid PRIMARY KEY,code varchar(6) NOT NULL UNIQUE CHECK(code ~ '^[A-Z0-9]{6}$'),mode text NOT NULL CHECK(mode IN ('same','remote')),status text NOT NULL DEFAULT 'lobby' CHECK(status IN ('lobby','playing','finished')),state jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours'),reveal_mode text NOT NULL DEFAULT 'auto' CHECK(reveal_mode IN ('auto','manual')),reveal_seconds smallint NOT NULL DEFAULT 2 CHECK(reveal_seconds IN (2,3,5,8)),reveal_until timestamptz,reveal_acks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(reveal_acks)='array'));",
 "CREATE TABLE deckverse.players(room_id uuid NOT NULL REFERENCES deckverse.rooms(id) ON DELETE CASCADE,seat smallint NOT NULL CONSTRAINT players_seat_check CHECK(seat IN (0,1)),name varchar(40) NOT NULL,token_hash char(64) NOT NULL CHECK(token_hash ~ '^[0-9a-f]{64}$'),ready boolean NOT NULL DEFAULT false,active boolean NOT NULL DEFAULT true,joined_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(room_id,seat));",
 'CREATE INDEX deckverse_players_hash_idx ON deckverse.players(room_id,token_hash); CREATE INDEX deckverse_rooms_expiry_idx ON deckverse.rooms(expires_at);',
 'ALTER TABLE deckverse.rooms ENABLE ROW LEVEL SECURITY; ALTER TABLE deckverse.players ENABLE ROW LEVEL SECURITY;',
 'CREATE POLICY deckverse_rooms_app_only ON deckverse.rooms FOR ALL TO deckverse_app USING(true) WITH CHECK(true);',
 'CREATE POLICY deckverse_players_app_only ON deckverse.players FOR ALL TO deckverse_app USING(true) WITH CHECK(true);',
 'GRANT USAGE ON SCHEMA deckverse TO deckverse_app;',
 'GRANT SELECT,INSERT,UPDATE,DELETE ON deckverse.rooms,deckverse.players TO deckverse_app;',
 "INSERT INTO deckverse.rooms(id,code,mode,status,state,expires_at,reveal_acks) VALUES ('11111111-1111-1111-1111-111111111111','OLD2P1','remote','playing','{\"round\":7,\"cards\":[1,12,29],\"chooser\":1}'::jsonb,'2027-01-01','[0]'::jsonb),('22222222-2222-2222-2222-222222222222','OLD2P2','same','finished','{\"round\":50,\"winner\":0,\"matchNumber\":2}'::jsonb,'2027-01-02','[0,1]'::jsonb);",
 "INSERT INTO deckverse.players(room_id,seat,name,token_hash,ready,active,last_seen_at) VALUES ('11111111-1111-1111-1111-111111111111',0,'Host',repeat('a',64),true,true,'2026-10-19T10:00:00Z'),('11111111-1111-1111-1111-111111111111',1,'Guest',repeat('b',64),false,true,'2026-10-19T10:01:00Z'),('22222222-2222-2222-2222-222222222222',0,'Other',repeat('c',64),true,false,'2026-10-18T09:00:00Z');"
].join('\n');
const fingerprint="SELECT md5(coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY id)::text FROM (SELECT id,code,mode,status,state,created_at,updated_at,expires_at,reveal_mode,reveal_seconds,reveal_until,reveal_acks,player_count,host_seat,presence_version FROM deckverse.rooms) t),'[]') || coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY room_id,seat)::text FROM (SELECT room_id,seat,name,token_hash,ready,active,joined_at,last_seen_at,left_at FROM deckverse.players) t),'[]')) AS fp";
const isCI=process.env.CI==='true'||process.env.GITHUB_ACTIONS==='true';
test('theme 007 matches exactly the seven prototype IDs plus Pokémon and scopes all DDL',async()=>{
 const {THEME_IDS}=await import('../themes/packs/index.js');
 assert.deepEqual([...THEME_IDS],['avengers','ben10','shinchan','dc','naruto','cricket','fantasy']);
 assert.deepEqual(new Set(['pokemon',...THEME_IDS]),new Set(themeIDs));
 assert.match(migration,/hub\.assert_app_scope\('deckverse','deckverse'\)/);
 assert.match(migration,/DEFAULT 'pokemon'/);
 assert.match(migration,/BEFORE UPDATE ON deckverse\.rooms/);
 assert.match(migration,/NEW\.theme_id IS DISTINCT FROM OLD\.theme_id/);
 assert.doesNotMatch(migration.split('\n').filter(x=>!x.trim().startsWith('--')).join('\n'),
   /\b(DROP\s+TABLE|DROP\s+SCHEMA|DELETE\s+FROM|TRUNCATE|CREATE\s+ROLE|ALTER\s+ROLE)\b/i);
});
test('PG17.6 disposable rehearsal: 007 atomic rollback, legacy data, theme IDs, immutability and RLS',
 {skip:isCI?false:'PG17.6 execution requires isolated CI Docker runner',timeout:240000},
 async()=>{
  const name='deckverse-theme-007-'+process.pid+'-'+Math.floor(Math.random()*1000000);
  const port=23500+Math.floor(Math.random()*20000);
  let started=false,sql;
  const run=s=>sql.unsafe(s).simple();
  const atomic=s=>run('BEGIN;\n'+s+'\nCOMMIT;');
  const one=async s=>(await sql.unsafe(s))[0];
  const reject=async(s,code)=>{
    await assert.rejects(()=>run(s),e=>{assert.equal(e.code,code,'Unexpected SQLSTATE: '+e.message);return true});
  };
  try{
   docker(['info','--format','{{.ServerVersion}}'],20000);
   docker(['run','--rm','-d','--name',name,'-p','127.0.0.1:'+port+':5432',
      '--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_PASSWORD='+password,
      '-e','POSTGRES_DB='+database,'postgres:17.6']);
   started=true;
   sql=postgres({host:'127.0.0.1',port,username:'postgres',password,database,ssl:false,max:5,connect_timeout:2});
   let connected=false;
   for(let i=0;i<60;i++){try{await one('SELECT 1 AS ready');connected=true;break}
     catch{await new Promise(r=>setTimeout(r,650))}}
   assert.ok(connected,'Docker PG17.6 failed to start on local loopback');
   const version=(await one('SHOW server_version')).server_version;
   assert.match(version,/^17\.6(?:\s|$)/,'Hard requirement: PostgreSQL 17.6 only');
   console.log('THEME_MIGRATION_DATABASE_VERSION',version);
   await atomic(fixture);
   for(const f of ['004_multiplayer_rooms.sql','005_deckverse_rate_limits.sql','006_deckverse_presence.sql'])
      await atomic(file('migrations/'+f));
   const baseline=(await one(fingerprint)).fp;
   const beforePolicies=JSON.stringify(await sql.unsafe("SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='deckverse' ORDER BY tablename,policyname"));
   const beforeGrants=JSON.stringify(await sql.unsafe("SELECT c.relname,c.relacl::text AS acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='deckverse' AND c.relname IN ('rooms','players') ORDER BY c.relname"));
   const seatBefore=(await one("SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid='deckverse.players'::regclass AND conname='players_seat_check'")).d;
   // PostgreSQL transactional DDL: rollback must leave *no* 007 change behind.
   await run('BEGIN;\n'+migration+'\nROLLBACK;');
   assert.equal((await one("SELECT count(*)::integer AS n FROM information_schema.columns WHERE table_schema='deckverse' AND table_name='rooms' AND column_name='theme_id'")).n,0);
   assert.equal((await one(fingerprint)).fp,baseline);
   // Deliberately incompatible pre-existing column must fail and leave no partial trigger.
   await run('ALTER TABLE deckverse.rooms ADD COLUMN theme_id integer NOT NULL DEFAULT 123');
   await assert.rejects(()=>atomic(migration),/007 incompatible existing rooms.theme_id/);
   assert.equal((await one("SELECT data_type FROM information_schema.columns WHERE table_schema='deckverse' AND table_name='rooms' AND column_name='theme_id'")).data_type,'integer');
   await run('ALTER TABLE deckverse.rooms DROP COLUMN theme_id'); // fictional fixture ONLY
   await atomic(migration);await atomic(migration);
   assert.equal((await one(fingerprint)).fp,baseline);
   assert.equal((await one("SELECT count(*)::integer AS n FROM deckverse.rooms WHERE theme_id='pokemon' AND player_count=2 AND host_seat=0 AND presence_version=0")).n,2);
   assert.equal((await one("SELECT count(*)::integer AS n FROM deckverse.players WHERE left_at IS NULL")).n,3);
   assert.equal(JSON.stringify(await sql.unsafe("SELECT tablename,policyname,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='deckverse' ORDER BY tablename,policyname")),beforePolicies);
   assert.equal(JSON.stringify(await sql.unsafe("SELECT c.relname,c.relacl::text AS acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='deckverse' AND c.relname IN ('rooms','players') ORDER BY c.relname")),beforeGrants);
   assert.equal((await one("SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conrelid='deckverse.players'::regclass AND conname='players_seat_check'")).d,seatBefore);
   assert.equal((await one("SELECT count(*)::integer AS n FROM pg_trigger WHERE tgrelid='deckverse.rooms'::regclass AND tgname='deckverse_rooms_theme_immutable' AND tgenabled='O'")).n,1);
   assert.equal((await one("SELECT count(*)::integer AS n FROM pg_constraint WHERE conrelid='deckverse.rooms'::regclass AND conname='rooms_theme_id_check' AND convalidated")).n,1);
   for(let i=0;i<themeIDs.length;i++){
     const id=themeIDs[i], room='30000000-0000-0000-0000-'+String(i+1).padStart(12,'0');
     await run("INSERT INTO deckverse.rooms(id,code,mode,status,player_count,theme_id) VALUES ("+
       quote(room)+","+quote('TH'+String(i).padStart(4,'0'))+",'same','lobby',"+(2+i%3)+","+quote(id)+")");
     assert.equal((await one("SELECT theme_id FROM deckverse.rooms WHERE id="+quote(room))).theme_id,id);
     if(id!=='pokemon')await reject("UPDATE deckverse.rooms SET theme_id='pokemon' WHERE id="+quote(room),'23514');
     await run("UPDATE deckverse.rooms SET state="+quote(JSON.stringify({status:'finished',matchNumber:1}))+"::jsonb,status='finished' WHERE id="+quote(room));
     await run("UPDATE deckverse.rooms SET state="+quote(JSON.stringify({status:'playing',matchNumber:2}))+"::jsonb,status='playing' WHERE id="+quote(room));
     assert.equal((await one("SELECT theme_id FROM deckverse.rooms WHERE id="+quote(room))).theme_id,id);
     await run("UPDATE deckverse.rooms SET theme_id="+quote(id)+" WHERE id="+quote(room));
   }
   for(const bad of ['','POKEMON','Pokemon','pokemon ','../fantasy','not-approved','x'.repeat(33)]){
     const query="INSERT INTO deckverse.rooms(code,mode,status,player_count,theme_id) VALUES ('BAD007','same','lobby',2,"+quote(bad)+")";
     await reject(query,bad.length>32?'22001':'23514');
   }
   await reject("INSERT INTO deckverse.rooms(code,mode,status,player_count,theme_id) VALUES ('BAD008','same','lobby',2,NULL)",'23502');
   await reject("UPDATE deckverse.rooms SET theme_id='avengers' WHERE theme_id='dc'",'23514');
   await reject("UPDATE deckverse.rooms SET theme_id='fantasy' WHERE id='11111111-1111-1111-1111-111111111111'",'23514');
   // Legacy rematch/status/state updates are safe and preserve implicit Pokémon theme.
   await run("UPDATE deckverse.rooms SET state='{\"round\":8,\"matchNumber\":3}'::jsonb WHERE id='11111111-1111-1111-1111-111111111111'");
   assert.equal((await one("SELECT theme_id FROM deckverse.rooms WHERE code='OLD2P1'")).theme_id,'pokemon');
   await reject("INSERT INTO deckverse.players(room_id,seat,name,token_hash) VALUES ('11111111-1111-1111-1111-111111111111',2,'Invalid',repeat('f',64))",'23514');
   await atomic("SET LOCAL ROLE deckverse_app; INSERT INTO deckverse.rooms(code,mode,status,player_count,theme_id) VALUES ('APP007','same','lobby',3,'fantasy');");
   assert.equal((await one("SELECT theme_id FROM deckverse.rooms WHERE code='APP007'")).theme_id,'fantasy');
   await reject('BEGIN; SET LOCAL ROLE anon; SELECT count(*) FROM deckverse.rooms; COMMIT;','42501');
   console.log('THEME_MIGRATION_PG17_6_PASS',JSON.stringify({legacyPreserved:true,allowlist:themeIDs,
     irreversibleAfterCreation:true,rematchesPreserveTheme:true,rollback:true,
     idempotency:true,originalGrantsRLS:true,existingCapacity:true,version}));
  }finally{
    if(sql)try{await sql.end({timeout:3})}catch{}
    if(started)try{docker(['rm','-f',name],20000)}catch{}
  }
 });
