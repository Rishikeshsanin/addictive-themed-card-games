/**
 * DeckVerse-only PostgreSQL rate limits. No process-local counters or new service.
 * Integrate in the API handlers; this module does not modify shared endpoints.
 */
import {createHash, randomInt} from 'node:crypto';
import {isIP} from 'node:net';

// Fixed windows are intentionally generous to a four-player household sharing one IP.
// Keep these policies server-owned; do not accept quotas or scopes from request bodies.
export const POLICIES = Object.freeze({
  create: Object.freeze([{scope:'create-10m',max:8,seconds:600},{scope:'create-1h',max:24,seconds:3600}]),
  join: Object.freeze([{scope:'join-5m',max:40,seconds:300}]),
  'join-code': Object.freeze([{scope:'join-code-5m',max:8,seconds:300}]),
  token: Object.freeze([{scope:'token-ip-1h',max:240,seconds:3600}]),
  'token-session': Object.freeze([{scope:'token-session-1m',max:15,seconds:60}]),
  'game-read': Object.freeze([{scope:'game-read-1m',max:1200,seconds:60}]),
  'game-write': Object.freeze([{scope:'game-write-1m',max:180,seconds:60}]),
  'invalid-code': Object.freeze([{scope:'invalid-code-10m',max:12,seconds:600}]),
  'auth-failure': Object.freeze([{scope:'auth-failure-5m',max:15,seconds:300}]),
});

export class RateLimitError extends Error {
  constructor(retryAfterSeconds, scope) {
    super('Too many requests. Please try again shortly.');
    this.name='RateLimitError'; this.status=429;
    this.retryAfterSeconds=Math.max(1,Math.ceil(retryAfterSeconds));
    this.scope=scope;
  }
}

function normalizeIP(value) {
  if(typeof value!=='string')return null;
  const ip=value.trim();
  // Never choose a client-controlled element of a forwarding chain.
  if(!ip||ip.includes(',')||ip.includes('%')||ip.length>64)return null;
  return isIP(ip)?ip.toLowerCase():null;
}

/** Only trust Vercel-owned forwarding headers when the server itself runs on Vercel. */
export function getClientIP(req, {vercel=process.env.VERCEL==='1'}={}) {
  if(vercel) {
    const raw=req?.headers?.['x-vercel-forwarded-for'];
    return normalizeIP(Array.isArray(raw)?null:raw);
  }
  return normalizeIP(req?.socket?.remoteAddress);
}

const digest=material=>createHash('sha256').update(`deckverse-rate-limit-v2\0${material}`).digest('hex');
const validCode=code=>typeof code==='string'&&/^[A-Z0-9]{6}$/.test(code);
const validToken=token=>typeof token==='string'&&/^[a-f0-9]{64}$/.test(token);

/**
 * One UPSERT per quota. PostgreSQL's unique index and ON CONFLICT serialize concurrent
 * attempts even when separate Vercel function instances race for the same bucket.
 * Bound hits at max to avoid overflowing counts during a sustained denial flood.
 * All times (including Retry-After) come from the DB clock, not server instances.
 */
export async function consumeQuota(sql, {scope,subject,max,seconds}) {
  if(!/^[a-z0-9-]{1,48}$/.test(scope)||typeof subject!=='string'||!subject||
    !Number.isSafeInteger(max)||max<1||max>100000||
    !Number.isSafeInteger(seconds)||seconds<1||seconds>86400)throw new TypeError('Invalid quota');
  const key=digest(subject);
  const rows=await sql`
    WITH bucket AS (
      SELECT floor(extract(epoch FROM statement_timestamp()) / ${seconds})::bigint AS slot
    ), attempt AS (
      INSERT INTO deckverse.rate_limit_counters
        (scope,key_hash,window_start,expires_at,hits)
      SELECT ${scope},${key},to_timestamp(slot * ${seconds}),
        to_timestamp((slot + 1) * ${seconds}) + interval '15 minutes',1
      FROM bucket
      ON CONFLICT (scope,key_hash,window_start)
      DO UPDATE SET hits=deckverse.rate_limit_counters.hits+1
        WHERE deckverse.rate_limit_counters.hits < ${max}
      RETURNING hits
    )
    SELECT (SELECT hits FROM attempt)::integer AS hits,
      greatest(1,ceil(${seconds} - mod(extract(epoch FROM statement_timestamp())::numeric,${seconds})))::integer
        AS retry_after_seconds
  `;
  if(!rows?.length)throw new Error('Rate-limit storage returned no rows');
  const hits=Number(rows[0].hits), retry=Number(rows[0].retry_after_seconds);
  if(rows[0].hits===null||!Number.isFinite(hits)||hits<1){
    if(!Number.isFinite(retry)||retry<1)throw new Error('Invalid rate-limit retry response');
    throw new RateLimitError(retry,scope);
  }
  return {hits,remaining:Math.max(0,max-hits),limit:max,scope};
}

