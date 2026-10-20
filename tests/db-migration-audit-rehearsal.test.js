// Disposable local PostgreSQL only. No Supabase connection, secrets or production writes.
// npm test automatically runs the static check and, when initdb/pg_ctl/psql are present
// under a non-root user, also executes two full SQL replay passes on an isolated cluster.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync,readdirSync,existsSync,accessSync,constants} from 'node:fs';
import {readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const names=['004_multiplayer_rooms.sql','005_deckverse_rate_limits.sql','006_deckverse_presence.sql'];
const read=name=>readFileSync(path.join(root,'migrations',name),'utf8');
const bins=()=>{
  let dirs=(process.env.PATH||'').split(path.delimiter);
  if(existsSync('/usr/lib/postgresql'))dirs=[...readdirSync('/usr/lib/postgresql').sort().reverse().map(v=>'/usr/lib/postgresql/'+v+'/bin'),...dirs];
  for(const d of dirs)if(['initdb','pg_ctl','psql'].every(n=>{
    try{accessSync(path.join(d,n),constants.X_OK);return true}catch{return false}
  }))return d;
  return null;
};
function call(cmd,args,env={}){
  const r=spawnSync(cmd,args,{env:{...process.env,...env},encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
  if(r.error||r.status!==0)throw Error(path.basename(cmd)+' failed: '+String(r.stderr||r.error?.message||r.stdout).slice(0,800));
  return r.stdout.trim();
}
test('004-006 are read-only audited for obvious out-of-scope DDL and expected objects',()=>{
  for(const n of names){
    const s=read(n);
    assert.match(s,/SELECT hub\.assert_app_scope\(\s*'deckverse'\s*,\s*'deckverse'\s*\)/i);
    const noComments=s.split('\n').filter(line=>!line.trim().startsWith('--')).join('\n');
    assert.doesNotMatch(noComments,/\b(DROP\s+SCHEMA|TRUNCATE|DELETE\s+FROM|DROP\s+TABLE|CREATE\s+ROLE|ALTER\s+ROLE|CREATE\s+EXTENSION)\b/i);
    assert.doesNotMatch(noComments,/\b(public|auth|storage)\s*\./i);
  }
  assert.match(read(names[0]),/players_seat_check/);
  assert.match(read(names[1]),/FORCE ROW LEVEL SECURITY/);
  assert.match(read(names[2]),/presence_version/);
});
const bin=bins(),eligible=bin&&typeof process.getuid==='function'&&process.getuid()!==0;
test('004->005->006 apply and rerun against disposable PostgreSQL preserving legacy rooms and sessions',
  {skip:eligible?false:'No local PostgreSQL binaries or currently running as root'},()=>{
    const work=mkdtempSync(path.join(tmpdir(),'deckverse-db-migration-audit-'));
    const dbdir=path.join(work,'db'),sock=path.join(work,'socket'),log=path.join(work,'pg.log');
    mkdirSync(sock,{mode:0o700});
    const initdb=path.join(bin,'initdb'),ctl=path.join(bin,'pg_ctl'),psql=path.join(bin,'psql');
    const port=20000+Math.floor(Math.random()*20000),env={
      PGHOST:sock,PGPORT:String(port),PGDATABASE:'postgres',
      PGUSER:process.env.USER||'postgres',PGPASSWORD:'',PGCONNECT_TIMEOUT:'3'
    };
    const sql=s=>call(psql,['-X','-q','-At','-v','ON_ERROR_STOP=1','-c',s],env);
    const file=n=>call(psql,['-X','-q','-v','ON_ERROR_STOP=1','-1','-f',path.join(root,'migrations',n)],env);
    let running=false;
    try{
      call(initdb,['-D',dbdir,'--auth-local=trust','--auth-host=reject','--no-instructions']);
      call(ctl,['-D',dbdir,'-l',log,'-o',
        "-c listen_addresses='' -c unix_socket_directories='"+sock+"' -p "+port+" -c fsync=off",
        '-w','start']);
      running=true;
      const setup=[
        'CREATE ROLE deckverse_app NOLOGIN; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;',
        'CREATE SCHEMA hub; CREATE SCHEMA deckverse;',
        "CREATE FUNCTION hub.assert_app_scope(slug text,schema_name text) RETURNS text LANGUAGE sql AS $$ SELECT CASE WHEN slug='deckverse' AND schema_name='deckverse' THEN slug ELSE NULL END $$;",
        "CREATE TABLE deckverse.rooms (id uuid PRIMARY KEY,code varchar(6) UNIQUE NOT NULL CHECK(code ~ '^[A-Z0-9]{6}$'),mode text NOT NULL CHECK(mode IN ('same','remote')),status text NOT NULL DEFAULT 'lobby' CHECK(status IN ('lobby','playing','finished')),state jsonb,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',reveal_mode text NOT NULL DEFAULT 'auto' CHECK(reveal_mode IN ('auto','manual')),reveal_seconds smallint NOT NULL DEFAULT 2 CHECK(reveal_seconds IN (2,3,5,8)),reveal_until timestamptz,reveal_acks jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(reveal_acks)='array'));",
        "CREATE TABLE deckverse.players (room_id uuid NOT NULL REFERENCES deckverse.rooms(id) ON DELETE CASCADE,seat smallint NOT NULL CONSTRAINT players_seat_check CHECK(seat IN (0,1)),name varchar(40) NOT NULL,token_hash char(64) NOT NULL CHECK(token_hash ~ '^[0-9a-f]{64}$'),ready boolean NOT NULL DEFAULT false,active boolean NOT NULL DEFAULT true,joined_at timestamptz NOT NULL DEFAULT now(),last_seen_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(room_id,seat));",
        "ALTER TABLE deckverse.rooms ENABLE ROW LEVEL SECURITY; ALTER TABLE deckverse.players ENABLE ROW LEVEL SECURITY;",
        'CREATE POLICY deckverse_rooms_app_only ON deckverse.rooms FOR ALL TO deckverse_app USING(true) WITH CHECK(true);',
        'CREATE POLICY deckverse_players_app_only ON deckverse.players FOR ALL TO deckverse_app USING(true) WITH CHECK(true);',
        'GRANT USAGE ON SCHEMA deckverse TO deckverse_app; GRANT SELECT,INSERT,UPDATE,DELETE ON deckverse.rooms,deckverse.players TO deckverse_app;',
        "INSERT INTO deckverse.rooms(id,code,mode,status,state,reveal_acks,expires_at) VALUES ('11111111-1111-1111-1111-111111111111','ABC123','remote','playing','{\"round\":8}'::jsonb,'[0]'::jsonb,'2027-01-01'),('22222222-2222-2222-2222-222222222222','DEF456','same','lobby',NULL,'[]'::jsonb,'2027-02-01');",
        "INSERT INTO deckverse.players(room_id,seat,name,token_hash,ready,active,last_seen_at) VALUES ('11111111-1111-1111-1111-111111111111',0,'Host',repeat('a',64),true,true,'2026-10-19'),('11111111-1111-1111-1111-111111111111',1,'Guest',repeat('b',64),true,true,'2026-10-19'),('22222222-2222-2222-2222-222222222222',0,'Other',repeat('c',64),true,true,'2026-10-19');"
      ];
      sql(setup.join('\n'));
      const digest="SELECT md5((SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id)::text,'[]') FROM (SELECT id,code,mode,status,state,expires_at,reveal_acks FROM deckverse.rooms) x) || (SELECT coalesce(jsonb_agg(to_jsonb(y) ORDER BY y.room_id,y.seat)::text,'[]') FROM (SELECT room_id,seat,name,token_hash,ready,active,last_seen_at FROM deckverse.players) y))";
      const before=sql(digest);assert.match(before,/^[a-f0-9]{32}$/);
      for(let pass=0;pass<2;pass++){for(const name of names)file(name);assert.equal(sql(digest),before,'Legacy data changed on pass '+(pass+1))}
      assert.equal(sql("SELECT count(*) FROM deckverse.rooms WHERE player_count=2 AND host_seat=0 AND presence_version=0"),'2');
      assert.equal(sql("SELECT count(*) FROM deckverse.players WHERE left_at IS NULL"),'3');
      assert.equal(sql("SELECT count(*) FROM pg_constraint WHERE conrelid='deckverse.players'::regclass AND conname='players_seat_check'"),'1');
      assert.match(sql("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='deckverse.players'::regclass AND conname='players_seat_check'"),/seat *>= *0.*seat *<= *3|BETWEEN +0 +AND +3/i);
      assert.equal(sql("SELECT relrowsecurity::text||':'||relforcerowsecurity::text FROM pg_class WHERE oid='deckverse.rate_limit_counters'::regclass"),'true:true');
      assert.equal(sql("SELECT count(*) FROM pg_policies WHERE schemaname='deckverse' AND tablename='rate_limit_counters' AND policyname='deckverse_app_rate_limit_counter_rw'"),'1');
      assert.equal(sql("SELECT count(*) FROM pg_indexes WHERE schemaname='deckverse' AND indexname='deckverse_rate_limit_expiry_idx'"),'1');
      assert.equal(sql("SELECT has_table_privilege('deckverse_app','deckverse.rate_limit_counters','SELECT,INSERT,UPDATE,DELETE')"),'t');
      for(const role of ['anon','authenticated','service_role'])
        assert.equal(sql("SELECT has_table_privilege('"+role+"','deckverse.rate_limit_counters','SELECT')"),'f');
      sql("BEGIN; INSERT INTO deckverse.players(room_id,seat,name,token_hash) VALUES ('22222222-2222-2222-2222-222222222222',2,'Third',repeat('d',64)),('22222222-2222-2222-2222-222222222222',3,'Fourth',repeat('e',64)); ROLLBACK;");
      const bad=spawnSync(psql,['-X','-q','-v','ON_ERROR_STOP=1','-c',"INSERT INTO deckverse.players(room_id,seat,name,token_hash) VALUES ('22222222-2222-2222-2222-222222222222',4,'Invalid',repeat('e',64))"],{env:{...process.env,...env},encoding:'utf8',timeout:10000});
      assert.notEqual(bad.status,0,'seat 4 must be rejected');
      sql("SET ROLE deckverse_app; INSERT INTO deckverse.rate_limit_counters(scope,key_hash,window_start,expires_at) VALUES ('join',repeat('f',64),now(),now()+interval '15 minutes'); RESET ROLE;");
      assert.equal(sql("SELECT hits FROM deckverse.rate_limit_counters WHERE scope='join'"),'1');
      assert.equal(sql(digest),before);
      console.log('PASS: disposable PostgreSQL; 004/005/006 twice, data hash stable, grants/RLS, seat bounds and app-role insert');
    }finally{
      if(running)try{call(ctl,['-D',dbdir,'-m','immediate','-w','stop'])}catch{}
      rmSync(work,{recursive:true,force:true});
    }
  });
