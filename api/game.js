import postgres from 'postgres';
import {createHash,randomBytes,randomInt} from 'node:crypto';
import {getServerTheme,requireCreateTheme,requireSameRoomTheme,themeIdForRoom} from '../src/server/theme-registry.js';
import {startServerThemeMatch,takeServerThemeTurn,themeViewFor} from '../src/server/theme-match.js';
import {revealState,revealDeadline,mayAdvance,validateRevealSettings} from '../src/reveal.js';
import {decideRematch} from '../src/rematch.js';
import {evaluateRoomPresence,retentionSeconds} from '../src/presence.js';
import {enforceRateLimit,recordRateLimitFailure,writeRateLimitResponse} from '../src/server/rate-limit.js';
const dbUrl=process.env.DECKVERSE_DATABASE_URL;
const sql=dbUrl?postgres(dbUrl,{ssl:'require',max:3,prepare:false,idle_timeout:15,connect_timeout:9}):null;
const hash=val=>createHash('sha256').update(val).digest('hex');
const secret=()=>randomBytes(32).toString('hex');
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code=()=>Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const playerCountOf=r=>r.player_count||2;
const newMatch=(n,themeId)=>startServerThemeMatch({playerCount:n,themeId});
const validThemeRequest=body=>{try{return requireCreateTheme(body)}catch{throw fail('Invalid theme or client-controlled deck settings.',400)}};
const roomTheme=(room,proposed)=>{try{return requireSameRoomTheme(room,proposed)}catch{throw fail('Room theme is fixed for this match.',409)}};
const allowedAction=new Set(['create','join','get','ready','start','rematch','select','settings','ack','leave','heartbeat']);
let verified=false;
async function connected(){if(!sql)throw fail('Game rooms are awaiting an isolated database connection. Solo practice is available.',503);if(!verified){const [r]=await sql`select current_user as role`;if(r.role!=='deckverse_app')throw fail('Game backend configuration failed its dedicated-role security check.',503);verified=true;}return sql}
export const safeName=n=>{if(typeof n!=='string'||n.trim().length<2||n.trim().length>24||/[<>\p{Cc}\p{Cf}]/u.test(n))throw fail('Name must be 2–24 visible characters without HTML symbols.');return n.trim()};
export const safeMode=mode=>{if(mode!=='same'&&mode!=='remote')throw fail('Invalid room mode.');return mode};
const safeCode=c=>{if(typeof c!=='string'||!/^[A-Z0-9]{6}$/.test(c))throw fail('Invalid six-character room code.');return c};
const safeToken=t=>{if(typeof t!=='string'||!/^[0-9a-f]{64}$/.test(t))throw fail('Invalid session token.',401);return hash(t)};
async function auth(tx,room,token){const [p]=await tx`select seat,name,ready from deckverse.players where room_id=${room.id} and token_hash=${safeToken(token)} and active=true limit 1`;if(!p)throw fail('Session expired. Rejoin with the room code.',401);return {index:p.seat,name:p.name,ready:p.ready}}
async function readRoom(tx,code,lock=false){const rows=lock?await tx`select * from deckverse.rooms where code=${code} and expires_at>clock_timestamp() for update`:await tx`select * from deckverse.rooms where code=${code} and expires_at>clock_timestamp()`;if(!rows.length)throw fail('Room not found or expired.',404);return rows[0]}
// Derive presence using DB clock. Host transfers are persisted only by room-locked transactions.
function derivePresence(room,players,now){
 const hostSeat=room.host_seat??0;
 return evaluateRoomPresence({players,playerCount:playerCountOf(room),hostSeat,status:room.status,now});
}
// Room-first locking is mandatory: all mutations, leave and expiry sweep serialize
// on deckverse.rooms before touching player rows. Client clocks are never accepted.
async function updatePresence(tx,room,actorSeat,{refresh=true}={}){
 if(refresh){
  await tx`update deckverse.players
    set last_seen_at=greatest(coalesce(last_seen_at,clock_timestamp()),clock_timestamp())
    where room_id=${room.id} and seat=${actorSeat} and active=true`;
  const seconds=retentionSeconds(room.status);
  await tx`update deckverse.rooms
    set expires_at=clock_timestamp()+${seconds}*interval '1 second'
    where id=${room.id} and expires_at>clock_timestamp()`;
 }
 const ps=await tx`select seat,active,last_seen_at,clock_timestamp() as observed_at from deckverse.players
  where room_id=${room.id} and active=true order by seat`;
 const derived=derivePresence(room,ps,ps[0]?.observed_at||Date.now());
 if(derived.hostChanged){
  await tx`update deckverse.rooms set host_seat=${derived.hostSeat},
    presence_version=presence_version+1,updated_at=clock_timestamp()
    where id=${room.id}`;
 }
 return derived;
}
// A single MVCC statement atomically observes room and roster. Do not split into
// two READ COMMITTED queries: host, state and player rows could come from different commits.
// Token hashes are kept strictly server-side and never returned to the browser.
async function snapshot(db,code,token){
 const digest=safeToken(token);
 const rows=await db`select r.*,p.seat as player_seat,p.name as player_name,
   p.ready as player_ready,p.active as player_active,p.token_hash as player_token_hash,
   p.last_seen_at as player_last_seen_at,clock_timestamp() as observed_at
   from deckverse.rooms r
   join deckverse.players p on p.room_id=r.id and p.active=true
   where r.code=${code} and r.expires_at>clock_timestamp()
   order by p.seat`;
 if(!rows.length)throw fail('Room not found or expired.',404);
 const room=rows[0];
 const players=rows.map(p=>({seat:p.player_seat,name:p.player_name,
   ready:p.player_ready,active:p.player_active,token_hash:p.player_token_hash,
   last_seen_at:p.player_last_seen_at}));
 const found=players.find(p=>p.token_hash===digest);
 if(!found)throw fail('Session expired. Rejoin with the room code.',401);
 const me={index:found.seat,name:found.name,ready:found.ready};
 const count=playerCountOf(room);
 const presence=derivePresence(room,players,rows[0].observed_at);
 const activePolicy=room.state?.revealPolicy||{mode:room.reveal_mode,seconds:room.reveal_seconds};
 const reveal=room.state?.last?revealState({...activePolicy,required:count,until:room.reveal_until,acks:room.reveal_acks}):null;
 const themeId=themeIdForRoom(room);
 const theme=getServerTheme(themeId);
 const view=room.state?themeViewFor(room.state,me.index,{roomThemeId:themeId}):null;
 const game=view?{...view,reveal,endReason:room.state.endReason||null,matchNumber:room.state.matchNumber||1,rematchVotes:room.status==='finished'?players.filter(p=>p.ready).map(p=>p.seat):[]}:null;
 return {room:{code:room.code,mode:room.mode,status:room.status,themeId,theme:{name:theme.name,categories:theme.categories},playerCount:count,
   hostSeat:room.host_seat??0,presenceVersion:room.presence_version||0,
   paused:presence.paused,revealSettings:{mode:room.reveal_mode,seconds:room.reveal_seconds}},
   players:players.map(p=>({index:p.seat,name:p.name,ready:p.ready,
     presence:presence.roster.find(x=>x.seat===p.seat)?.state||'unknown'})),me,game};
}
// Soft cleanup ONLY: expired rooms are already inaccessible via readRoom/snapshot.
// Revoke stale seats under room row locks; never delete or rewrite historic games,
// cards, names, tokens or results. Bounded so shared PostgreSQL stays responsive.
export async function sweepExpiredRoomSessions(db,{batch=32}={}){
 if(!Number.isInteger(batch)||batch<1||batch>128)throw new TypeError('Invalid cleanup batch');
 const [result]=await db`with stale as (
   select r.id from deckverse.rooms r
   where r.expires_at<=clock_timestamp()
     and exists(select 1 from deckverse.players p where p.room_id=r.id and p.active=true)
   order by r.expires_at,r.id limit ${batch} for update of r skip locked
 ), revoked as (
   update deckverse.players p set active=false,ready=false
   where p.room_id in (select id from stale) and p.active=true
   returning p.room_id
 ) select count(*)::integer as count from revoked`;
 return result.count;
}

