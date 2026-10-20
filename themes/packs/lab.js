import {THEME_IDS,getTheme,DECK_SIZE,HAND_SIZE} from './index.js';
import {startPackMatch,takeTurn,viewFor,bestBlindCategory} from './engine.js';
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const state={themeId:'avengers',deckSize:2,group:'all',query:'',sort:'deck',game:null,showdown:false,roundTimer:null,botTimer:null,epoch:0,lastFocus:null};
const pack=()=>getTheme(state.themeId);
const currentCard=id=>pack().cards[id-1];
const selectedCards=()=>pack().decks[state.deckSize].map(currentCard);
const visual=p=>'<span class="sigil sigil-'+escape(p.id)+'" aria-hidden="true"><span class="sigil-core">'+p.emoji+'</span><span class="sigil-ring"></span></span>';
const pace=()=>({quick:{reveal:850,bot:220},standard:{reveal:1300,bot:480},relaxed:{reveal:2200,bot:820}}[$('pace').value]||{reveal:1300,bot:480});
const power=c=>Object.entries(c.stats).filter(([k])=>k!=='rank').reduce((n,[,v])=>n+v,0);
const gameStatus=(txt)=>{$('game-status').textContent=txt;};
const clearTimers=()=>{state.epoch++;clearTimeout(state.botTimer);clearTimeout(state.roundTimer);state.botTimer=state.roundTimer=null;};
function showThemes(){
 $('roster-summary').textContent=THEME_IDS.length+' PACKS · '+THEME_IDS.length*80+' CARDS';
 $('theme-grid').innerHTML=THEME_IDS.map(id=>{const p=getTheme(id);return '<button class="theme-tile '+(id===state.themeId?'selected':'')+'" style="--h:'+p.hue+'" data-theme="'+id+'" aria-pressed="'+(id===state.themeId)+'" aria-label="Browse '+escape(p.name)+' collection"><span class="theme-icon">'+visual(p)+'</span><span class="theme-copy"><small>COLLECTION '+String(THEME_IDS.indexOf(id)+1).padStart(2,'0')+' / 07</small><strong>'+escape(p.name)+'</strong><span>'+escape(p.tagline)+'</span><span class="theme-tag">80 UNIQUE CARDS <i aria-hidden="true">✦</i> 8 STATS</span></span><span class="theme-arrow" aria-hidden="true">↗</span></button>';}).join('');
 $('theme-grid').querySelectorAll('[data-theme]').forEach(btn=>btn.onclick=()=>choose(btn.dataset.theme));
}
function choose(id){
 if(!getTheme(id))return;
 clearTimers();state.game=null;state.showdown=false;$('game').classList.add('hidden');$('end').classList.add('hidden');
 state.themeId=id;state.group='all';state.query='';$('search').value='';
 document.body.dataset.theme=id;
 state.deckSize=Number($('player-filter').value)||2;
 $('collection-title').textContent=pack().name.toUpperCase();
 $('collection-subtitle').textContent=pack().disclaimer+' • Rank is the ONLY stat where lower wins.';
 $('group').innerHTML='<option value="all">ALL GROUPS</option>'+[...new Set(pack().cards.map(c=>c.group))].map(s=>'<option value="'+escape(s)+'">'+escape(s)+'</option>').join('');
 document.documentElement.style.setProperty('--theme-hue',pack().hue);
 document.documentElement.style.setProperty('--theme-accent','hsl('+pack().hue+' 90% 72%)');
 showThemes();showCards();
}
function cardsMarkup(c){
 const p=pack(),best=p.categories.slice(1).map(s=>s.key).sort((a,b)=>c.stats[b]-c.stats[a]).slice(0,2);
 const strongest=best.map(k=>'<span><em>'+escape(k.toUpperCase())+'</em><b>'+c.stats[k]+'</b></span>').join('');
 return '<button class="collection-card" data-card="'+c.id+'" style="--h:'+p.hue+'" aria-label="Inspect '+escape(c.name)+', rank '+c.stats.rank+'">'+
 '<span class="card-top"><span>DV // '+String(c.id).padStart(3,'0')+'</span><span class="rank-pill">RANK '+String(c.stats.rank).padStart(2,'0')+'</span></span>'+
 '<span class="card-symbol">'+visual(p)+'</span><span class="card-name">'+escape(c.name)+'</span>'+
 '<span class="card-role">'+escape(c.group)+' <span aria-hidden="true">↗</span></span><span class="mini-stats">'+strongest+'</span></button>';
}
function showCards(){
 let list=selectedCards();
 if(state.group!=='all')list=list.filter(c=>c.group===state.group);
 const term=state.query.toLocaleLowerCase();
 if(term)list=list.filter(c=>[c.name,c.group,c.role].some(value=>value.toLocaleLowerCase().includes(term)));
 if(state.sort==='rank')list.sort((a,b)=>a.stats.rank-b.stats.rank);
 else if(state.sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name));
 else if(state.sort==='power')list.sort((a,b)=>power(b)-power(a)||a.stats.rank-b.stats.rank);
 $('cards').innerHTML=list.map(cardsMarkup).join('');
 $('count').textContent=list.length;
 $('empty').classList.toggle('hidden',list.length>0);
 $('clear-search').classList.toggle('hidden',!state.query);
 $('filter-summary').textContent='SHOWING '+list.length+' OF '+selectedCards().length+' CARDS · '+pack().name.toUpperCase();
 $('cards').querySelectorAll('[data-card]').forEach(btn=>btn.onclick=()=>openDetails(Number(btn.dataset.card)));
}
function openDetails(id){
 const c=currentCard(id),p=pack();if(!c)return;
 state.lastFocus=document.activeElement;
 $('detail-body').innerHTML='<div class="detail-art" style="--h:'+p.hue+'">'+visual(p)+'</div><p class="eyebrow">'+escape(c.group)+' · CARD '+c.id+'</p><h2 id="detail-name">'+escape(c.name.toUpperCase())+'</h2><p class="subtle">'+escape(p.disclaimer)+'</p><div class="detail-stats">'+p.categories.map(s=>'<div class="detail-stat"><div><span>'+escape(s.name)+(s.direction==='min'?' <em>LOWER WINS</em>':'')+'</span><b>'+c.stats[s.key]+'</b></div><div class="meter" role="meter" aria-label="'+escape(s.name)+'" aria-valuemin="1" aria-valuemax="100" aria-valuenow="'+c.stats[s.key]+'"><span style="width:'+(s.direction==='min'?Math.round((81-c.stats.rank)/80*100):c.stats[s.key])+'%"></span></div><small>'+escape(s.meaning)+'</small></div>').join('')+'</div>';
 $('details').classList.remove('hidden');$('close').focus();document.body.classList.add('no-scroll');
}
function closeDetails(){
 $('details').classList.add('hidden');document.body.classList.remove('no-scroll');state.lastFocus?.focus?.();
}
function start(){
 clearTimers();
 const qaFirst=(['127.0.0.1','localhost'].includes(location.hostname)&&new URLSearchParams(location.search).has('qa-first'))?0:null;
 state.game=startPackMatch({themeId:state.themeId,playerCount:Number($('players').value),chooser:qaFirst});
 state.showdown=false;$('game').classList.remove('hidden');$('end').classList.remove('hidden');$('start').textContent='↻ NEW MATCH';
 renderGame();scheduleBot();
 $('arena').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});
}
function end(){
 clearTimers();state.game=null;state.showdown=false;$('game').classList.add('hidden');$('end').classList.add('hidden');$('start').textContent='⚡ DEAL THE CARDS';
}
const renderBattleCard=(c,hidden,seat)=>{
 const p=pack(),last=state.showdown?state.game?.last:null;
 if(hidden)return '<div class="battle-card hidden-card" aria-label="Bot '+seat+' card concealed"><div class="hidden-sigil">'+visual(p)+'</div><strong>CLASSIFIED</strong><small>OPPONENT CARD HIDDEN</small></div>';
 if(!c)return '<div class="battle-card hidden-card"><strong>NO CARDS LEFT</strong></div>';
 const playedStat=last?.stat,winner=last?.winner===seat;
 const stats=p.categories.map(s=>{
  const value=c.stats[s.key],chosen=playedStat===s.key?' played-stat':'';
  return '<span class="battle-stat'+chosen+'"><em>'+escape(s.name)+'</em><b>'+value+'</b>'+
   '<i class="stat-meter" aria-hidden="true"><i style="width:'+(s.direction==='min'?Math.round((81-value)/80*100):value)+'%"></i></i></span>';
 }).join('');
 return '<div class="battle-card'+(winner?' winning-card':'')+'" style="--h:'+p.hue+'"><div class="battle-top"><span>DECKVERSE / '+escape(p.id.toUpperCase())+'</span><span># '+String(c.id).padStart(3,'0')+'</span></div>'+
 '<div class="battle-art">'+visual(p)+'</div><div class="battle-identity"><h3>'+escape(c.name.toUpperCase())+'</h3><small>'+escape(c.group)+'</small></div>'+
 '<div class="battle-stats">'+stats+'</div><div class="battle-bottom"><span>SEAT '+(seat+1)+' · EDITORIAL RATINGS</span><span>'+(winner?'✦ WINNER':'✦ DV')+'</span></div></div>';
};
function renderGame(){
 const g=state.game;if(!g)return;
 const p=pack(),v=viewFor(g,0);
 const complete=g.status==='finished';
 $('scoreboard').innerHTML=v.counts.map((n,i)=>'<span class="score '+(g.chooser===i?'caller':'')+'">'+(i===0?'YOU':'BOT '+i)+' <b>'+n+'</b></span>').join('');
 $('jackpot').textContent=v.pot?'✦ JACKPOT · '+v.pot+' CARDS AT STAKE':'◇ NO JACKPOT CARDS';
 $('jackpot').classList.toggle('jackpot-live',v.pot>0);
 $('round-indicator').textContent='ROUND '+String(g.round+1).padStart(2,'0')+' / '+(g.status==='finished'?'MATCH OVER':'MATCH LIVE');
 const cards=g.last&&state.showdown?g.last.played.map(x=>({seat:x.seat,card:currentCard(x.id)})):Array.from({length:g.playerCount},(_,i)=>({seat:i,card:i===0?v.topCard:null}));
 $('battle').innerHTML=cards.map(({seat,card})=>'<div class="battle-slot">'+renderBattleCard(card,card===null&&seat!==0,seat)+'<span class="seat-label">'+(seat===0?'YOUR TOP CARD':'BOT '+seat)+'</span></div>').join('');
 if(state.showdown&&g.last){
   const round=g.last;const title=round.kind==='tie'?'TIE — JACKPOT GROWS':round.winner===0?'YOU WIN THE ROUND':round.winner===null?'THE CARDS ARE TIED':'BOT '+round.winner+' WINS';
   $('reveal').classList.remove('hidden');$('reveal').classList.toggle('jackpot-reveal',round.kind==='tie');$('reveal').classList.toggle('victory-reveal',round.winner===0);$('reveal').innerHTML='<span class="reveal-eyebrow">ROUND '+String(round.round).padStart(2,'0')+' · '+(round.kind==='tie'?'JACKPOT':'SHOWDOWN')+'</span><strong>'+title+'</strong><span>'+escape(p.categories.find(x=>x.key===round.stat).name)+' · '+round.played.map(x=>escape(x.name)+' '+x.value).join(' VS ')+'</span>';
 }else $('reveal').classList.add('hidden');
 const myTurn=g.chooser===0&&!complete&&!state.showdown;
 gameStatus(state.showdown?'ROUND '+g.round+' REVEALED':complete?(g.winner===0?'YOU WIN THE MATCH!':'BOT '+g.winner+' WINS THE MATCH'):myTurn?'YOUR TURN TO CHOOSE':'BOT '+g.chooser+' IS CHOOSING...');
 $('game-status').classList.toggle('is-victory',complete&&g.winner===0);
 $('game-status').classList.toggle('is-finished',complete);
 $('prompt').textContent=complete?'MATCH FINISHED':state.showdown?'ROUND RESULT':myTurn?'PICK YOUR STRONGEST CATEGORY':'WAIT FOR BOT '+g.chooser;
 $('help').textContent=complete?'Use NEW MATCH to play another shuffled game.':state.showdown?'The next hand begins automatically.':myTurn?'Choose using YOUR visible card. Other cards stay hidden.':'The bot chooses from its own card without seeing yours.';
 $('actions').innerHTML=p.categories.map(s=>'<button class="stat-button" data-stat="'+s.key+'" aria-label="Choose '+escape(s.name)+', '+(s.direction==='min'?'lower':'higher')+' wins" '+(myTurn?'':'disabled')+'><span>'+escape(s.name)+'</span><strong>'+(v.topCard?.stats[s.key]??'—')+'</strong><small>'+(s.direction==='min'?'↓ LOWER':'↑ HIGHER')+' WINS</small></button>').join('');
 $('actions').querySelectorAll('[data-stat]').forEach(btn=>btn.onclick=()=>move(0,btn.dataset.stat));
}
function move(seat,stat){
 const g=state.game;if(!g||state.showdown||g.status!=='playing'||g.chooser!==seat)return;
 try{state.game=takeTurn(g,seat,stat);}catch(error){gameStatus('Could not apply turn: '+error.message);return;}
 state.showdown=true;renderGame();
 const epoch=state.epoch;state.roundTimer=setTimeout(()=>{if(state.epoch!==epoch)return;state.showdown=false;renderGame();scheduleBot();},pace().reveal);
}
function scheduleBot(){
 const g=state.game;if(!g||g.status!=='playing'||g.chooser===0||state.showdown)return;
 const epoch=state.epoch;
 state.botTimer=setTimeout(()=>{if(state.epoch!==epoch)return;const active=state.game;if(!active||active.status!=='playing')return;move(active.chooser,bestBlindCategory(active,active.chooser));},pace().bot);
}
$('search').oninput=e=>{state.query=e.target.value.trim();showCards()};
$('clear-search').onclick=()=>{state.query='';$('search').value='';showCards();$('search').focus()};
$('sort').onchange=e=>{state.sort=e.target.value;showCards()};
$('group').onchange=e=>{state.group=e.target.value;showCards()};
$('player-filter').onchange=e=>{state.deckSize=Number(e.target.value);showCards()};
$('players').onchange=e=>{if(state.game)end();$('player-filter').value=e.target.value;state.deckSize=Number(e.target.value);showCards()};
$('start').onclick=start;$('end').onclick=end;$('close').onclick=closeDetails;$('backdrop').onclick=closeDetails;
document.addEventListener('keydown',e=>{
 if($('details').classList.contains('hidden'))return;
 if(e.key==='Escape'){e.preventDefault();closeDetails();return;}
 if(e.key==='Tab'){
  const buttons=[...$('details').querySelectorAll('button:not([disabled])')];
  const first=buttons[0],last=buttons[buttons.length-1];if(!first)return;
  if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
 }
});
const requestedTheme=new URLSearchParams(location.search).get('theme');
choose(getTheme(requestedTheme)?requestedTheme:'avengers');$('player-filter').value='2';state.deckSize=2;showCards();
