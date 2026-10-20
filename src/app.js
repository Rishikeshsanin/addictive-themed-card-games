import {STAT_FIELDS,DECKS,deckFor,card,art} from './catalog.js';
import {newGame,takeTurn,viewFor,secureIndex} from './engine.js';
import {initCallControls,disconnectCall,getCallAvailability} from './livekit-call.js';
const $=id=>document.getElementById(id),sleep=ms=>new Promise(r=>setTimeout(r,ms));
let screen='landing',mode='same',session=null,game=null,practice=null,poll=null,latestRound=-1,renderedRound=-1,botTimer=null,call=null,callEnabled=false;
let pollBusy=false,actionBusy=false,readyBusy=false,pollTimer=null,revealTimer=null,renderKey='',lobbySnapshot=null,callHealthChecked=false;
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
function stopPolling(){clearInterval(poll);poll=null;clearTimeout(pollTimer);pollTimer=null;pollBusy=false;}
function resetReveal(){clearTimeout(revealTimer);revealTimer=null;renderKey='';$('result').classList.add('hidden');}
function setupScreen(){stopPolling();clearTimeout(botTimer);resetReveal();disconnectCall();callHealthChecked=false;practice=null;session=null;lobbySnapshot=null;latestRound=-1;renderedRound=-1;try{sessionStorage.removeItem('deckverse_session')}catch{}show('setup')}
function init(){
 $('player-name').value=localStorage.getItem('deckverse_name')||'';
 for(const b of ['top-play','hero-play','pokemon-tile'])$(b).addEventListener('click',setupScreen);
 $('hero-how').addEventListener('click',()=>document.querySelector('#how').scrollIntoView({behavior:'smooth'}));
 $('setup-back').addEventListener('click',()=>show('landing'));
 document.querySelectorAll('.mode-card').forEach(b=>b.addEventListener('click',()=>{mode=b.dataset.mode;document.querySelectorAll('.mode-card').forEach(n=>n.classList.toggle('selected',n===b))}));
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
async function enterRoom(action){const name=displayName();if(name.trim().length<2){toast('PLEASE ENTER AT LEAST TWO LETTERS');return}saveName();let code=$('join-code').value.trim().toUpperCase();if(action==='join'&&!/^[A-Z0-9]{6}$/.test(code)){toast('ENTER A VALID SIX-CHARACTER ROOM CODE');return}const b=$(action==='create'?'create-room':'join-room');b.disabled=true;b.textContent='CONNECTING…';try{const data=await api(action,{name,mode,code});session={code:data.room.code,token:data.token,mode:data.room.mode,me:data.me};sessionStorage.setItem('deckverse_session',JSON.stringify(session));updateRoom(data);beginPolling()}catch(e){toast(e.message)}finally{b.disabled=false;b.textContent=action==='create'?'CREATE PRIVATE ROOM ↗':'JOIN →'}}
async function roomAction(action,params={}){
 if(!session)return false;
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
 const people=data.players||[];
 $('lobby-players').innerHTML=[0,1].map(i=>{const p=people.find(x=>x.index===i);return '<div class="player-slot"><span>'+(p?(i===0?'⚡':'🔥'):'◇')+'</span><strong>'+escapeHtml(p?.name||'WAITING FOR RIVAL')+'</strong><small>'+(p?(p.ready?'● READY':'○ NOT READY'):'INVITE SOMEONE TO JOIN')+'</small></div>'}).join('');
 $('lobby-message').textContent=people.length<2?'Share the invite link or code with your friend.':people.every(x=>x.ready)?'Both players ready. Let the battle begin!':'Waiting for both players to get ready…';
 $('toggle-ready').textContent=session.me.ready?'✓ READY — TAP TO UNREADY':"I'M READY";
 $('toggle-ready').disabled=readyBusy;
 $('start-match').disabled=!(session.me.index===0&&people.length===2&&people.every(x=>x.ready));
 $('start-match').classList.toggle('hidden',session.me.index!==0);
 const host=session.me.index===0;
 const control=$('reveal-setting'),settings=data.room.revealSettings||{mode:'auto',seconds:2};
 control.value=settings.mode+'-'+settings.seconds;
 control.disabled=!host;
 $('reveal-owner').textContent=host?'YOU ARE THE HOST':'ONLY THE HOST CAN EDIT';
 $('reveal-help').textContent=settings.mode==='manual'?'Both players tap Continue after a reveal (90-second fallback).':`Cards are revealed to BOTH players for ${settings.seconds} seconds.`;
}
function beginPolling(){
 stopPolling();let live=true;
 async function sync(){
  if(!live||!session)return;
  if(document.visibilityState==='hidden'||actionBusy||pollBusy){pollTimer=setTimeout(sync,650);return;}
  pollBusy=true;
  try{const current=session;const data=await api('get',{code:current.code,token:current.token});if(session===current&&!actionBusy)updateRoom(data)}
  catch(e){if(/expired|invalid token/i.test(e.message)){session=null;toast('ROOM EXPIRED — START A NEW ONE');show('setup');live=false;return;}}
  finally{pollBusy=false}
  if(live&&session)pollTimer=setTimeout(sync,screen==='lobby'?550:1000);
 }
 sync();
}
function playerName(i){if(practice)return i===0?displayName():'RIVAL BOT';return session?.players?.find(x=>x.index===i)?.name||('PLAYER '+(i+1))}
function revealing(){
 const r=game?.reveal;
 if(!game?.last||!r?.until||game?.endReason==='forfeit')return false;
 const deadline=Date.parse(r.until);
 if(!Number.isFinite(deadline)||Date.now()>=deadline)return false;
 return r.mode!=='manual'||(r.acks?.length||0)<2;
}
function queueRevealRefresh(){
 clearTimeout(revealTimer);revealTimer=null;
 if(revealing()){
  const ms=Math.max(15,Date.parse(game.reveal.until)-Date.now()+35);
  revealTimer=setTimeout(()=>{renderKey='';renderBattle()},ms);
 }
}
function renderBattle(){
 if(!game)return;
 const me=practice?0:game.me,enemy=1-me,own=game.topCard;
 const active=revealing(),ended=game.status==='finished';
 const signature=[game.round,active,ended,game.endReason||'',game.chooser,game.counts.join(','),game.pot,game.reveal?.mode||'',(game.reveal?.acks||[]).join(','),game.last?.round||0].join('|');
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
 const canPlay=!active&&!ended&&chooser&&!actionBusy;
 $('battle-status').textContent=active?'BOTH CARDS REVEALED':ended?(game.winner===me?'MATCH WON':'MATCH OVER'):chooser?'YOUR TURN TO CHOOSE':'WAITING ON YOUR RIVAL';
 $('turn-power').textContent=active?'✦ REVIEW YOUR LAST BATTLE':ended?'✦ MATCH COMPLETE':chooser?'✦ YOU HAVE THE POWER':'⌛ YOUR RIVAL HAS THE POWER';
 $('controls-title').textContent=active?'REVIEW THE TWO POKÉMON.':ended?'THE SHOWDOWN IS OVER.':chooser?'THE NEXT MOVE IS YOURS.':'HOLD TIGHT. NEXT CARD IS COMING.';
 $('control-subtitle').textContent=active?'The next category unlocks after both have seen the result.':ended?'See the final result above.':chooser?'Choose the category you think will win.':'Your rival is choosing a category.';
 $('stat-buttons').innerHTML=STAT_FIELDS.map(s=>'<button class="stat-button" data-stat="'+s.key+'" '+(!canPlay?'disabled':'')+'><span>'+symbols[s.key]+' '+s.name+'</span><b>'+(own?Number(own[s.key]).toLocaleString(undefined,{maximumFractionDigits:2}):'—')+'</b></button>').join('');
 $('stat-buttons').querySelectorAll('[data-stat]').forEach(b=>b.addEventListener('click',()=>play(b.dataset.stat)));
 $('pot-info').textContent=game.pot?'◇ '+game.pot+' CARDS IN THE TIE JACKPOT':'◇ NO CARDS IN THE JACKPOT';
 $('call-dock').classList.toggle('hidden',!session||session.mode!=='remote');
 if(active)showRoundResult(last,me);else if(ended)showFinalResult(me);else $('result').classList.add('hidden');
 queueRevealRefresh();
}
function showFinalResult(me){
 const forfeit=game.endReason==='forfeit',win=game.winner===me;
 $('result').className='result-pop final '+(win?'win':'loss');
 $('result').innerHTML='<div class="result-icon">'+(win?'🏆':'⚔')+'</div><h3>'+(forfeit?(win?'YOUR RIVAL LEFT — YOU WIN':'MATCH ENDED BY FORFEIT'):(win?'THE DECK IS YOURS!':'THE RIVAL PREVAILS!'))+'</h3><p>'+game.round+' ROUNDS · '+(forfeit?'ENDED EARLY':'50 CARDS · ONE LEGEND')+'</p><button class="btn btn-primary" id="play-again">'+(practice?'REMATCH THE BOT ↗':'BACK TO ROOMS ↗')+'</button>';
 $('result').classList.remove('hidden');
 $('play-again').onclick=()=>{if(practice)startPractice();else exitGame()};
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
 if(game?.status!=='playing'||game.chooser!==(practice?0:game.me)||revealing()||actionBusy)return;
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
async function exitGame(){if(session){try{await api('leave',{code:session.code,token:session.token})}catch{}}await disconnectCall();stopPolling();clearTimeout(botTimer);resetReveal();practice=null;game=null;session=null;callHealthChecked=false;$('battle-settings-panel').classList.add('hidden');lobbySnapshot=null;try{sessionStorage.removeItem('deckverse_session')}catch{}$('result').classList.add('hidden');show('setup')}
init();