async function create(db,b){
 // Opportunity-based, bounded cleanup; never waits for locked active rooms.
 await sweepExpiredRoomSessions(db);
 const name=safeName(b.name),mode=safeMode(b.mode),count=b.playerCount??2,themeId=validThemeRequest(b),raw=secret(),digest=hash(raw);
 if(![2,3,4].includes(count))throw fail('Room size must be 2, 3 or 4.');
 const [active]=await db`select count(*)::integer as count from deckverse.rooms where expires_at>now() and status in ('lobby','playing')`;if(active.count>300)throw fail('Active-room capacity reached. Try again later.',429);
 for(let tries=0;tries<6;tries++){
 const c=code();try{
 await db.begin(async tx=>{const [r]=await tx`insert into deckverse.rooms(code,mode,status,player_count,theme_id,expires_at) values(${c},${mode},'lobby',${count},${themeId},clock_timestamp()+${retentionSeconds('lobby')}*interval '1 second') returning id`;await tx`insert into deckverse.players(room_id,seat,name,token_hash,ready,last_seen_at) values(${r.id},0,${name},${digest},true,clock_timestamp())`;});
 return {...await snapshot(db,c,raw),token:raw};
 }catch(e){if(e.code!=='23505'||tries===5)throw e}
 }throw fail('Could not create room. Please try again.',503);
}
async function join(db,b){const c=safeCode(b.code),name=safeName(b.name),raw=secret(),digest=hash(raw);
 await db.begin(async tx=>{const r=await readRoom(tx,c,true);roomTheme(r,b.themeId);if(r.status!=='lobby')throw fail('This match has already started.');const existing=await tx`select seat,name from deckverse.players where room_id=${r.id} and active=true`;if(existing.length>=playerCountOf(r))throw fail('This room is full.');if(existing.some(p=>p.name.toLowerCase()===name.toLowerCase()))throw fail('Please choose a different nickname.');const seat=Array.from({length:playerCountOf(r)},(_,i)=>i).find(i=>!existing.some(p=>p.seat===i));await tx`insert into deckverse.players(room_id,seat,name,token_hash,ready,active,last_seen_at) values(${r.id},${seat},${name},${digest},false,true,clock_timestamp()) on conflict (room_id,seat) do update set name=excluded.name,token_hash=excluded.token_hash,ready=false,active=true,left_at=null,last_seen_at=clock_timestamp()`;await tx`update deckverse.rooms set expires_at=clock_timestamp()+${retentionSeconds('lobby')}*interval '1 second' where id=${r.id}`;});
 return {...await snapshot(db,c,raw),token:raw};
}
async function action(db,b){
 const c=safeCode(b.code);safeToken(b.token);
 if(b.action==='get')return snapshot(db,c,b.token);
 if(b.action==='leave'){await db.begin(async tx=>{
  const room=await readRoom(tx,c,true);roomTheme(room,b.themeId);const me=await auth(tx,room,b.token);
  await tx`update deckverse.players set active=false,ready=false,left_at=clock_timestamp()
    where room_id=${room.id} and seat=${me.index}`;
  if(room.status==='playing'&&room.state){
    const state=room.state;state.status=playerCountOf(room)===2?'finished':'aborted';
    state.winner=playerCountOf(room)===2?1-me.index:null;state.endReason='forfeit';
    await tx`update deckverse.rooms set state=${tx.json(state)},status='finished',
      expires_at=clock_timestamp()+${retentionSeconds('finished')}*interval '1 second',
      updated_at=clock_timestamp() where id=${room.id}`;
  }else if(room.status==='lobby'){
    const next=await updatePresence(tx,room,me.index,{refresh:false});
    if(!next.roster.length)await tx`update deckverse.rooms set expires_at=clock_timestamp(),
      status='finished',updated_at=clock_timestamp() where id=${room.id}`;
    else await tx`update deckverse.rooms set expires_at=clock_timestamp()+${retentionSeconds('lobby')}*interval '1 second' where id=${room.id}`;
  }else {
    await tx`update deckverse.rooms set expires_at=clock_timestamp()+${retentionSeconds('finished')}*interval '1 second' where id=${room.id}`;
  }
 });return {ok:true};}
 await db.begin(async tx=>{
   const room=await readRoom(tx,c,true);roomTheme(room,b.themeId);const me=await auth(tx,room,b.token);
   const presence=await updatePresence(tx,room,me.index);
   if(b.action==='heartbeat'){
     // Authenticate and update presence; no gameplay mutation.
   }else if(b.action==='ready'){
     if(room.status!=='lobby')throw fail('Match already started.');
     await tx`update deckverse.players set ready=${b.ready===true} where room_id=${room.id} and seat=${me.index}`;
   }else if(b.action==='settings'){
     if(room.status!=='lobby'&&room.status!=='playing')throw fail('Reveal settings cannot change after the match ends.',409);
     if(me.index!==presence.hostSeat)throw fail('Only the current host can change reveal settings.',403);
     const setting=validateRevealSettings(b.mode,b.seconds);
     await tx`update deckverse.rooms set reveal_mode=${setting.mode},reveal_seconds=${setting.seconds},updated_at=now() where id=${room.id}`;
   }else if(b.action==='ack'){
     const activePolicy=room.state?.revealPolicy||{mode:room.reveal_mode,seconds:room.reveal_seconds};
     if(!room.state?.last||activePolicy.mode!=='manual')throw fail('No manual reveal is active.',409);
     if(b.expectedRound!==room.state.round)throw fail('The round already changed.',409);
     const display=revealState({...activePolicy,required:playerCountOf(room),until:room.reveal_until,acks:room.reveal_acks});
     if(display.active&&!display.acks.includes(me.index)){
       await tx`update deckverse.rooms set reveal_acks=${tx.json([...display.acks,me.index])},updated_at=now() where id=${room.id}`;
     }
   }else if(b.action==='start'){
     if(me.index!==presence.hostSeat)throw fail('Only the current host can start.',403);
     if(room.status!=='lobby')throw fail('Match already started.');
     const ps=await tx`select seat,ready from deckverse.players where room_id=${room.id} and active=true order by seat`;
     if(ps.length!==playerCountOf(room)||!ps.every(p=>p.ready))throw fail('All players must join and be ready.');
     const state=newMatch(playerCountOf(room),themeIdForRoom(room));
     state.matchNumber=1;
     await tx`update deckverse.players set ready=false where room_id=${room.id} and active=true`;
     await tx`update deckverse.rooms set state=${tx.json(state)},status='playing',expires_at=clock_timestamp()+${retentionSeconds('playing')}*interval '1 second',updated_at=clock_timestamp() where id=${room.id}`;
   }else if(b.action==='rematch'){
     const ps=await tx`select seat,ready from deckverse.players where room_id=${room.id} and active=true order by seat`;
     if(!Number.isSafeInteger(b.expectedMatchNumber))throw fail('Rematch request needs the current match number. Refresh and retry.',409);
     const decision=decideRematch({status:room.status,state:room.state,players:ps,seat:me.index,expectedMatchNumber:b.expectedMatchNumber});
     if(decision.error)throw fail(decision.error,409);
     if(!ps.find(p=>p.seat===me.index)?.ready){
       await tx`update deckverse.players set ready=true where room_id=${room.id} and seat=${me.index} and active=true`;
     }
     if(decision.restart){
       const state=newMatch(playerCountOf(room),themeIdForRoom(room));
       state.matchNumber=(room.state.matchNumber||1)+1;
       await tx`update deckverse.players set ready=false where room_id=${room.id} and active=true`;
       await tx`update deckverse.rooms set state=${tx.json(state)},status='playing',reveal_until=null,reveal_acks='[]'::jsonb,expires_at=clock_timestamp()+${retentionSeconds('playing')}*interval '1 second',updated_at=clock_timestamp() where id=${room.id}`;
     }
   }else if(b.action==='select'){
     if(room.status!=='playing'||!room.state)throw fail('Match is not active.');
     if(!getServerTheme(themeIdForRoom(room)).categories.some(stat=>stat.key===b.stat))throw fail('Invalid category.',400);
     if(presence.paused)throw fail('Match paused while a player reconnects. Your cards are safe.',409);
     if(!Number.isInteger(b.expectedRound)||b.expectedRound!==room.state.round)throw fail('Round has already advanced. Please wait for synchronization.',409);
     const activePolicy=room.state.revealPolicy||{mode:room.reveal_mode,seconds:room.reveal_seconds};
     const display=revealState({...activePolicy,required:playerCountOf(room),until:room.reveal_until,acks:room.reveal_acks});
     if(!mayAdvance(display))throw fail('The previous card reveal is still in progress.',409);
     if(room.state.chooser!==me.index)throw fail('Only the current category chooser may play.',403);
     const state=takeServerThemeTurn(room.state,me.index,b.stat,{roomThemeId:themeIdForRoom(room)});
     state.revealPolicy={mode:room.reveal_mode,seconds:room.reveal_seconds};
     const until=revealDeadline(state.revealPolicy);
     await tx`update deckverse.rooms set state=${tx.json(state)},status=${state.status},reveal_until=${until},reveal_acks='[]'::jsonb,expires_at=clock_timestamp()+${retentionSeconds(state.status)}*interval '1 second',updated_at=clock_timestamp() where id=${room.id}`;
   }else throw fail('Unknown action.');
 });
 return snapshot(db,c,b.token);
}
export default async function handler(req,res){
 res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
 if(req.method==='GET'){if(new URL(req.url,'https://deckverse.invalid').searchParams.has('health')){try{await connected();return res.status(200).json({status:'ready',app:'deckverse'})}catch{return res.status(503).json({status:'setup_required',app:'deckverse'})}}return res.status(405).json({error:'POST required.'})}
 if(req.method!=='POST')return res.status(405).json({error:'POST required.'});
 try{
  const db=await connected();let b=req.body;
  if(!b||typeof b!=='object'||Array.isArray(b)||JSON.stringify(b).length>6000||!allowedAction.has(b.action))throw fail('Invalid request.');
  await enforceRateLimit(db,req,{route:'game',action:b.action,code:b.code,token:b.token});
  let result;
  try { result=b.action==='create'?await create(db,b):b.action==='join'?await join(db,b):await action(db,b); }
  catch(error){
    if(b.action==='join'&&error.status===404)await recordRateLimitFailure(db,req,{kind:'invalid-code'});
    else if(error.status===401)await recordRateLimitFailure(db,req,{kind:'auth-failure'});
    throw error;
  }
  return res.status(200).json(result);
 }catch(e){
   if(writeRateLimitResponse(res,e))return;
   // Fail closed when durable limiter storage is unavailable: never continue unprotected.
   if(!e.status&&e.code!=='23505'){console.error('deckverse server unavailable',e.code||e.name||'internal');return res.status(503).json({error:'Game service temporarily unavailable. Please retry.'});}
   return res.status(e.status||(e.code==='23505'?409:503)).json({error:e.status?e.message:'That room is already occupied.'});
 }
}
