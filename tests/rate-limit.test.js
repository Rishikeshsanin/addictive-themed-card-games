import test from 'node:test';
import assert from 'node:assert/strict';
import {
 POLICIES,RateLimitError,getClientIP,consumeQuota,cleanupExpired,
 enforceRateLimit,recordRateLimitFailure,writeRateLimitResponse
} from '../src/server/rate-limit.js';

function mockPostgres(clock=()=>Date.now()) {
 const counters=new Map(), queries=[];
 const sql=async(strings,...params)=>{
  const statement=strings.join('?');queries.push({statement,params});
  if(statement.includes('INSERT INTO deckverse.rate_limit_counters')) {
   const [seconds,scope,hash,s1,s2,max,s3,s4]=params;
   assert.equal(s1,seconds);assert.equal(s2,seconds);
   assert.equal(s3,seconds);assert.equal(s4,seconds);
   const bucket=Math.floor(clock()/1000/seconds);
   const key=`${scope}:${hash}:${bucket}`;
   const end=(bucket+1)*seconds*1000;
   const existing=counters.get(key);
   if(existing&&existing.hits>=max)return [{hits:null,retry_after_seconds:Math.ceil((end-clock())/1000)}];
   const hits=(existing?.hits||0)+1;
   counters.set(key,{hits,expiry:end+900000});
   return [{hits,retry_after_seconds:Math.ceil((end-clock())/1000)}];
  }
  if(statement.includes('DELETE FROM deckverse.rate_limit_counters')){
   const [batch]=params;let removed=0;
   for(const [key,val] of [...counters]){
    if(removed>=batch)break;
    if(val.expiry<clock()){counters.delete(key);removed++;}
   }
   return Array.from({length:removed},()=>({key_hash:'redacted'}));
  }
  throw new Error(`Unexpected SQL: ${statement.slice(0,100)}`);
 };
 return {sql,counters,queries};
}
const req=(ip='203.0.113.9',headers={})=>({socket:{remoteAddress:ip},headers});
const noCleanup={vercel:false,cleanupChance:0};

test('Vercel proxy IP is trusted only on Vercel, not ordinary forwarded headers',()=>{
 const r=req('127.0.0.1',{'x-forwarded-for':'8.8.8.8','x-vercel-forwarded-for':'2001:db8::1'});
 assert.equal(getClientIP(r,{vercel:false}),'127.0.0.1');
 assert.equal(getClientIP(r,{vercel:true}),'2001:db8::1');
 assert.equal(getClientIP({...r,headers:{'x-forwarded-for':'8.8.8.8'}},{vercel:true}),null);
 assert.equal(getClientIP(req('127.0.0.1',{'x-vercel-forwarded-for':'8.8.8.8, 1.2.3.4'}),{vercel:true}),null);
});

test('malformed/missing identity is not trusted',()=>{
 assert.equal(getClientIP(req('evil-address'),{vercel:false}),null);
 assert.equal(getClientIP(req(undefined,{'x-vercel-forwarded-for':['1.2.3.4']}),{vercel:true}),null);
 assert.equal(getClientIP(req('1.2.3.4%eth0'),{vercel:false}),null);
});

test('fixed-window threshold returns 429 with bounded retry',async()=>{
 let time=1000;const db=mockPostgres(()=>time);
 for(let i=0;i<3;i++){
  const result=await consumeQuota(db.sql,{scope:'unit-60',subject:'ip:203.0.113.9',max:3,seconds:60});
  assert.equal(result.hits,i+1);
 }
 await assert.rejects(()=>consumeQuota(db.sql,{scope:'unit-60',subject:'ip:203.0.113.9',max:3,seconds:60}),
  e=>e instanceof RateLimitError&&e.status===429&&e.retryAfterSeconds===59);
 assert.equal([...db.counters.values()][0].hits,3,'denied calls do not grow hit count');
});

test('expiry rotates the window and bounded garbage collector removes stale rows',async()=>{
 let time=59999;const db=mockPostgres(()=>time);
 await consumeQuota(db.sql,{scope:'expiry',subject:'ip:1.2.3.4',max:1,seconds:60});
 await assert.rejects(()=>consumeQuota(db.sql,{scope:'expiry',subject:'ip:1.2.3.4',max:1,seconds:60}),RateLimitError);
 time=60001;
 await consumeQuota(db.sql,{scope:'expiry',subject:'ip:1.2.3.4',max:1,seconds:60});
 assert.equal(db.counters.size,2);
 time=1050000;
 assert.equal(await cleanupExpired(db.sql,{batch:1}),1);
 assert.equal(db.counters.size,1);
 assert.equal(await cleanupExpired(db.sql,{batch:256}),1);
});

test('parallel requests cannot exceed shared quota (atomic upsert mock)',async()=>{
 const db=mockPostgres(()=>1000);
 const values=await Promise.allSettled(Array.from({length:80},()=>consumeQuota(db.sql,
  {scope:'concurrent',subject:'same-actor',max:11,seconds:60})));
 assert.equal(values.filter(v=>v.status==='fulfilled').length,11);
 assert.equal(values.filter(v=>v.status==='rejected'&&v.reason instanceof RateLimitError).length,69);
 assert.equal([...db.counters.values()][0].hits,11);
});

test('hash is stable and storage query includes no raw address, token or room code',async()=>{
 const db=mockPostgres(()=>1000);
 await enforceRateLimit(db.sql,req(),{route:'game',action:'join',code:'ABCDEF'},noCleanup);
 const serialized=JSON.stringify(db.queries);
 assert.doesNotMatch(serialized,/203\.0\.113\.9|ABCDEF/);
 assert.match(serialized,/deckverse\.rate_limit_counters/);
 assert.equal(db.counters.size,2);
});

