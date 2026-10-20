// Production-only isolated DeckVerse API integration. Creates and closes its own test room.
// This test MUST NOT run against any other project or database.
import assert from 'node:assert/strict';
const BASE='https://addictive-themed-card-games.vercel.app';
const now=()=>performance.now(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function call(action,payload={}){
 const resp=await fetch(BASE+'/api/game',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...payload}),signal:AbortSignal.timeout(15000)});
 const body=await resp.json().catch(()=>({error:'Invalid JSON'}));
 if(!resp.ok)throw Object.assign(Error(body.error||'HTTP '+resp.status),{status:resp.status,body});
 return body;
}
async function check(){
 const resp=await fetch(BASE+'/api/game?health=1',{signal:AbortSignal.timeout(10000)});
 const body=await resp.json();
 assert.equal(body.status,'ready','Server DB must be connected');
}
async function run(){
 const totalStart=now();let host=null,guest=null,code=null,hostToken=null,guestToken=null;
 const metrics={};
 try{
  await check();
  const st=now();host=await call('create',{name:'QA Host',mode:'same'});metrics.createMs=Math.round(now()-st);code=host.room.code;hostToken=host.token;
  assert.match(code,/^[A-Z0-9]{6}$/);
  assert.equal(host.room.revealSettings.mode,'auto');assert.equal(host.room.revealSettings.seconds,2);
  let hostAuth={code,token:host.token};
  let updated=await call('settings',{...hostAuth,mode:'manual',seconds:2});
  assert.equal(updated.room.revealSettings.mode,'manual');
  const joined=now();guest=await call('join',{name:'QA Guest',mode:'same',code});metrics.joinMs=Math.round(now()-joined);guestToken=guest.token;
  assert.equal(guest.players.length,2);
  assert.equal(guest.room.revealSettings.mode,'manual');
  const guestAuth={code,token:guest.token};
  const readyStart=now();guest=await call('ready',{...guestAuth,ready:true});metrics.readyMs=Math.round(now()-readyStart);
  assert.equal(guest.players[1].ready,true);
  const syncStart=now();host=await call('get',hostAuth);metrics.confirmReadyMs=Math.round(now()-syncStart);
  assert.equal(host.players[1].ready,true);
  host=await call('start',hostAuth);
  assert.equal(host.room.status,'playing');assert.equal(host.game.counts[0],25);assert.equal(host.game.counts[1],25);
  guest=await call('get',guestAuth);
  assert.equal(guest.game.topCard.id!==host.game.topCard.id,true);
  assert.equal(host.game.players,undefined);
  const chooser=host.game.chooser,token=chooser===0?hostAuth.token:guestAuth.token;
  const next=await call('select',{code,token,stat:'rank',expectedRound:0});
  assert.equal(next.game.round,1);
  assert.equal(next.game.reveal.mode,'manual');
  assert.equal(next.game.reveal.active,true);
  assert.equal(next.game.last.cards.length,2);
  const other=await call('get',chooser===0?guestAuth:hostAuth);
  assert.deepEqual(other.game.last.cards,next.game.last.cards,'Both players must see the same resolved cards');
  assert.equal(other.game.reveal.active,true);
  assert.equal(other.game.last.values.length,2);
  // Changing host settings in the middle of a reveal must not alter that reveal.
  const updated=await call('settings',{...hostAuth,mode:'auto',seconds:5});
  assert.equal(updated.room.revealSettings.mode,'auto');
  assert.equal(updated.room.revealSettings.seconds,5);
  assert.equal(updated.game.reveal.mode,'manual');
  const unchanged=await call('get',guestAuth);
  assert.equal(unchanged.game.reveal.mode,'manual');
  try{await call('settings',{...guestAuth,mode:'auto',seconds:2});assert.fail('Guest settings change should be forbidden')}
  catch(e){assert.equal(e.status,403);}

  const newChooser=next.game.chooser;
  const newToken=newChooser===0?hostAuth.token:guestAuth.token;
  try{await call('select',{code,token:newToken,stat:'rank',expectedRound:1});assert.fail('Early round selection should be blocked')}
  catch(e){assert.equal(e.status,409)}
  await call('ack', {...hostAuth,expectedRound:1});
  const one=await call('get',guestAuth);assert.equal(one.game.reveal.active,true);assert.deepEqual(one.game.reveal.acks,[0]);
  await call('ack', {...guestAuth,expectedRound:1});
  const both=await call('get',hostAuth);assert.equal(both.game.reveal.active,false);assert.deepEqual(both.game.reveal.acks,[0,1]);
  const second=await call('select',{code,token:newToken,stat:'rank',expectedRound:1});assert.equal(second.game.round,2);assert.equal(second.game.reveal.mode,'auto');assert.equal(second.game.reveal.seconds,5);
  metrics.totalMs=Math.round(now()-totalStart);
  console.log('PASS: remote 2-player create/join/ready, host settings, concealed decks, both-card reveal, blocked early turn, two-ack manual confirmation, second round; '+JSON.stringify(metrics));
 }finally{
  if(code){for(const token of [guestToken,hostToken]){if(!token)continue;try{await call('leave',{code,token})}catch{}}}
 }
}
await run();
