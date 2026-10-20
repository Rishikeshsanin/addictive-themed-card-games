import postgres from 'postgres';
import {createHash} from 'node:crypto';
import {AccessToken} from 'livekit-server-sdk';
import {enforceRateLimit,recordRateLimitFailure,writeRateLimitResponse} from '../src/server/rate-limit.js';
const dbUrl=process.env.DECKVERSE_DATABASE_URL;
const db=dbUrl?postgres(dbUrl,{ssl:'require',max:2,prepare:false,idle_timeout:15}):null;
export default async function handler(req,res){
 res.setHeader('cache-control','no-store');
 const configured=Boolean(db&&process.env.LIVEKIT_URL&&process.env.LIVEKIT_API_KEY&&process.env.LIVEKIT_API_SECRET);
 if(req.method==='GET')return res.status(200).json({configured});
 if(req.method!=='POST')return res.status(405).json({error:'POST required'});
 if(!configured)return res.status(503).json({error:'Voice calling is not configured yet. You can still play.'});
 const {code,token}=req.body||{};
 if(typeof code!=='string'||!/^[A-Z0-9]{6}$/.test(code)||typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))return res.status(400).json({error:'Invalid room/session'});
 try{
  const [identity]=await db`select current_user as role`;if(identity.role!=='deckverse_app')return res.status(503).json({error:'Game database configuration error'});
  await enforceRateLimit(db,req,{route:'livekit',code,token});
  const rows=await db`select r.id,r.mode,r.status,p.seat from deckverse.rooms r join deckverse.players p on p.room_id=r.id where r.code=${code} and r.expires_at>now() and r.status='playing' and r.mode='remote' and p.token_hash=${createHash('sha256').update(token).digest('hex')} and p.active=true limit 1`;
  if(!rows.length){await recordRateLimitFailure(db,req,{kind:'auth-failure'});return res.status(403).json({error:'Not an active participant in this remote room'});}
  const r=rows[0], identityName='deckverse-'+r.id+'-'+r.seat;
  const lk=new AccessToken(process.env.LIVEKIT_API_KEY,process.env.LIVEKIT_API_SECRET,{identity:identityName,ttl:'2h'});
  lk.addGrant({room:'deckverse-'+r.id,roomJoin:true,canPublish:true,canSubscribe:true,canPublishData:false});
  return res.status(200).json({url:process.env.LIVEKIT_URL,token:await lk.toJwt()});
 }catch(e){if(writeRateLimitResponse(res,e))return;console.error('livekit validation',e.code||e.name||'internal');return res.status(503).json({error:'Calling is temporarily unavailable. Gameplay still works.'})}
}