test('room creation has independent 10-minute and hourly budgets',async()=>{
 const db=mockPostgres(()=>1000);
 for(let i=0;i<8;i++)await enforceRateLimit(db.sql,req(),{route:'game',action:'create'},noCleanup);
 await assert.rejects(()=>enforceRateLimit(db.sql,req(),{route:'game',action:'create'},noCleanup),
  e=>e instanceof RateLimitError&&e.scope==='create-10m');
 assert.equal(db.counters.size,2);
});

test('joining one code is independently bounded without changing other room quotas',async()=>{
 const db=mockPostgres(()=>1000);
 for(let i=0;i<8;i++)await enforceRateLimit(db.sql,req(),{route:'game',action:'join',code:'ABCDEF'},noCleanup);
 await assert.rejects(()=>enforceRateLimit(db.sql,req(),{route:'game',action:'join',code:'ABCDEF'},noCleanup),
  e=>e.scope==='join-code-5m');
 await enforceRateLimit(db.sql,req(),{route:'game',action:'join',code:'FEDCBA'},noCleanup);
});

test('invalid join codes still consume IP-wide budget',async()=>{
 const db=mockPostgres(()=>1000);
 for(let i=0;i<40;i++)await enforceRateLimit(db.sql,req(),{route:'game',action:'join',code:'AAAAAA!'},noCleanup);
 await assert.rejects(()=>enforceRateLimit(db.sql,req(),{route:'game',action:'join',code:'AAAAAA!'},noCleanup),RateLimitError);
});

test('failed authentication/guessing has tighter independent counters',async()=>{
 const db=mockPostgres(()=>1000);
 for(let i=0;i<12;i++)await recordRateLimitFailure(db.sql,req(),{kind:'invalid-code'},{vercel:false});
 await assert.rejects(()=>recordRateLimitFailure(db.sql,req(),{kind:'invalid-code'},{vercel:false}),RateLimitError);
 await recordRateLimitFailure(db.sql,req(),{kind:'auth-failure'},{vercel:false});
 await assert.rejects(()=>recordRateLimitFailure(db.sql,req(),{kind:'bad-name'},{vercel:false}),TypeError);
});

test('shared household IP polling budget supports four frequent clients',async()=>{
 const db=mockPostgres(()=>1000);
 for(let i=0;i<480;i++)await enforceRateLimit(db.sql,req(),{route:'game',action:'get'},noCleanup);
 assert.equal([...db.counters.values()][0].hits,480);
});

test('unknown identities share a constrained bucket, rather than bypassing limits',async()=>{
 const db=mockPostgres(()=>1000);const missing=req('untrusted');
 for(let i=0;i<3;i++)await enforceRateLimit(db.sql,missing,{route:'game',action:'create'},noCleanup);
 await assert.rejects(()=>enforceRateLimit(db.sql,missing,{route:'game',action:'create'},noCleanup),RateLimitError);
});

test('LiveKit issuance is protected by both IP quota and token-specific quota',async()=>{
 const db=mockPostgres(()=>1000),token='a'.repeat(64);
 for(let i=0;i<15;i++)await enforceRateLimit(db.sql,req(),{route:'livekit',token},noCleanup);
 await assert.rejects(()=>enforceRateLimit(db.sql,req(),{route:'livekit',token},noCleanup),e=>e.scope==='token-session-1m');
 await enforceRateLimit(db.sql,req(),{route:'livekit',token:'b'.repeat(64)},noCleanup);
});

test('backend storage failures are fail-closed, not interpreted as permission',async()=>{
 const broken=async()=>{throw new Error('DB down')};
 await assert.rejects(()=>enforceRateLimit(broken,req(),{route:'game',action:'create'},noCleanup),/DB down/);
});

test('cleanup failure is reported but never opens a denied quota',async()=>{
 const db=mockPostgres(()=>1000);let errors=0;
 const proxy=async(strings,...params)=>{
  if(strings.join('?').includes('DELETE FROM deckverse.rate_limit_counters'))throw new Error('cleanup broken');
  return db.sql(strings,...params);
 };
 await enforceRateLimit(proxy,req(),{route:'game',action:'create'},
  {vercel:false,cleanupChance:1,onCleanupError:()=>errors++});
 assert.equal(errors,1);
});

test('429 utility sets Retry-After and safe JSON; other errors untouched',()=>{
 const headers={};let result;
 const res={setHeader:(k,v)=>{headers[k]=v},status(code){result={code};return this},json(body){result.body=body;return this}};
 assert.equal(writeRateLimitResponse(res,new RateLimitError(10,'unit')),true);
 assert.deepEqual(result,{code:429,body:{error:'Too many requests. Please try again shortly.',retryAfterSeconds:10}});
 assert.equal(headers['retry-after'],'10');
 assert.equal(writeRateLimitResponse(res,new Error('oops')),false);
});

test('untrusted policy inputs cannot inject SQL or create unbounded counters',async()=>{
 const db=mockPostgres(()=>1000);
 await assert.rejects(()=>consumeQuota(db.sql,{scope:'any;DROP TABLE',subject:'x',max:2,seconds:60}),TypeError);
 await assert.rejects(()=>consumeQuota(db.sql,{scope:'valid',subject:'x',max:1000000,seconds:60}),TypeError);
 await assert.rejects(()=>cleanupExpired(db.sql,{batch:100000}),TypeError);
 await assert.rejects(()=>enforceRateLimit(db.sql,req(),{route:'unknown'},noCleanup),TypeError);
 assert.equal(db.queries.length,0);
});
