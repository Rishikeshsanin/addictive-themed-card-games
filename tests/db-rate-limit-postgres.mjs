/**
 * Disposable PostgreSQL verification of DeckVerse's real limiter.
 * SAFETY: never connect to Supabase, staging or another database.
 * Run only against a fresh localhost database named deckverse_rate_test.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import test, {before, after} from 'node:test';
import postgres from 'postgres';
import {
  consumeQuota, cleanupExpired, enforceRateLimit, recordRateLimitFailure,
  getClientIP, writeRateLimitResponse, RateLimitError
} from '../src/server/rate-limit.js';

const ADMIN_URL=process.env.PG_ADMIN_URL;
const APP_URL=process.env.PG_APP_URL;
const APP_PASSWORD=process.env.PG_APP_PASSWORD;
for(const [name,value] of Object.entries({PG_ADMIN_URL:ADMIN_URL,PG_APP_URL:APP_URL,PG_APP_PASSWORD:APP_PASSWORD})){
  if(!value)throw new Error(`Refusing PostgreSQL test: missing ${name}`);
}
for(const raw of [ADMIN_URL,APP_URL]){
 const url=new URL(raw);
 if(!['localhost','127.0.0.1','::1'].includes(url.hostname) ||
    url.pathname!=='/deckverse_rate_test' ||
    !['postgres:','postgresql:'].includes(url.protocol) ||
    url.search || url.hash || !url.port || url.port!=='5432'){
   throw new Error('Refusing to connect to a non-disposable localhost database');
 }
}
const admin=postgres(ADMIN_URL,{max:3,prepare:false,ssl:false,connect_timeout:5});
const app=postgres(APP_URL,{max:5,prepare:false,ssl:false,connect_timeout:5});
const pools=Array.from({length:8},()=>postgres(APP_URL,{max:3,prepare:false,ssl:false,connect_timeout:5}));
let setupComplete=false;
const ip=(address='203.0.113.7',headers={})=>({socket:{remoteAddress:address},headers});
const fixed={vercel:false,cleanupChance:0};
function percentile(values,percent){
 const a=[...values].sort((x,y)=>x-y);
 return Math.round(a[Math.min(a.length-1,Math.ceil(percent*a.length)-1)]*100)/100;
}
async function allowed(fn,n){
 for(let j=0;j<n;j++)await fn();
}
async function rejected(fn,scope){
 await assert.rejects(fn,e=>e instanceof RateLimitError&&(!scope||e.scope===scope)&&e.retryAfterSeconds>=1);
}
before(async()=>{
 // All DDL, privileges, and fixture rows below exist ONLY in CI's local test database.
 const roles=['deckverse_app','anon','authenticated','service_role'];
 for(const role of roles){
   const safe=role==='deckverse_app'?`CREATE ROLE deckverse_app LOGIN PASSWORD '${APP_PASSWORD.replaceAll("'","''")}'`:
     `CREATE ROLE ${role} NOLOGIN`;
   await admin.unsafe(safe);
 }
 await admin.unsafe('CREATE SCHEMA deckverse');
 await admin.unsafe('CREATE SCHEMA hub');
 // This is an ephemeral test-only substitute for the real Project Hub guard.
 await admin.unsafe(`CREATE FUNCTION hub.assert_app_scope(app text, schema_name text)
   RETURNS boolean LANGUAGE plpgsql AS $$
   BEGIN
     IF app <> 'deckverse' OR schema_name <> 'deckverse' THEN
       RAISE EXCEPTION 'outside deckverse scope';
     END IF;
     RETURN true;
   END $$`);
 await admin.unsafe('GRANT USAGE ON SCHEMA deckverse TO deckverse_app');
 const migration=await readFile(new URL('../migrations/005_deckverse_rate_limits.sql',import.meta.url),'utf8');
 assert.match(migration,/hub\.assert_app_scope\('deckverse','deckverse'\)/);
 assert.doesNotMatch(migration,/\b(?:DROP\s+SCHEMA|TRUNCATE)\b/i);
 await admin.unsafe(migration);
 // Prove this review-only migration can be run twice in a fresh scratch database.
 await admin.unsafe(migration);
 setupComplete=true;
 console.log('DB integration fixture: migration 005 twice on localhost disposable deckverse_rate_test');
});
after(async()=>{
 await Promise.allSettled([...pools.map(p=>p.end({timeout:2})),app.end({timeout:2}),admin.end({timeout:2})]);
});

test('migration RLS, isolated grants, scope and index are enforceable',async()=>{
 assert.ok(setupComplete);
 const [table]=await admin`
  SELECT c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='deckverse' AND c.relname='rate_limit_counters'`;
 assert.equal(table.rls,true);assert.equal(table.force_rls,true);
 const [perms]=await admin`SELECT
  has_table_privilege('deckverse_app','deckverse.rate_limit_counters','INSERT') AS app_insert,
  has_table_privilege('deckverse_app','deckverse.rate_limit_counters','DELETE') AS app_delete,
  has_table_privilege('anon','deckverse.rate_limit_counters','SELECT') AS anon_select,
  has_table_privilege('authenticated','deckverse.rate_limit_counters','INSERT') AS auth_insert,
  has_table_privilege('service_role','deckverse.rate_limit_counters','SELECT') AS service_select`;
 assert.deepEqual([perms.app_insert,perms.app_delete,perms.anon_select,perms.auth_insert,perms.service_select],
  [true,true,false,false,false]);
 const indexes=await admin`SELECT indexname FROM pg_indexes
  WHERE schemaname='deckverse' AND tablename='rate_limit_counters'`;
 assert.ok(indexes.some(x=>x.indexname==='deckverse_rate_limit_expiry_idx'));
 assert.ok(indexes.some(x=>x.indexname==='deckverse_rate_limit_counter_pk'));
 await assert.rejects(()=>admin`SELECT hub.assert_app_scope('other','public')`,/outside deckverse scope/);
 const [identity]=await app`SELECT current_user AS role`;
 assert.equal(identity.role,'deckverse_app');
 console.log('DB security: RLS forced, app role CRUD scoped, browser/service roles denied, expiry and PK indexes present');
});

test('200 attempts from eight independent pools are atomic across connections',async()=>{
 const params={scope:'db-200-way',subject:'synthetic-actor',max:31,seconds:3600};
 const t0=performance.now();
 const outcomes=await Promise.allSettled(Array.from({length:200},(_,i)=>{
   const db=pools[i%pools.length], started=performance.now();
   return consumeQuota(db,params).then(value=>({value,ms:performance.now()-started}),
     error=>{error.measureMs=performance.now()-started;throw error;});
 }));
 const accepted=outcomes.filter(x=>x.status==='fulfilled');
 const denied=outcomes.filter(x=>x.status==='rejected'&&x.reason instanceof RateLimitError);
 const errors=outcomes.filter(x=>x.status==='rejected'&&!(x.reason instanceof RateLimitError));
 assert.equal(errors.length,0,errors[0]?.reason?.stack||'unexpected error');
 assert.equal(accepted.length,31);
 assert.equal(denied.length,169);
 const [stored]=await app`SELECT count(*)::int AS buckets, max(hits)::int AS hits
   FROM deckverse.rate_limit_counters WHERE scope='db-200-way'`;
 assert.equal(stored.buckets,1);assert.equal(stored.hits,31);
 const ms=outcomes.map(x=>x.status==='fulfilled'?x.value.ms:x.reason.measureMs);
 console.log(JSON.stringify({scenario:'real-pg-200',requests:200,pools:8,maxConnections:24,
    accepted:accepted.length,denied:denied.length,storedHits:stored.hits,
    wallMs:Math.round(performance.now()-t0),p50Ms:percentile(ms,.5),p95Ms:percentile(ms,.95)}));
});

test('server actions, wrong-code guessing and failed sessions use durable policies',async()=>{
 const ip1=ip('198.51.100.30');
 await allowed(()=>enforceRateLimit(app,ip1,{route:'game',action:'create'},fixed),8);
 await rejected(()=>enforceRateLimit(app,ip1,{route:'game',action:'create'},fixed),'create-10m');
 const ip2=ip('198.51.100.31');
 await allowed(()=>enforceRateLimit(app,ip2,{route:'game',action:'join',code:'ABCDEF'},fixed),8);
 await rejected(()=>enforceRateLimit(app,ip2,{route:'game',action:'join',code:'ABCDEF'},fixed),'join-code-5m');
 await enforceRateLimit(app,ip2,{route:'game',action:'join',code:'FEDCBA'},fixed);
 const ip3=ip('198.51.100.32');
 for(let i=0;i<12;i++){
    const guessedCode=String(i).padStart(6,'0');
    await enforceRateLimit(app,ip3,{route:'game',action:'join',code:guessedCode},fixed);
    await recordRateLimitFailure(app,ip3,{kind:'invalid-code'},{vercel:false});
 }
 await assert.rejects(async()=>{
  await enforceRateLimit(app,ip3,{route:'game',action:'join',code:'BBBBBB'},fixed);
  await recordRateLimitFailure(app,ip3,{kind:'invalid-code'},{vercel:false});
 },e=>e instanceof RateLimitError&&e.scope==='invalid-code-10m');
 const ip4=ip('198.51.100.33');
 await allowed(()=>recordRateLimitFailure(app,ip4,{kind:'auth-failure'},{vercel:false}),15);
 await rejected(()=>recordRateLimitFailure(app,ip4,{kind:'auth-failure'},{vercel:false}),'auth-failure-5m');
 console.log('DB actions: create 8/9 throttled; per-code join 8/9 throttled; bad-code 12/13 throttled; bad-session 15/16 throttled');
});

test('LiveKit issuance is bounded per IP and per synthetic session',async()=>{
 const r=ip('198.51.100.90'),a='a'.repeat(64),b='b'.repeat(64);
 await allowed(()=>enforceRateLimit(app,r,{route:'livekit',token:a,code:'ABCDEF'},fixed),15);
 await rejected(()=>enforceRateLimit(app,r,{route:'livekit',token:a,code:'ABCDEF'},fixed),'token-session-1m');
 await enforceRateLimit(app,r,{route:'livekit',token:b,code:'ABCDEF'},fixed);
 const [rows]=await app`SELECT count(*)::int AS n
   FROM deckverse.rate_limit_counters WHERE scope='token-session-1m'`;
 assert.equal(rows.n,2);
 console.log('DB LiveKit: same session 15 accepted, 16th denied; separate session accepted; no LiveKit Cloud used');
});

test('shared household IP allows four players polling, refresh and reconnect',async()=>{
 const req=ip('192.0.2.90');const samples=[];
 for(let i=0;i<4;i++){
   await enforceRateLimit(app,req,{route:'game',action:'join',code:['ROOM01','ROOM02','ROOM03','ROOM04'][i]},fixed);
 }
 for(let i=0;i<4;i++){
   for(let j=0;j<90;j++){
    const start=performance.now();
    await enforceRateLimit(app,req,{route:'game',action:'get'},fixed);
    samples.push(performance.now()-start);
   }
 }
 // Refresh/reconnect is read-poll rather than creation; mutation headroom remains.
 await enforceRateLimit(app,req,{route:'game',action:'heartbeat'},fixed);
 await enforceRateLimit(app,req,{route:'game',action:'get'},fixed);
 console.log(JSON.stringify({scenario:'four-player-same-nat',polls:361,failures:0,
  p50Ms:percentile(samples,.5),p95Ms:percentile(samples,.95)}));
});

test('spoofed forwarding chains and missing trusted identity never bypass quotas',async()=>{
 const req=ip('192.0.2.42',{'x-forwarded-for':'8.8.8.8','x-vercel-forwarded-for':'203.0.113.20'});
 assert.equal(getClientIP(req,{vercel:false}),'192.0.2.42');
 assert.equal(getClientIP(req,{vercel:true}),'203.0.113.20');
 assert.equal(getClientIP({...req,headers:{'x-vercel-forwarded-for':'8.8.8.8, 9.9.9.9'}},{vercel:true}),null);
 const unknown=ip('untrusted',{'x-forwarded-for':'192.0.2.41'});
 await allowed(()=>enforceRateLimit(app,unknown,{route:'game',action:'create'},fixed),3);
 await rejected(()=>enforceRateLimit(app,unknown,{route:'game',action:'create'},fixed),'create-10m');
 const vhost=ip('192.0.2.50',{'x-vercel-forwarded-for':'2001:db8::beef'});
 await enforceRateLimit(app,vhost,{route:'game',action:'create'},
   {vercel:true,cleanupChance:0});
 const [s]=await app`SELECT count(*)::int AS n FROM deckverse.rate_limit_counters
   WHERE scope='create-10m' AND hits>=1`;
 assert.ok(s.n>=3);
 console.log('DB identity: untrusted x-forwarded-for ignored; Vercel-only single header used; malformed/missing IP shared fallback capped at 3 creates');
});

test('real database time drives rolling one-second windows and Retry-After 429',async()=>{
 const q={scope:'db-expiry-window',subject:'unit-clock',max:1,seconds:1};
 await consumeQuota(app,q);
 let thrown;
 try{await consumeQuota(app,q);}catch(e){thrown=e;}
 assert.ok(thrown instanceof RateLimitError);
 assert.ok(thrown.retryAfterSeconds>=1&&thrown.retryAfterSeconds<=1);
 let payload,status;const headers={};
 const res={setHeader(k,v){headers[k]=v;},status(v){status=v;return this;},
   json(v){payload=v;return this;}};
 assert.equal(writeRateLimitResponse(res,thrown),true);
 assert.equal(status,429);assert.equal(headers['retry-after'],'1');
 assert.equal(payload.retryAfterSeconds,1);assert.doesNotMatch(JSON.stringify(payload),/unit-clock/);
 await new Promise(resolve=>setTimeout(resolve,1250));
 const allowed=await consumeQuota(app,q);
 assert.equal(allowed.hits,1);
 const [sum]=await app`SELECT count(*)::int AS n FROM deckverse.rate_limit_counters
   WHERE scope='db-expiry-window'`;
 assert.equal(sum.n,2);
 console.log('DB time: 1s window rollover PASS, retry-after 1s, safe 429 JSON PASS');
});

test('bounded indexed cleanup reclaims expired rows under limited role',async()=>{
 await admin.unsafe(`INSERT INTO deckverse.rate_limit_counters
   (scope,key_hash,window_start,expires_at,hits)
   SELECT 'db-cleanup', repeat(md5(g::text),2),
     statement_timestamp()-interval '1 hour',statement_timestamp()-interval '5 minutes',1
   FROM generate_series(1,700) g`);
 const explain=await app.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
   SELECT ctid FROM deckverse.rate_limit_counters
   WHERE expires_at < statement_timestamp()
   ORDER BY expires_at LIMIT 256 FOR UPDATE SKIP LOCKED`);
 const plan=explain[0]['QUERY PLAN'][0];
 const naturalIndexUse=JSON.stringify(plan.Plan).includes('deckverse_rate_limit_expiry_idx');
 console.log(JSON.stringify({scenario:'expiry-cleanup-plan',usedIndex:naturalIndexUse,
   rootNode:plan.Plan['Node Type'],executionMs:plan['Execution Time']}));
 let removed=0;const sizes=[];
 for(let i=0;i<3;i++){
  const n=await cleanupExpired(app,{batch:256});
  assert.ok(n<=256);removed+=n;sizes.push(n);
 }
 assert.equal(removed,700);
 const [remain]=await app`SELECT count(*)::int AS n FROM deckverse.rate_limit_counters
  WHERE scope='db-cleanup'`;
 assert.equal(remain.n,0);
 const [index]=await admin`SELECT pg_relation_size('deckverse.deckverse_rate_limit_expiry_idx')::bigint AS bytes`;
 assert.ok(Number(index.bytes)>0);
 console.log(JSON.stringify({scenario:'expired-gc',seeded:700,deleted:removed,batches:sizes,
  expiryIndexBytes:Number(index.bytes)}));
});

test('expiry index handles larger high-cardinality counter growth efficiently',async()=>{
 await admin.unsafe(`INSERT INTO deckverse.rate_limit_counters
   (scope,key_hash,window_start,expires_at,hits)
   SELECT 'db-index-scale',repeat(md5('scale-'||g::text),2),
     statement_timestamp()-interval '2 hours',
     CASE WHEN g <= 1200 THEN statement_timestamp()-interval '3 minutes'
     ELSE statement_timestamp()+interval '30 minutes' END,1
   FROM generate_series(1,12000) g`);
 await admin.unsafe('ANALYZE deckverse.rate_limit_counters');
 const rows=await app.unsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
   SELECT ctid FROM deckverse.rate_limit_counters
   WHERE expires_at < statement_timestamp()
   ORDER BY expires_at LIMIT 256 FOR UPDATE SKIP LOCKED`);
 const plan=rows[0]['QUERY PLAN'][0];
 const usedIndex=JSON.stringify(plan.Plan).includes('deckverse_rate_limit_expiry_idx');
 console.log(JSON.stringify({scenario:'large-expiry-index',totalSeeded:12000,
   expiredSeeded:1200,usedIndex,executionMs:plan['Execution Time']}));
 assert.equal(usedIndex,true,'Expected expiry index for 12K rows and bounded expired-row lookup');
});

test('backend query failure is fail-closed; new connection retains counters',async()=>{
 const db=postgres(APP_URL,{max:1,prepare:false,ssl:false});
 await consumeQuota(db,{scope:'db-recovery',subject:'known-actor',max:1,seconds:3600});
 await db.end({timeout:2});
 await assert.rejects(()=>consumeQuota(db,{scope:'db-recovery',subject:'known-actor',max:1,seconds:3600}));
 await rejected(()=>consumeQuota(app,{scope:'db-recovery',subject:'known-actor',max:1,seconds:3600}),'db-recovery');
 console.log('DB failure: closed client fails rather than allowing call; fresh client sees persisted quota');
});

test('no raw token/IP/code stored and no unrestricted table growth from denied bursts',async()=>{
 const address='198.51.100.66';const token='e'.repeat(64);
 await allowed(()=>enforceRateLimit(app,ip(address),{route:'livekit',token,code:'ABCDEF'},fixed),15);
 await rejected(()=>enforceRateLimit(app,ip(address),{route:'livekit',token,code:'ABCDEF'},fixed));
 const [count]=await app`SELECT count(*)::int AS n,max(hits)::int AS max_hit
  FROM deckverse.rate_limit_counters WHERE scope='token-session-1m'`;
 assert.ok(count.n>=3);assert.ok(count.max_hit<=15);
 const leaked=await admin`SELECT count(*)::int AS n FROM deckverse.rate_limit_counters
   WHERE key_hash LIKE ${address+'%'} OR key_hash LIKE ${token+'%'}`;
 assert.equal(leaked[0].n,0);
 console.log('DB storage: rejected traffic does not create new token buckets or increment over cap; no raw secrets stored');
});