/** Cleanup is opportunistic and bounded; no global pg_cron scheduler required. */
export async function cleanupExpired(sql,{batch=256}={}){
  if(!Number.isSafeInteger(batch)||batch<1||batch>1000)throw new TypeError('Invalid cleanup batch');
  const rows=await sql`
    WITH expired AS (
      SELECT ctid FROM deckverse.rate_limit_counters
      WHERE expires_at < statement_timestamp()
      ORDER BY expires_at
      LIMIT ${batch} FOR UPDATE SKIP LOCKED
    )
    DELETE FROM deckverse.rate_limit_counters AS r USING expired
    WHERE r.ctid=expired.ctid RETURNING r.key_hash
  `;
  return rows.length;
}

function enforceUnknownIPBudget(plan){
  // Unknown IPs share a bucket; never treat missing identity as unrestricted.
  return plan.map(q=>({...q,max:Math.min(q.max,
    q.scope.startsWith('create-')?3:
    q.scope.startsWith('join-')?10:
    q.scope.startsWith('token-')?6:
    q.scope.startsWith('game-read-')?180:30)}));
}

/**
 * Call *before* database room lookup / LiveKit token signing. The same function is
 * used for both endpoints; the caller is responsible for auth and failed-attempt tags.
 * No user-supplied nickname, room code or session token is ever used as a sole quota.
 */
export async function enforceRateLimit(sql,req,{route,action,code,token}={},
  {vercel=process.env.VERCEL==='1',cleanupChance=32,onCleanupError=()=>{}}={}){
  if(route!=='game'&&route!=='livekit')throw new TypeError('Unknown route');
  const ip=getClientIP(req,{vercel});
  const actor=ip?`ip:${ip}`:'ip:unknown';
  let groups=[];
  if(route==='livekit'){
    groups=[...POLICIES.token.map(q=>({q,subject:actor}))];
    if(validToken(token))groups.push(...POLICIES['token-session'].map(q=>({q,subject:`token:${digest(token)}`})));
  }else if(action==='create'){
    groups=POLICIES.create.map(q=>({q,subject:actor}));
  }else if(action==='join'){
    groups=POLICIES.join.map(q=>({q,subject:actor}));
    if(validCode(code))groups.push(...POLICIES['join-code'].map(q=>({q,subject:`${actor}:code:${code}`})));
  }else if(action==='get'){
    groups=POLICIES['game-read'].map(q=>({q,subject:actor}));
  }else {
    groups=POLICIES['game-write'].map(q=>({q,subject:actor}));
  }
  if(!ip)groups=groups.map(({q,subject})=>({q:enforceUnknownIPBudget([q])[0],subject}));
  try {
    const results=[];
    for(const {q,subject} of groups){results.push(await consumeQuota(sql,{scope:q.scope,subject,max:q.max,seconds:q.seconds}));}
    return results;
  } finally {
    // No cleanup work on ordinary requests. Postgres-only, app-scoped, bounded.
    if(Number.isInteger(cleanupChance)&&cleanupChance>0&&randomInt(cleanupChance)===0){
      try{await cleanupExpired(sql);}catch(error){onCleanupError(error);}
    }
  }
}

/** Call on failed room discovery or session authentication, not on every 4xx. */
export async function recordRateLimitFailure(sql,req,{kind}={},options={}){
  const policy=kind==='invalid-code'?POLICIES['invalid-code']:
    kind==='auth-failure'?POLICIES['auth-failure']:null;
  if(!policy)throw new TypeError('Unknown failure kind');
  const ip=getClientIP(req,{vercel:options.vercel??process.env.VERCEL==='1'});
  const subject=ip?`ip:${ip}`:'ip:unknown';
  const limits=ip?policy:enforceUnknownIPBudget(policy);
  const result=[];
  for(const q of limits)result.push(await consumeQuota(sql,{scope:q.scope,subject,max:q.max,seconds:q.seconds}));
  return result;
}

export function writeRateLimitResponse(res,error){
  if(!(error instanceof RateLimitError))return false;
  res.setHeader('retry-after',String(error.retryAfterSeconds));
  res.setHeader('cache-control','no-store');
  res.status(429).json({error:error.message,retryAfterSeconds:error.retryAfterSeconds});
  return true;
}
