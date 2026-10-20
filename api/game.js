import postgres from 'postgres';
import {createHash,randomBytes,randomInt} from 'node:crypto';
import {newGame,takeTurn,viewFor} from '../src/engine.js';
import {startMultiGame,multiTurn,multiViewFor} from '../src/multi-engine.js';
import {DECKS} from '../src/catalog.js';
import {revealState,revealDeadline,mayAdvance,validateRevealSettings} from '../src/reveal.js';
import {decideRematch} from '../src/rematch.js';
const dbUrl=process.env.DECKVERSE_DATABASE_URL;
const sql=dbUrl?postgres(dbUrl,{ssl:'require',max:3,prepare:false,idle_timeout:15,connect_timeout:9}):null;
const hash=val=>createHash('sha256').update(val).digest('hex');
const secret=()=>randomBytes(32).toString('hex');
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code=()=>Array.from({length:6},()=>alphabet[randomInt(alphabet.length)]).join('');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const playerCountOf=r=>r.player_count||2;
const newMatch=n=>n===2?newGame({ids:DECKS[2]}):startMultiGame({playerCount:n});
const allowedAction=new Set(['create','join','get','ready','start','rematch','select','settings','ack','leave']);
let verified=false;
async function connected(){if(!sql)throw fail('Game rooms are awaiting an isolated database connection. Solo practice is available.',503);if(!verified){const [r]=await sql`select current_user as role`;if(r.role!=='deckverse_app')throw fail('Game backend configuration failed its dedicated-role security check.',503);verified=true;}return sql}
export const safeName=n=>{if(typeof n!=='string'||n.trim().length<2||n.trim().length>24||/[<>\p{Cc}\p{Cf}]/u.test(n))throw fail('Name must be 2–24 visible characters without HTML symbols.');return n.trim()};
export const safeMode=mode=>{if(mode!=='same'&&mode!=='remote')throw fail('Invalid room mode.');return mode};
const safeCode=c=>{if(typeof c!=='string'||!/^[A-Z0-9]{6}$/.test(c))throw fail('Invalid six-character room code.');return c};
const safeToken=t=>{if(typeof t!=='string'||!/^[0-9a-f]{64}$/.test(t))throw fail('Invalid session token.',401);return hash(t)};
async function auth(tx,room,token){const [p]=await tx`select seat,name,ready from deckverse.players where room_id=${room.id} and token_hash=${safeToken(token)} and active=true limit 1`;if(!p)throw fail('Session expired. Rejoin with the room code.',401);return {index:p.seat,name:p.name,ready:p.ready}}
async function readRoom(tx,code,lock=false){const rows=lock?await tx`select * from deckverse.rooms where code=${code} and expires_at>now() for update`:await tx`select * from deckverse.rooms where code=${code} and expires_at>now()`;if(!rows.length)throw fail('Room not found or expired.',404);return rows[0]}
async function snapshot(db,code,token){
 const room=await readRoom(db,code);
 const rows=await db`select seat,name,ready,token_hash from deckverse.players where room_id=${room.id} and active=true order by seat`;
 const found=rows.find(p=>p.token_hash===safeToken(token));
 if(!found)throw fail('Session expired. Rejoin with the room code.',401);
 const me={index:found.seat,name:found.name,ready:found.ready};
 const count=playerCountOf(room);
 const activePolicy=room.state?.revealPolicy||{mode:room.reveal_mode,seconds:room.reveal_seconds};
 const reveal=room.state?.last?revealState({...activePolicy,required:count,until:room.reveal_until,acks:room.reveal_acks}):null;
 const view=room.state?(count===2?viewFor(room.state,me.index):multiViewFor(room.state,me.index)):null;
 const game=view?{...view,reveal,endReason:room.state.endReason||null,matchNumber:room.state.matchNumber||1,rematchVotes:room.status==='finished'?rows.filter(p=>p.ready).map(p=>p.seat):[]}:null;
 return {room:{code:room.code,mode:room.mode,status:room.status,playerCount:count,revealSettings:{mode:room.reveal_mode,seconds:room.reveal_seconds}},players:rows.map(p=>({index:p.seat,name:p.name,ready:p.ready})),me,game};
}
async function create(db,b){
 const name=safeName(b.name),mode=safeMode(b.mode),count=b.playerCount??2,raw=secret(),digest=hash(raw);
 if(![2,3,4].includes(count))throw fail('Room size must be 2, 3 or 4.');
 const [active]=await db`select count(*)::integer as count from deckverse.rooms where expires_at>now() and status in ('lobby','playing')`;if(active.count>300)throw fail('Active-room capacity reached. Try again later.',429);
 for(let tries=0;tries<6;tries++){
 const c=code();try{
 await db.begin(async tx=>{const [r]=await tx`insert into deckverse.rooms(code,mode,status,player_count) values(${c},${mode},'lobby',${count}) returning id`;await tx`insert into deckverse.players(room_id,seat,name,token_hash,ready) values(${r.id},0,${name},${digest},true)`;});
 return {...await snapshot(db,c,raw),token:raw};
 }catch(e){if(e.code!=='23505'||tries===5)throw e}
 }throw fail('Could not create room. Please try again.',503);
}
async function join(db,b){const c=safeCode(b.code),name=safeName(b.name),raw=secret(),digest=hash(raw);
 await db.begin(async tx=>{const r=await readRoom(tx,c,true);if(r.status!=='lobby')throw fail('This match has already started.');const existing=await tx`select seat,name from deckverse.players where room_id=${r.id} and active=true`;if(existing.length>=playerCountOf(r))throw fail('This room is full.');if(existing.some(p=>p.name.toLowerCase()===name.toLowerCase()))throw fail('Please choose a different nickname.');const seat=Array.from({length:playerCountOf(r)},(_,i)=>i).find(i=>!existing.some(p=>p.seat===i));await tx`insert into deckverse.players(room_id,seat,name,token_hash,ready,active) values(${r.id},${seat},${name},${digest},false,true) on conflict (room_id,seat) do update set name=excluded.name,token_hash=excluded.token_hash,ready=false,active=true,last_seen_at=now()`;});
 return {...await snapshot(db,c,raw),token:raw};
}
async function action(db,b){
 const c=safeCode(b.code);safeToken(b.token);
 if(b.action==='get')return snapshot(db,c,b.token);
 if(b.action==='leave'){await db.begin(async tx=>{const room=await readRoom(tx,c,true);const me=await auth(tx,room,b.token);await tx`update deckverse.players set active=false,ready=false where room_id=${room.id} and seat=${me.index}`;if(room.status==='playing'&&room.state){const state=room.state;state.status=playerCountOf(room)===2?'finished':'aborted';state.winner=playerCountOf(room)===2?1-me.index:null;state.endReason='forfeit';await tx`update deckverse.rooms set state=${tx.json(state)},status='finished',updated_at=now() where id=${room.id}`;}else if(me.index===0){await tx`update deckverse.rooms set expires_at=now(),status='finished' where id=${room.id}`;}});return {ok:true};}
 await db.begin(async tx=>{
   const room=await readRoom(tx,c,true);const me=await auth(tx,room,b.token);
   if(b.action==='ready'){
     if(room.status!=='lobby')throw fail('Match already started.');
     await tx`update deckverse.players set ready=${b.ready===true} where room_id=${room.id} and seat=${me.index}`;
   }else if(b.action==='settings'){
     if(room.status!=='lobby'&&room.status!=='playing')throw fail('Reveal settings cannot change after the match ends.',409);
     if(me.index!==0)throw fail('Only the host can change reveal settings.',403);
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
     if(me.index!==0)throw fail('Only the host can start.');
     if(room.status!=='lobby')throw fail('Match already started.');
     const ps=await tx`select seat,ready from deckverse.players where room_id=${room.id} and active=true order by seat`;
     if(ps.length!==playerCountOf(room)||!ps.every(p=>p.ready))throw fail('All players must join and be ready.');
     const state=newMatch(playerCountOf(room));
     state.matchNumber=1;
     await tx`update deckverse.players set ready=false where room_id=${room.id} and active=true`;
     await tx`update deckverse.rooms set state=${tx.json(state)},status='playing',updated_at=now() where id=${room.id}`;
   }else if(b.action==='rematch'){
     const ps=await tx`select seat,ready from deckverse.players where room_id=${room.id} and active=true order by seat`;
     const decision=decideRematch({status:room.status,state:room.state,players:ps,seat:me.index});
     if(decision.error)throw fail(decision.error,409);
     if(!ps.find(p=>p.seat===me.index)?.ready){
       await tx`update deckverse.players set ready=true where room_id=${room.id} and seat=${me.index} and active=true`;
     }
     if(decision.restart){
       const state=newMatch(playerCountOf(room));
       state.matchNumber=(room.state.matchNumber||1)+1;
       await tx`update deckverse.players set ready=false where room_id=${room.id} and active=true`;
       await tx`update deckverse.rooms set state=${tx.json(state)},status='playing',reveal_until=null,reveal_acks='[]'::jsonb,updated_at=now() where id=${room.id}`;
     }
   }else if(b.action==='select'){
     if(room.status!=='playing'||!room.state)throw fail('Match is not active.');
     if(!Number.isInteger(b.expectedRound)||b.expectedRound!==room.state.round)throw fail('Round has already advanced. Please wait for synchronization.',409);
     const activePolicy=room.state.revealPolicy||{mode:room.reveal_mode,seconds:room.reveal_seconds};
     const display=revealState({...activePolicy,required:playerCountOf(room),until:room.reveal_until,acks:room.reveal_acks});
     if(!mayAdvance(display))throw fail('The previous card reveal is still in progress.',409);
     const state=playerCountOf(room)===2?takeTurn(room.state,me.index,b.stat):multiTurn(room.state,me.index,b.stat);
     state.revealPolicy={mode:room.reveal_mode,seconds:room.reveal_seconds};
     const until=revealDeadline(state.revealPolicy);
     await tx`update deckverse.rooms set state=${tx.json(state)},status=${state.status},reveal_until=${until},reveal_acks='[]'::jsonb,updated_at=now() where id=${room.id}`;
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
  const result=b.action==='create'?await create(db,b):b.action==='join'?await join(db,b):await action(db,b);
  return res.status(200).json(result);
 }catch(e){const status=e.status||((e.code==='23505')?409:500);const msg=e.status?e.message:e.code==='23505'?'That room is already occupied.':'The game server could not finish the request.';if(status===500)console.error('deckverse error',e.code||e.message);return res.status(status).json({error:msg});}
}
