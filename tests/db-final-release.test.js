// DeckVerse V2 final release rehearsal. Entirely fictional data, isolated local socket,
// newly-created temporary PostgreSQL cluster. Never consumes a DATABASE_URL or Hub credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync,spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync,readdirSync,existsSync,accessSync,constants,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const migrations=['004_multiplayer_rooms.sql','005_deckverse_rate_limits.sql','006_deckverse_presence.sql'];
function binaryDirectory(){
 let dirs=(process.env.PATH||'').split(path.delimiter);
 if(existsSync('/usr/lib/postgresql'))dirs=[
   ...readdirSync('/usr/lib/postgresql').sort().reverse().map(v=>'/usr/lib/postgresql/'+v+'/bin'),...dirs];
 return dirs.find(d=>['initdb','pg_ctl','psql','pg_dump','pg_restore'].every(n=>{
   try{accessSync(path.join(d,n),constants.X_OK);return true}catch{return false}
 }))??null;
}
function run(cmd,args,env,success=true){
 const r=spawnSync(cmd,args,{env:{...process.env,...env},encoding:'utf8',timeout:45000,maxBuffer:2*1024*1024});
 if(r.error||((r.status===0)!==success))throw Error(
  path.basename(cmd)+' unexpected exit '+r.status+': '+String(r.stderr||r.error?.message||r.stdout).slice(0,1100));
 return (r.stdout||'').trim();
}
const legacyFixture=[
'CREATE ROLE deckverse_app NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;',
'CREATE SCHEMA hub; CREATE SCHEMA deckverse;',
"CREATE FUNCTION hub.assert_app_scope(slug text,schema_name text) RETURNS text LANGUAGE plpgsql AS $$ BEGIN IF slug<>'deckverse' OR schema_name<>'deckverse' THEN RAISE EXCEPTION 'bad scope'; END IF; RETURN slug; END $$;",
"CREATE TABLE deckverse.rooms (id uuid PRIMARY KEY, code varchar(6) NOT NULL UNIQUE CHECK(code ~ '^[A-Z0-9]{6}$'), mode text NOT NULL CHECK(mode IN ('same','remote')),status text NOT NULL DEFAULT 'lobby' CHECK(status IN ('lobby','playing','finished')),state jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',reveal_mode text NOT NULL DEFAULT 'auto' CHECK(reveal_mode IN ('auto','manual')),reveal_seconds smallint NOT NULL DEFAULT 2 CHECK(reveal_seconds IN (2,3,5,8)),reveal_until timestamptz,reveal_acks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(reveal_acks)='array'));",
"CREATE TABLE deckverse.players(room_id uuid NOT NULL REFERENCES deckverse.rooms(id) ON DELETE CASCADE,seat smallint NOT NULL CONSTRAINT players_seat_check CHECK(seat IN (0,1)),name varchar(40) NOT NULL,token_hash char(64) NOT NULL CHECK(token_hash ~ '^[0-9a-f]{64}$'),ready boolean NOT NULL DEFAULT false,active boolean NOT NULL DEFAULT true,joined_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(room_id,seat));",
"CREATE INDEX deckverse_players_hash_idx ON deckverse.players(room_id,token_hash); CREATE INDEX deckverse_rooms_expiry_idx ON deckverse.rooms(expires_at);",
"ALTER TABLE deckverse.rooms ENABLE ROW LEVEL SECURITY; ALTER TABLE deckverse.players ENABLE ROW LEVEL SECURITY;",
'CREATE POLICY deckverse_rooms_app_only ON deckverse.rooms FOR ALL TO deckverse_app USING(true) WITH CHECK(true);',
'CREATE POLICY deckverse_players_app_only ON deckverse.players FOR ALL TO deckverse_app USING(true) WITH CHECK(true);',
'GRANT USAGE ON SCHEMA deckverse TO deckverse_app; GRANT SELECT,INSERT,UPDATE,DELETE ON deckverse.rooms,deckverse.players TO deckverse_app;',
"INSERT INTO deckverse.rooms(id,code,mode,status,state,reveal_acks,expires_at) VALUES ('11111111-1111-1111-1111-111111111111','ABC123','remote','playing','{\"round\":8,\"chooser\":1}'::jsonb,'[0]'::jsonb,'2027-01-01'),('22222222-2222-2222-2222-222222222222','DEF456','same','lobby',NULL,'[]'::jsonb,'2027-02-01');",
"INSERT INTO deckverse.players(room_id,seat,name,token_hash,ready,active,last_seen_at) VALUES ('11111111-1111-1111-1111-111111111111',0,'Host',repeat('a',64),true,true,'2026-10-19'),('11111111-1111-1111-1111-111111111111',1,'Guest',repeat('b',64),true,true,'2026-10-19'),('22222222-2222-2222-2222-222222222222',0,'Other',repeat('c',64),true,true,'2026-10-19');"
];
const fingerprint="SELECT md5((SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]') FROM (SELECT id,code,mode,status,state,created_at,updated_at,expires_at,reveal_mode,reveal_seconds,reveal_until,reveal_acks FROM deckverse.rooms) x) || (SELECT coalesce(jsonb_agg(to_jsonb(y) ORDER BY y.room_id,y.seat)::text,'[]') FROM (SELECT room_id,seat,name,token_hash,ready,active,joined_at,last_seen_at FROM deckverse.players) y))";
test('migration scripts are self-scoped, bounded, and avoid unapproved destructive statements',()=>{
 for(const file of migrations){
  const source=requireText(file);
  assert.match(source,/hub\.assert_app_scope\('deckverse'\s*,\s*'deckverse'\)/);
  assert.match(source,/SET lock_timeout = '3s'/);
  assert.match(source,/SET statement_timeout = '30s'/);
  const noncomments=source.split('\n').filter(s=>!s.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(noncomments,/\b(?:DROP\s+TABLE|DROP\s+SCHEMA|TRUNCATE|ALTER\s+ROLE|CREATE\s+ROLE|SET\s+ROLE|DELETE\s+FROM)\b/i);
 }
});
function requireText(name){return readFileSync(path.join(root,'migrations',name),'utf8')}

const bin=binaryDirectory();
const supported=!!bin && typeof process.getuid==='function' && process.getuid()!==0;
test('real local PG: backup, double-migrate, capacity, restore and locking', {skip:supported?false:'Requires local PostgreSQL and non-root runner'},async()=>{
 const work=mkdtempSync(path.join(tmpdir(),'deckverse-final-release-')),sock=path.join(work,'sock'),dbdir=path.join(work,'db');
 mkdirSync(sock,{mode:0o700});
 const pg={initdb:path.join(bin,'initdb'),ctl:path.join(bin,'pg_ctl'),psql:path.join(bin,'psql'),
   dump:path.join(bin,'pg_dump'),restore:path.join(bin,'pg_restore')};
 const env={PGHOST:sock,PGPORT:String(20000+Math.floor(Math.random()*15000)),
   PGUSER:process.env.USER||'postgres',PGDATABASE:'postgres',PGPASSWORD:'',PGCONNECT_TIMEOUT:'3'};
 const execute=(s,overrides={})=>run(pg.psql,['-X','-q','-At','-v','ON_ERROR_STOP=1','-c',s],{...env,...overrides});
 const attempt=(s,ok)=>run(pg.psql,['-X','-q','-At','-v','ON_ERROR_STOP=1','-c',s],env,ok);
 const migration=(name,ok=true)=>run(pg.psql,['-X','-q','-v','ON_ERROR_STOP=1','--single-transaction',
   '-f',path.join(root,'migrations',name)],env,ok);
 let live=false;
 try {
  run(pg.initdb,['-D',dbdir,'--auth-local=trust','--auth-host=reject','--no-instructions'],env);
  run(pg.ctl,['-D',dbdir,'-l',path.join(work,'postgres.log'),'-o',
    "-c listen_addresses='' -c unix_socket_directories='"+sock+"' -p "+env.PGPORT+" -c fsync=off",
    '-w','start'],env);
  live=true;
  console.log('DISPOSABLE_PG_VERSION '+execute('SHOW server_version'));
  execute(legacyFixture.join('\n'));
  const baseline=execute(fingerprint);
  assert.match(baseline,/^[a-f0-9]{32}$/);
  const backup=path.join(work,'deckverse-v1-only.dump');
  run(pg.dump,['-Fc','--schema=deckverse','--file='+backup,'--dbname=postgres'],env);
  console.log('DISPOSABLE_BACKUP_CREATED fictional deckverse schema only');
  for(let pass=0;pass<2;pass++){
   for(const name of migrations)migration(name);
   assert.equal(execute(fingerprint),baseline,'existing player/room rows altered by pass '+(pass+1));
  }
  assert.equal(execute("SELECT count(*) FROM deckverse.rooms WHERE player_count=2 AND host_seat=0 AND presence_version=0"),'2');
  assert.equal(execute("SELECT count(*) FROM deckverse.players WHERE left_at IS NULL"),'3');
  assert.equal(execute("SELECT count(*) FROM deckverse.players"),'3');
  assert.equal(execute("SELECT count(*) FROM pg_trigger WHERE tgrelid IN ('deckverse.rooms'::regclass,'deckverse.players'::regclass) AND tgname LIKE 'deckverse_%_capacity_guard'"),'2');
  assert.equal(execute("SELECT relrowsecurity::text||':'||relforcerowsecurity::text FROM pg_class WHERE oid='deckverse.rate_limit_counters'::regclass"),'true:true');
  assert.equal(execute("SELECT has_table_privilege('deckverse_app','deckverse.rate_limit_counters','SELECT,INSERT,UPDATE,DELETE')"),'t');
  for(const role of ['anon','authenticated','service_role'])
   assert.equal(execute("SELECT has_table_privilege('"+role+"','deckverse.rate_limit_counters','SELECT')"),'f');
  const old2="22222222-2222-2222-2222-222222222222";
  const insertSeat=(room,seat)=>"INSERT INTO deckverse.players(room_id,seat,name,token_hash) VALUES ('"+room+"',"+seat+",'Test"+seat+"',repeat('e',64))";
  attempt(insertSeat(old2,2),false); // 004 new cross-table constraint
  const new3="33333333-3333-3333-3333-333333333333";
  const new4="44444444-4444-4444-4444-444444444444";
  execute("INSERT INTO deckverse.rooms(id,code,mode,status,player_count) VALUES ('"+new3+"','GHI789','same','lobby',3),('"+new4+"','JKL012','same','lobby',4)");
  execute(insertSeat(new3,0));execute(insertSeat(new3,1));execute(insertSeat(new3,2));
  attempt(insertSeat(new3,3),false);
  execute(insertSeat(new4,3));
  attempt(insertSeat(new4,4),false);
  attempt("UPDATE deckverse.rooms SET player_count=2 WHERE id='"+new3+"'",false);
  assert.equal(execute("SELECT player_count FROM deckverse.rooms WHERE id='"+new3+"'"),'3');
  execute("SET ROLE deckverse_app; INSERT INTO deckverse.rate_limit_counters(scope,key_hash,window_start,expires_at) VALUES ('join',repeat('f',64),now(),now()+interval '15 minutes'); RESET ROLE;");
  assert.equal(execute("SELECT hits FROM deckverse.rate_limit_counters WHERE scope='join'"),'1');
  assert.equal(execute(fingerprint).length,32);

  // Prove an ALTER is bounded by the migration lock_timeout and leaves no half-upgrade.
  const holder=spawn(pg.psql,['-X','-q','-At','-v','ON_ERROR_STOP=1',
   '-c','BEGIN; LOCK TABLE deckverse.players IN ACCESS SHARE MODE; SELECT 12345;',
   '-c','SELECT pg_sleep(6); COMMIT;'],{env:{...process.env,...env},stdio:['ignore','pipe','pipe']});
  const marker=await new Promise((resolve,reject)=>{
   let buf='';const to=setTimeout(()=>reject(Error('Lock holder never acquired relation')),5000);
   holder.stdout.on('data',chunk=>{buf+=String(chunk);if(buf.includes('12345')){clearTimeout(to);resolve(true)}});
   holder.on('exit',code=>{if(!buf.includes('12345')){clearTimeout(to);reject(Error('Lock holder exited '+code))}});
  });
  assert.equal(marker,true);
  const start=Date.now();
  migration(migrations[0],false);
  assert.ok(Date.now()-start<5800,'lock acquisition did not time out as planned');
  holder.kill('SIGTERM');
  // Restore the pre-migration V1 snapshot to a second fictional database in
  // the SAME disposable cluster. Never restore to production or other projects.
  execute('CREATE DATABASE deckverse_restore');
  run(pg.restore,['--dbname=deckverse_restore','--no-owner',backup],env);
  const rest={PGDATABASE:'deckverse_restore'};
  assert.equal(execute(fingerprint,rest),baseline,'recovered legacy room/session rows differ from backup');
  assert.equal(execute("SELECT to_regclass('deckverse.rate_limit_counters') IS NULL",rest),'t');
  assert.equal(execute("SELECT count(*) FROM pg_constraint WHERE conrelid='deckverse.players'::regclass AND conname='players_seat_check' AND pg_get_constraintdef(oid) LIKE '%ARRAY[0, 1]%'",rest),'1');
  assert.equal(execute("SELECT count(*) FROM deckverse.rooms",rest),'2');
  assert.equal(execute("SELECT count(*) FROM deckverse.players",rest),'3');
  console.log('DISPOSABLE_BACKUP_RESTORE_PASS: original V1 schema and hashed room/session rows exactly recovered');
 }finally{
  if(live)try{run(pg.ctl,['-D',dbdir,'-m','immediate','-w','stop'],env)}catch{}
  rmSync(work,{recursive:true,force:true});
 }
});
