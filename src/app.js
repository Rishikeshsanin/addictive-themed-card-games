import {STAT_FIELDS,DECKS,deckFor,card,art} from './catalog.js';
import {newGame,takeTurn,viewFor,secureIndex} from './engine.js';
import {initCallControls,disconnectCall,getCallAvailability} from './livekit-call.js';
const $=id=>document.getElementById(id),sleep=ms=>new Promise(r=>setTimeout(r,ms));
let screen='landing',mode='same',roomSize=2,session=null,game=null,practice=null,poll=null,latestRound=-1,renderedRound=-1,botTimer=null,call=null,callEnabled=false;
let pollBusy=false,actionBusy=false,readyBusy=false,pollTimer=null,revealTimer=null,renderKey='',lobbySnapshot=null,callHealthChecked=false;
let pollEpoch=0,pollDelay=0,networkState='connected';
function networkStatus(state){if(networkState===state)return;networkState=state;const box=$('network-status');if(!box)return;box.classList.toggle('hidden',state==='connected');box.textContent=state==='offline'?'OFFLINE · Your room is preserved. Reconnect to continue.':'RECONNECTING · Your cards and room remain safe.';renderKey='';if(screen==='battle'&&game)renderBattle();}
const symbols={rank:'♛',height:'↕',weight:'◆',attack:'⚔',defense:'⬡',speed:'⚡',energy:'✧',hp:'♥'};
const elements=['landing','setup','lobby','battle'];
function show(id){screen=id;for(const el of elements)$(el).classList.toggle('hidden',el!==id);if(id!=='landing')window.scrollTo(0,0);if(id==='landing')location.hash='';if(id==='setup')checkRoomHealth();}
let toastTimer;
function toast(text){$('toast').textContent=text;$('toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),3800)}
function displayName(){return ($('player-name').value.trim()||localStorage.getItem('deckverse_name')||'Player').slice(0,24)}
function saveName(){localStorage.setItem('deckverse_name',displayName())}
const escapeHtml=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
function pokemonCard(c,chosen=''){if(!c)return '<div class="card-back"><span>✦</span></div>';const vals=STAT_FIELDS.map(s=>'<div class="card-bar '+(s.key===chosen?'best':'')+'"><span>'+symbols[s.key]+' '+(s.key==='energy'?'ENERGY':s.name)+'</span><b>'+Number(c[s.key]).toLocaleString(undefined,{maximumFractionDigits:2})+'</b></div>').join('');return '<div class="card-top"><span>NO. '+String(c.id).padStart(3,'0')+'</span><span>THE ORIGINALS</span></div><div class="card-art"><img src="'+art(c.id)+'" alt="" loading="eager" onerror="this.style.display=\'none\'"/></div><div class="card-name">'+escapeHtml(c.name.toUpperCase())+'</div><div class="card-bars">'+vals+'</div>'}
async function checkRoomHealth(){
 const message=$('room-availability'),create=$('create-room'),join=$('join-room');
 if(!message||!create||!join)return;
 message.textContent='Checking private game servers…';create.disabled=true;join.disabled=true;
 try{
  const response=await fetch('/api/game?health=1',{cache:'no-store'});
  const data=await response.json();
  if(response.ok&&data.status==='ready'){
   message.textContent='● ONLINE ROOMS ARE READY';message.classList.remove('offline');
   create.disabled=false;join.disabled=false;return;
  }
 }catch{}
 message.textContent='● ONLINE ROOMS ARE BEING CONNECTED — SOLO PRACTICE IS PLAYABLE';
 message.classList.add('offline');
}
function stopPolling(){pollEpoch++;clearInterval(poll);poll=null;clearTimeout(pollTimer);pollTimer=null;pollBusy=false;pollDelay=0;}
function resetReveal(){clearTimeout(revealTimer);revealTimer=null;renderKey='';$('result').classList.add('hidden');}
function setupScreen(){stopPolling();clearTimeout(botTimer);resetReveal();disconnectCall();callHealthChecked=false;practice=null;session=null;lobbySnapshot=null;latestRound=-1;renderedRound=-1;try{sessionStorage.removeItem('deckverse_session')}catch{}show('setup')}
function init(){
 window.addEventListener('online',()=>{if(session){networkStatus('reconnecting');beginPolling()}});
 window.addEventListener('offline',()=>{if(session)networkStatus('offline')});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session)beginPolling()});
 $('player-name').value=localStorage.getItem('deckverse_name')||'';
 for(const b of ['top-play','hero-play','pokemon-tile'])$(b).addEventListener('click',setupScreen);
 $('hero-how').addEventListener('click',()=>document.querySelector('#how').scrollIntoView({behavior:'smooth'}));
 $('setup-back').addEventListener('click',()=>show('landing'));
 document.querySelectorAll('.mode-card').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;document.querySelectorAll('.mode-card').forEach(n=>n.classList.toggle('selected',n===b))}));
 document.querySelectorAll('[data-player-count]').forEach(button=>button.addEventListener('click',()=>{
  roomSize=Number(button.dataset.playerCount);
  document.querySelectorAll('[data-player-count]').forEach(option=>{const selected=option===button;option.classList.toggle('selected',selected);option.setAttribute('aria-pressed',String(selected));});
 }));
 $('create-room').onclick=()=>enterRoom('create');$('join-room').onclick=()=>enterRoom('join');$('practice-btn').onclick=startPractice;
 $('copy-code').onclick=async()=>{const code=session?.code;if(!code)return;const url=location.origin+'/?room='+code;try{await navigator.clipboard.writeText(url);toast('INVITE LINK COPIED ✦')}catch{toast('ROOM CODE: '+code)}};
 $('toggle-ready').onclick=()=>toggleReady();
 $('reveal-setting').onchange=async e=>{if(!session||session.me.index!==0||!lobbySnapshot)return;const [chosen,seconds]=e.target.value.split('-');const ok=await roomAction('settings',{mode:chosen,seconds:Number(seconds)});if(!ok)e.target.value=lobbySnapshot.room.revealSettings.mode+'-'+lobbySnapshot.room.revealSettings.seconds;};
 $('start-match').onclick=()=>roomAction('start');
 $('lobby-back').onclick=exitGame;$('battle-exit').onclick=exitGame;
 initCallControls(()=>session,toast);
 $('battle-settings-open').onclick=()=>{$('battle-settings-panel').classList.toggle('hidden')};
 $('battle-settings-close').onclick=()=>{$('battle-settings-panel').classList.add('hidden')};
 $('battle-reveal-setting').onchange=async event=>{
  if(!session||session.me.index!==0||game?.status!=='playing')return;
  const previous=lobbySnapshot?.room?.revealSettings;
  const [setting,seconds]=event.target.value.split('-');
  event.target.disabled=true;
  $('battle-settings-status').textContent='Saving for the next round…';
  const ok=await roomAction('settings',{mode:setting,seconds:Number(seconds)});
  if(!ok){event.target.value=previous.mode+'-'+previous.seconds;$('battle-settings-status').textContent='Save failed. Please try again.'}
  else{$('battle-settings-status').textContent='Saved! Applies from next round.';toast('REVEAL TIMING UPDATED')}
  event.target.disabled=false;
 };
 $('join-code').addEventListener('input',e=>{e.target.value=e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)});
 $('player-name').addEventListener('keydown',e=>{if(e.key==='Enter')$('create-room').click()});
 if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
 const room=new URLSearchParams(location.search).get('room');if(room&&/^[a-z0-9]{6}$/i.test(room)){$('join-code').value=room.toUpperCase();mode='remote';document.querySelector('[data-mode="remote"]').click();show('setup');toast('YOU HAVE AN INVITE — ENTER YOUR NAME TO JOIN')}
 try{const saved=JSON.parse(sessionStorage.getItem('deckverse_session')||'null');if(saved?.code&&saved?.token){session=saved;beginPolling();}}catch{}
}
function startPractice(){saveName();stopPolling();resetReveal();disconnectCall();callHealthChecked=false;session=null;practice=newGame({ids:DECKS[2]});game=viewFor(practice,0);game.me=0;game.practice=true;latestRound=-1;renderedRound=-1;show('battle');$('you-name').textContent=displayName().toUpperCase();$('enemy-name').textContent='RIVAL BOT';$('call-dock').classList.add('hidden');renderBattle();scheduleBot();toast('PRACTICE MODE · 50-CARD CLASSIC')}
const API='/api/game';
async function api(action,body={}){let response;try{response=await fetch(API,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...body})})}catch{throw Error('Cannot connect to the game server. Check your internet connection.')};const data=await response.json().catch(()=>({error:'Unexpected server response'}));if(!response.ok||data.error)throw Error(data.error||'Room request failed');return data}
async function enterRoom(action){const name=displayName();if(name.trim().length<2){toast('PLEASE ENTER AT LEAST TWO LETTERS');return}saveName();let code=$('join-code').value.trim().toUpperCase();if(action==='join'&&!/^[A-Z0-9]{6}$/.test(code)){toast('ENTER A VALID SIX-CHARACTER ROOM CODE');return}const b=$(action==='create'?'create-room':'join-room');b.disabled=true;b.textContent='CONNECTING…';try{const data=await api(action,{name,mode,code,playerCount:roomSize});session={code:data.room.code,token:data.token,mode:data.room.mode,me:data.me};sessionStorage.setItem('deckverse_session',JSON.stringify(session));updateRoom(data);beginPolling()}catch(e){toast(e.message)}finally{b.disabled=false;b.textContent=action==='create'?'CREATE PRIVATE ROOM ↗':'JOIN →'}}
async function roomAction(action,params={}){
 if(!session||actionBusy)return false;
 actionBusy=true;
 try{const data=await api(action,{code:session.code,token:session.token,...params});updateRoom(data);return true}
 catch(e){toast(e.message);return false}
 finally{actionBusy=false;if(screen==='battle'&&game){renderKey='';renderBattle()}}
}
async function toggleReady(){
 if(!session||readyBusy||!lobbySnapshot)return;
 readyBusy=true;const desired=!session.me.ready;const previous=lobbySnapshot;
 session.me={...session.me,ready:desired};
 const players=previous.players.map(p=>p.index===session.me.index?{...p,ready:desired}:p);
 renderLobby({...previous,me:session.me,players});
 $('toggle-ready').disabled=true;
 const ok=await roomAction('ready',{ready:desired});
 if(!ok&&session){session.me={...session.me,ready:!desired};renderLobby(previous)}
 readyBusy=false;$('toggle-ready').disabled=false;
}
function updateRoom(data){
 if(!session||data.error)return;
 session.me=data.me;session.mode=data.room.mode;session.players=data.players;
 game=data.game||null;
 lobbySnapshot=data;
 sessionStorage.setItem('deckverse_session',JSON.stringify({code:session.code,token:session.token,mode:session.mode,me:session.me}));
 if(data.room.status==='lobby'){if(screen!=='lobby')show('lobby');renderLobby(data);return}
 if(data.room.status==='playing'||data.room.status==='finished'){
  if(screen!=='battle'){show('battle');resetReveal();callHealthChecked=false;}
  renderBattle();
 }
}
function renderLobby(data){
 if(!data?.room||!session)return;
 $('room-code').textContent=data.room.code;
 const people=data.players||[],count=data.room.playerCount||2;
 $('lobby-players').innerHTML=Array.from({length:count},(_,i)=>i).map(i=>{const p=people.find(x=>x.index===i);return '<div class="player-slot"><span>'+(p?(i===0?'⚡':'🔥'):'◇')+'</span><strong>'+escapeHtml(p?.name||'WAITING FOR RIVAL')+'</strong><small>'+(p?(p.ready?'● READY':'○ NOT READY'):'INVITE SOMEONE TO JOIN')+'</small></div>'}).join('');
 $('lobby-message').textContent=people.length<count?'Share the invite link: '+people.length+'/'+count+' players joined.':people.every(x=>x.ready)?'Everyone is ready. Let the battle begin!':'Waiting for all players to get ready…';
 $('toggle-ready').textContent=session.me.ready?'✓ READY — TAP TO UNREADY':"I'M READY";
 $('toggle-ready').disabled=readyBusy;
 $('start-match').disabled=!(session.me.index===0&&people.length===count&&people.every(x=>x.ready));
 $('start-match').classList.toggle('hidden',session.me.index!==0);
 const host=session.me.index===0;
 const control=$('reveal-setting'),settings=data.room.revealSettings||{mode:'auto',seconds:2};
 control.value=settings.mode+'-'+settings.seconds;
 control.disabled=!host;
 $('reveal-owner').textContent=host?'YOU ARE THE HOST':'ONLY THE HOST CAN EDIT';
 $('reveal-help').textContent=settings.mode==='manual'?`All ${count} players tap Continue after a reveal (90-second fallback).`:`Played cards are revealed to all ${count} players for ${settings.seconds} seconds.`;
}
function beginPolling(){
 stopPolling();const epoch=pollEpoch;let fetching=false;
 async function sync(){
  if(epoch!==pollEpoch||!session)return;
  if(fetching||actionBusy||document.visibilityState==='hidden'){
    pollTimer=setTimeout(sync,450);return;
  }
  if(!navigator.onLine){
    networkStatus('offline');
    pollTimer=setTimeout(sync,1200);return;
  }
  fetching=true;const current=session;
  try{
   const data=await api('get',{code:current.code,token:current.token});
   if(epoch!==pollEpoch||session!==current)return;
   pollDelay=0;networkStatus('connected');
   if(!actionBusy)updateRoom(data);
  }catch(error){
   if(epoch!==pollEpoch||session!==current)return;
   if(/expired|invalid token|session expired/i.test(error.message)){
    networkStatus('offline');session=null;
    toast('ROOM EXPIRED — REJOIN WITH A CODE');show('setup');stopPolling();return;
   }
   pollDelay=Math.min(8000,pollDelay?Math.ceil(pollDelay*1.6):1000);
   networkStatus(navigator.onLine?'reconnecting':'offline');
  }finally{fetching=false;}
  if(epoch===pollEpoch&&session)pollTimer=setTimeout(sync,pollDelay|| (screen==='lobby'?550:1000));
 }
 sync();
}
function playerName(i){if(practice)return i===0?displayName():'RIVAL BOT';return session?.players?.find(x=>x.index===i)?.name||('PLAYER '+(i+1))}
function ensureCallAvailability(){
 if(session?.mode!=='remote'||callHealthChecked)return;
 callHealthChecked=true;
 getCallAvailability().then(ok=>{
  if(!session||session.mode!=='remote')return;
  if(!ok){$('call-status').textContent='Calling requires DeckVerse LiveKit setup';$('call-note').textContent='Voice/video is not connected yet; the card game remains playable.';}
 }).catch(()=>{});
}
function revealing(){
 const r=game?.reveal;
 if(!game?.last||!r?.until||game?.endReason==='forfeit')return false;
 const deadline=Date.parse(r.until);
 if(!Number.isFinite(deadline)||Date.now()>=deadline)return false;
 return r.mode!=='manual'||(r.acks?.length||0)<(r.required||game.playerCount||2);
}
function queueRevealRefresh(){
 clearTimeout(revealTimer);revealTimer=null;
 if(revealing()){
  const ms=Math.max(15,Date.parse(game.reveal.until)-Date.now()+35);
  revealTimer=setTimeout(()=>{renderKey='';renderBattle()},ms);
 }
}
function showMultiRoundResult(last,me){
 if(!last?.cards?.length)return;
 const winner=last.winner;
 const tie=last.kind==='tie';
 const ownWin=winner===me;
 const title=tie?'THE CARDS GO TO THE JACKPOT':ownWin?'YOU WON THE ROUND!':winner===null?'ROUND RESOLVED':escapeHtml(playerName(winner))+' WINS THE ROUND!';
 const detail=tie?'All played cards are held aside.':last.kind==='sudden-death'?'Rank settled the exhausted-deck tie.':last.kind==='last-standing'?'Only one player had cards left after the tie.':'Cards move to the winning deck.';
 const rows=last.cards.map((played,i)=>{
  const character=card(played.id);
  return '<span>'+escapeHtml(playerName(played.seat))+' · '+escapeHtml(character?.name||'CARD')+' <b>'+Number(last.values[i]).toLocaleString(undefined,{maximumFractionDigits:2})+'</b></span>';
 }).join('');
 const manual=game.reveal?.mode==='manual',acked=game.reveal?.acks?.includes(me);
 $('result').className='result-pop compact '+(tie?'tie':ownWin?'win':'loss');
 $('result').innerHTML='<div class="reveal-summary"><h3>'+title+'</h3><p>'+escapeHtml(last.stat.toUpperCase())+' · '+detail+'</p><div class="multi-result-values">'+rows+'</div></div><div class="reveal-action">'+(manual?'<button id="round-continue" class="btn btn-primary" '+(acked?'disabled':'')+'>'+(acked?'✓ READY':'CONTINUE →')+'</button>':'<span class="reveal-countdown">NEXT ROUND IN '+Math.max(0,Math.ceil((Date.parse(game.reveal.until)-Date.now())/1000))+'s</span>')+'</div>';
 $('result').classList.remove('hidden');
 if(manual&&!acked)$('round-continue').onclick=async()=>{
  const button=$('round-continue');button.disabled=true;button.textContent='CONFIRMING…';
  if(!(await roomAction('ack',{expectedRound:game.round}))){button.disabled=false;button.textContent='CONTINUE →'}
 };
}
function renderMultiBattle(){
 const count=game.playerCount,me=game.me,ended=game.status==='finished'||game.status==='aborted',active=revealing(),last=game.last;
 const signature=['multi',game.matchNumber||1,game.round,game.status,game.chooser,game.counts.join(','),game.pot,active,(game.rematchVotes||[]).join(','),game.last?.kind||'',game.reveal?.mode||'',(game.reveal?.acks||[]).join(','),lobbySnapshot?.room?.revealSettings?.mode||'',lobbySnapshot?.room?.revealSettings?.seconds||'',networkState].join('|');
 if(renderKey===signature)return;
 renderKey=signature;
 document.querySelector('#battle .battle-meta').classList.add('hidden');
 document.querySelector('#battle .tabletop').classList.add('hidden');
 $('multi-arena').classList.remove('hidden');
 $('round-number').textContent=String(game.round+(active||ended?0:1)).padStart(2,'0');
 $('multi-arena').innerHTML=Array.from({length:count},(_,seat)=>{
  const played=active?last?.cards?.find(x=>x.seat===seat):null;
  const character=played?card(played.id):seat===me?game.topCard:null;
  const outOfCards=game.counts[seat]===0&&!played;
  return '<div class="multi-player '+(seat===me?'mine':'')+'"><div class="multi-player-heading"><span>'+escapeHtml(playerName(seat))+(seat===me?' (YOU)':'')+'</span><small>'+game.counts[seat]+' CARDS'+(outOfCards?' · OUT':'')+'</small></div><div class="battle-card multi-card">'+pokemonCard(character,active&&played?last.stat:'')+'</div></div>';
 }).join('');
 const canPlay=!active&&!ended&&game.chooser===me&&Boolean(game.topCard)&&!actionBusy&&networkState==='connected';
 $('battle-status').textContent=active?'ROUND CARDS REVEALED':ended?'MATCH FINISHED':canPlay?'YOUR TURN TO CHOOSE':'WAITING FOR THE CATEGORY';
 $('turn-power').textContent=active?'✦ REVIEW THE ROUND':ended?'✦ FINAL RESULT':game.chooser===me?'✦ YOU HAVE THE POWER':'⌛ '+playerName(game.chooser).toUpperCase()+' IS CHOOSING';
 $('controls-title').textContent=ended?'THE SHOWDOWN IS OVER.':active?'EVERY PLAYER SEES THE SAME CARDS.':game.chooser===me?'PICK YOUR WINNING STAT.':'WAIT FOR THE CATEGORY CALL.';
 $('control-subtitle').textContent=active?'The next turn unlocks after the shared reveal.':ended?'See the result above.':'Rank is the only category where lower wins.';
 $('stat-buttons').innerHTML=STAT_FIELDS.map(s=>'<button class="stat-button" data-stat="'+s.key+'" '+(!canPlay?'disabled':'')+'><span>'+symbols[s.key]+' '+s.name+'</span><b>'+(game.topCard?Number(game.topCard[s.key]).toLocaleString(undefined,{maximumFractionDigits:2}):'—')+'</b></button>').join('');
 $('stat-buttons').querySelectorAll('[data-stat]').forEach(b=>b.onclick=()=>play(b.dataset.stat));
 $('pot-info').textContent=game.pot?'◇ '+game.pot+' CARDS IN THE JACKPOT':'◇ NO CARDS IN THE JACKPOT';
 $('call-dock').classList.toggle('hidden',session?.mode!=='remote');
 ensureCallAvailability();
 const host=session?.me.index===0;
 $('battle-settings-open').classList.toggle('hidden',!host||ended);
 if(!host||ended)$('battle-settings-panel').classList.add('hidden');
 const settings=lobbySnapshot?.room?.revealSettings||{mode:'auto',seconds:2};
 if(document.activeElement!==$('battle-reveal-setting'))$('battle-reveal-setting').value=settings.mode+'-'+settings.seconds;
 if(active)showMultiRoundResult(last,me);
 else if(ended)showFinalResult(me);
 else $('result').classList.add('hidden');
 queueRevealRefresh();
}
function renderBattle(){
 if(!game)return;
 if(!practice&&game.playerCount>2){renderMultiBattle();return;}
 document.querySelector('#battle .battle-meta').classList.remove('hidden');
 document.querySelector('#battle .tabletop').classList.remove('hidden');
 $('multi-arena').classList.add('hidden');
 const me=practice?0:game.me,enemy=1-me,own=game.topCard;
 const active=revealing(),ended=game.status==='finished';
 const signature=[game.matchNumber||1,game.round,active,ended,(game.rematchVotes||[]).join(','),game.endReason||'',game.chooser,game.counts.join(','),game.pot,game.reveal?.mode||'',(game.reveal?.acks||[]).join(','),game.last?.round||0,lobbySnapshot?.room?.revealSettings?.mode||'',lobbySnapshot?.room?.revealSettings?.seconds||'',networkState].join('|');
 if(renderKey===signature)return;
 renderKey=signature;
 $('round-number').textContent=String(game.round+(active?0:ended?0:1)).padStart(2,'0');
 $('you-name').textContent=playerName(me).toUpperCase();$('enemy-name').textContent=playerName(enemy).toUpperCase();
 $('you-count').textContent=game.counts[me];$('enemy-count').textContent=game.counts[enemy];
 const last=game.last,showLast=active&&last?.cards?.length===2;
 const myShown=showLast?card(last.cards[me].id):own;
 const theirShown=showLast?card(last.cards[enemy].id):null;
 $('my-card').innerHTML=pokemonCard(myShown,showLast?last.stat:'');
 $('their-card').innerHTML=theirShown?pokemonCard(theirShown,last.stat):'<div class="card-back"><span>✦</span></div>';
 const chooser=game.chooser===me;
 const canPlay=!active&&!ended&&chooser&&!actionBusy&&(practice||networkState==='connected');
 $('battle-status').textContent=active?'BOTH CARDS REVEALED':ended?(game.winner===me?'MATCH WON':'MATCH OVER'):chooser?'YOUR TURN TO CHOOSE':'WAITING ON YOUR RIVAL';
 $('turn-power').textContent=active?'✦ REVIEW YOUR LAST BATTLE':ended?'✦ MATCH COMPLETE':chooser?'✦ YOU HAVE THE POWER':'⌛ YOUR RIVAL HAS THE POWER';
 $('controls-title').textContent=active?'REVIEW THE TWO POKÉMON.':ended?'THE SHOWDOWN IS OVER.':chooser?'THE NEXT MOVE IS YOURS.':'HOLD TIGHT. NEXT CARD IS COMING.';
 $('control-subtitle').textContent=active?'The next category unlocks after both have seen the result.':ended?'See the final result above.':chooser?'Choose the category you think will win.':'Your rival is choosing a category.';
 $('stat-buttons').innerHTML=STAT_FIELDS.map(s=>'<button class="stat-button" data-stat="'+s.key+'" '+(!canPlay?'disabled':'')+'><span>'+symbols[s.key]+' '+s.name+'</span><b>'+(own?Number(own[s.key]).toLocaleString(undefined,{maximumFractionDigits:2}):'—')+'</b></button>').join('');
 $('stat-buttons').querySelectorAll('[data-stat]').forEach(b=>b.addEventListener('click',()=>play(b.dataset.stat)));
 $('pot-info').textContent=game.pot?'◇ '+game.pot+' CARDS IN THE TIE JACKPOT':'◇ NO CARDS IN THE JACKPOT';
 $('call-dock').classList.toggle('hidden',!session||session.mode!=='remote');
 const host=Boolean(session&&session.me.index===0);
 $('battle-settings-open').classList.toggle('hidden',!host||ended);
 if(!host||ended)$('battle-settings-panel').classList.add('hidden');
 const settings=lobbySnapshot?.room?.revealSettings||{mode:'auto',seconds:2};
 if(document.activeElement!==$('battle-reveal-setting'))$('battle-reveal-setting').value=settings.mode+'-'+settings.seconds;
 if(session?.mode==='remote'&&!callHealthChecked){
  callHealthChecked=true;
  getCallAvailability().then(ok=>{
   if(!session||session.mode!=='remote')return;
   if(!ok){$('call-status').textContent='Calling requires DeckVerse LiveKit setup';$('call-note').textContent='Voice/video is not connected yet; the card game remains playable.';}
  }).catch(()=>{});
 }
 if(active)showRoundResult(last,me);else if(ended)showFinalResult(me);else $('result').classList.add('hidden');
 queueRevealRefresh();
}
function showFinalResult(me){
 const forfeit=game.endReason==='forfeit'||game.endReason==='player_left'||game.status==='aborted',win=game.winner===me;
 const wantsRematch=game.rematchVotes?.includes(me);
 const votes=game.rematchVotes?.length||0;
 const expected=game.playerCount||2;
 const rematchAvailable=Boolean(session&&!forfeit&&session.players?.length===expected);
 const action=practice?'REMATCH THE BOT ↗':rematchAvailable?(wantsRematch?'✓ REMATCH REQUESTED':'⚡ PLAY AGAIN — REMATCH ↗'):'BACK TO ROOMS ↗';
 $('result').className='result-pop final '+(win?'win':'loss');
 $('result').innerHTML='<div class="result-icon">'+(win?'🏆':'⚔')+'</div><h3>'+(forfeit?(win?'YOUR RIVAL LEFT — YOU WIN':'MATCH ENDED EARLY'):(win?'THE DECK IS YOURS!':'THE RIVAL PREVAILS!'))+'</h3><p>'+game.round+' ROUNDS · '+(forfeit?'ENDED EARLY':game.total+' CARDS · ONE LEGEND')+' · MATCH '+(game.matchNumber||1)+'</p><button class="btn btn-primary" id="play-again" '+(wantsRematch?'disabled':'')+'>'+action+'</button>'+(rematchAvailable?'<small class="rematch-status">'+(wantsRematch?'Waiting for the others to agree…':votes+'/'+expected+' players requested a rematch')+'</small>':'');
 $('result').classList.remove('hidden');
 $('play-again').onclick=async()=>{
  if(practice)return startPractice();
  if(!rematchAvailable)return exitGame();
  const b=$('play-again');b.disabled=true;b.textContent='REQUESTING REMATCH…';
  const ok=await roomAction('rematch',{expectedMatchNumber:game.matchNumber||1});
  if(!ok&&game?.status==='finished'){b.disabled=false;b.textContent=action}
 };
}
function showRoundResult(last,me){
 if(!last?.cards?.length)return;
 const enemy=1-me,tie=last.kind==='tie',win=last.winner===me;
 const mine=card(last.cards[me].id),theirs=card(last.cards[enemy].id);
 const showNumber=x=>Number(x).toLocaleString(undefined,{maximumFractionDigits:2});
 const title=tie?'IT’S A TIE!':win?'YOU WON THIS ROUND!':'YOUR RIVAL WON THIS ROUND';
 const details=tie?'Both cards move to the jackpot.':win?'You collect both cards'+(last.awarded?.length>2?' and the jackpot.':'.'):'Your rival collects both cards'+(last.awarded?.length>2?' and the jackpot.':'.');
 const manual=game.reveal?.mode==='manual',acked=game.reveal?.acks?.includes(me),seconds=game.reveal?.seconds||2;
 const note=manual?(acked?'✓ YOU’RE READY · WAITING FOR RIVAL':'Inspect both cards, then tap Continue'):'NEXT ROUND IN '+Math.max(0,Math.ceil((Date.parse(game.reveal.until)-Date.now())/1000))+'s';
 $('result').className='result-pop compact '+(tie?'tie':win?'win':'loss');
 $('result').innerHTML='<span class="reveal-symbol">'+(tie?'🤝':win?'✦':'⚔')+'</span><div class="reveal-summary"><h3>'+title+'</h3><p><strong>'+escapeHtml(mine.name)+'</strong> '+showNumber(last.values[me])+' <span class="reveal-vs">VS</span> '+showNumber(last.values[enemy])+' <strong>'+escapeHtml(theirs.name)+'</strong> · '+escapeHtml(last.stat.toUpperCase())+'</p><small>'+details+'</small></div><div class="reveal-action">'+(manual?'<button id="round-continue" class="btn btn-primary" '+(acked?'disabled':'')+'>'+(acked?'✓ READY':'CONTINUE →')+'</button>':'<span class="reveal-countdown">'+note+'</span>')+'</div>';
 $('result').classList.remove('hidden');
 if(manual&&!acked){$('round-continue').onclick=async()=>{const b=$('round-continue');b.disabled=true;b.textContent='CONFIRMING…';const ok=await roomAction('ack',{expectedRound:game.round});if(!ok){b.disabled=false;b.textContent='CONTINUE →'}}}
}
async function play(key){
 if(game?.status!=='playing'||game.chooser!==(practice?0:game.me)||revealing()||actionBusy||(!practice&&networkState!=='connected'))return;
 document.querySelectorAll('[data-stat]').forEach(b=>b.disabled=true);
 if(practice){
  try{practice=takeTurn(practice,0,key);game={...viewFor(practice,0),me:0,practice:true,reveal:{mode:'auto',seconds:2,acks:[],until:new Date(Date.now()+2000).toISOString()}};renderKey='';renderBattle();scheduleBot()}catch(e){toast(e.message)}
  return;
 }
 await roomAction('select',{stat:key,expectedRound:game.round});
}
function scheduleBot(){
 clearTimeout(botTimer);
 if(!practice||practice.status!=='playing'||practice.chooser!==1)return;
 botTimer=setTimeout(()=>{
  if(!practice||practice.status!=='playing'||practice.chooser!==1||revealing()){scheduleBot();return}
  const opponent=card(practice.players[1].deck[0]);
  const fields=STAT_FIELDS.map(s=>({key:s.key,score:DECKS[2].reduce((n,id)=>{const c=card(id);return n+((s.direction==='min'?opponent[s.key]<c[s.key]:opponent[s.key]>c[s.key])?1:0)},0)})).sort((a,b)=>b.score-a.score);
  const key=fields[Math.min(secureIndex(4),fields.length-1)].key;
  try{practice=takeTurn(practice,1,key);game={...viewFor(practice,0),me:0,practice:true,reveal:{mode:'auto',seconds:2,acks:[],until:new Date(Date.now()+2000).toISOString()}};renderKey='';renderBattle();scheduleBot()}catch(e){toast(e.message)}
 },revealing()?2300:850);
}
async function exitGame(){if(session){try{await api('leave',{code:session.code,token:session.token})}catch{}}await disconnectCall();stopPolling();networkStatus('connected');clearTimeout(botTimer);resetReveal();practice=null;game=null;session=null;callHealthChecked=false;$('battle-settings-panel').classList.add('hidden');lobbySnapshot=null;try{sessionStorage.removeItem('deckverse_session')}catch{}$('result').classList.add('hidden');show('setup')}
init();