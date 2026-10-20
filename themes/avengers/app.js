import {CHARACTERS,STAT_FIELDS,FACTIONS,card} from './data.js';
import {newDuel,playTurn,viewFor,securePick} from './engine.js';
const $=id=>document.getElementById(id);
const escape=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
let game=null,revealing=false,timer=null,botTimer=null,epoch=0,filter='All';
const label=c=>c.faction==='Avengers'?'AVENGER':c.faction==='Guardians'?'GUARDIAN':c.faction==='Villains'?'ADVERSARY':'ALLY';
const format=n=>String(n).padStart(3,'0');
const factionEmoji={Avengers:'✦',Allies:'◇',Guardians:'✺',Villains:'♠'};
function statsMarkup(c,{dense=false}={}){
 return STAT_FIELDS.map(s=>'<div class="stat-line '+(dense?'dense':'')+'"><span>'+s.icon+' '+s.name+'</span><b>'+c[s.key]+'</b></div>').join('');
}
function cardFace(c,selected=''){
 if(!c)return '<div class="playing-back"><span>✺</span><b>CLASSIFIED</b><small>THE NEXT CARD IS HIDDEN</small></div>';
 return '<article class="playing-card" style="--character-hue:'+Number(c.hue)+'">'+
 '<div class="playing-top"><b>DECKVERSE / SAGA</b><span>NO. '+format(c.id)+'</span></div>'+
 '<div class="character-art"><div class="energy-circle"></div><span class="art-insignia" aria-hidden="true">'+escape(c.sigil)+'</span><span class="art-role">'+escape(c.className)+'</span></div>'+
 '<div class="playing-name">'+escape(c.name.toUpperCase())+'</div>'+
 '<div class="playing-team">'+escape(label(c))+' · '+escape(c.className)+'</div>'+
 '<div class="playing-stats">'+STAT_FIELDS.map(s=>'<div class="stat-line '+(selected===s.key?'stat-selected':'')+'"><span>'+s.icon+' '+s.name+'</span><b>'+c[s.key]+'</b></div>').join('')+'</div>'+
 '<div class="playing-bottom"><span>SCENARIO-TUNED RATINGS</span><span>✦</span></div></article>';
}
function rosterPreview(c){
 return '<button class="roster-card" data-character="'+c.id+'" style="--character-hue:'+Number(c.hue)+'" aria-label="View '+escape(c.name)+' details">'+
 '<div class="roster-number">NO. '+format(c.id)+' <span>RANK '+String(c.rank).padStart(2,'0')+'</span></div>'+
 '<div class="roster-symbol">'+escape(c.sigil)+'</div>'+
 '<div class="roster-text"><small>'+escape(label(c))+'</small><strong>'+escape(c.name.toUpperCase())+'</strong></div>'+
 '<div class="roster-bottom"><span>'+escape(c.className)+'</span><span>VIEW INTEL ↗</span></div></button>';
}
function renderRoster(){
 const term=$('character-search').value.trim().toLowerCase();
 const found=CHARACTERS.filter(c=>(filter==='All'||filter===c.faction)&&(!term||[c.name,c.faction,c.className,c.signature].some(x=>x.toLowerCase().includes(term))));
 $('collection-grid').innerHTML=found.map(rosterPreview).join('');
 $('collection-count').textContent=found.length;
 $('collection-empty').classList.toggle('hidden',found.length>0);
 for(const el of $('collection-grid').querySelectorAll('[data-character]'))el.onclick=()=>openDetails(Number(el.dataset.character));
}
function renderFilters(){
 $('filters').innerHTML=FACTIONS.map(group=>'<button data-faction="'+group+'" class="'+(filter===group?'active':'')+'" aria-pressed="'+(filter===group?'true':'false')+'">'+escape(group.toUpperCase())+'</button>').join('');
 for(const element of $('filters').querySelectorAll('[data-faction]'))element.onclick=()=>{filter=element.dataset.faction;renderFilters();renderRoster()};
}
let previousFocus=null;
function openDetails(id){
 const c=card(id);if(!c)return;
 previousFocus=document.activeElement;
 $('drawer-body').innerHTML='<div class="drawer-preview" style="--character-hue:'+Number(c.hue)+'"><span>'+escape(c.sigil)+'</span><small>'+escape(c.className)+'</small></div>'+
 '<p class="eyebrow">'+escape(label(c))+' · NO. '+format(c.id)+'</p>'+
 '<h2 id="drawer-name">'+escape(c.name.toUpperCase())+'</h2>'+
 '<p class="drawer-description">SIGNATURE STRENGTH: '+escape(c.signature)+'.<br>LIMITATION: '+escape(c.weakness)+'.</p>'+
 '<p class="drawer-caveat">Scenario-based gameplay scores, not official Marvel power levels. Rank: lower wins; all other categories: higher wins.</p>'+
 '<div class="drawer-stats">'+STAT_FIELDS.map(s=>'<div class="drawer-stat"><div><span>'+s.icon+' '+s.name+'</span><b>'+c[s.key]+'</b></div><div class="meter"><span style="width:'+(s.key==='rank'?Math.round((51-c.rank)/50*100):c[s.key])+'%"></span></div></div>').join('')+'</div>';
 $('character-drawer').classList.remove('hidden');
 document.body.classList.add('drawer-open');
 $('drawer-close').focus();
}
function closeDetails(){
 $('character-drawer').classList.add('hidden');
 document.body.classList.remove('drawer-open');
 previousFocus?.focus?.();
}
function stopTimers(){epoch++;clearTimeout(timer);clearTimeout(botTimer);timer=null;botTimer=null}
function startGame(){
 stopTimers();revealing=false;game=newDuel();
 $('arena').classList.remove('hidden');
 $('match-complete').classList.add('hidden');
 $('result-panel').classList.add('hidden');
 renderBattle();
 $('arena').scrollIntoView({behavior:'smooth',block:'start'});
 scheduleBot();
}
function botChoice(){
 if(!game||game.status!=='playing'||game.chooser!==1)return;
 const top=card(game.players[1].deck[0]);
 const candidates=STAT_FIELDS.map(s=>{
  const value=top[s.key];
  const scores=CHARACTERS.reduce((sum,other)=>sum+(s.direction==='min'?value<other[s.key]:value>other[s.key])?1:0,0);
  const ties=CHARACTERS.reduce((sum,other)=>sum+(value===other[s.key]?1:0),0);
  return {key:s.key,score:scores+ties*0.5};
 }).sort((a,b)=>b.score-a.score);
 return candidates[Math.min(securePick(3),candidates.length-1)].key;
}
function scheduleBot(){
 clearTimeout(botTimer);
 if(!game||game.status!=='playing'||game.chooser!==1||revealing)return;
 const currentEpoch=epoch;
 botTimer=setTimeout(()=>{if(epoch!==currentEpoch||revealing||game?.chooser!==1||game?.status!=='playing')return;act(1,botChoice())},750);
}
function act(actor,key){
 if(!game||revealing||game.status!=='playing'||game.chooser!==actor)return;
 try{game=playTurn(game,actor,key)}
 catch(e){$('battle-help').textContent='A turn could not be completed: '+e.message;return}
 revealing=true;
 renderBattle();
 const currentEpoch=epoch;
 timer=setTimeout(()=>{
  if(epoch!==currentEpoch)return;
  revealing=false;renderBattle();
  if(game.status==='playing')scheduleBot();
 },2600);
}
function renderBattle(){
 if(!game)return;
 const view=viewFor(game,0),last=game.last;
 const showdown=Boolean(revealing&&last),done=game.status==='finished',playerTurn=game.chooser===0;
 $('round-label').textContent='ROUND '+String(game.round+(showdown||done?0:1)).padStart(2,'0');
 $('your-count').textContent=view.counts[0];$('rival-count').textContent=view.counts[1];
 $('turn-state').textContent=showdown?'CARDS REVEALED':done?'MATCH COMPLETE':playerTurn?'YOUR CHOICE':'RIVAL CHOOSING';
 $('own-card').innerHTML=cardFace(showdown?card(last.cards[0]):view.topCard,showdown?last.stat:'');
 $('enemy-card').innerHTML=showdown?cardFace(card(last.cards[1]),last.stat):cardFace(null);
 $('battle-prompt').textContent=showdown?'THE BATTLE IS DECIDED':done?'THE SHOWDOWN IS OVER':playerTurn?'PICK YOUR WINNING CATEGORY':'RIVAL IS THINKING…';
 $('battle-help').textContent=showdown?'Both played cards are now visible. The next round unlocks shortly.':done?'You can restart with a freshly shuffled 50-card deck.':playerTurn?'Only your top card is visible. Pick the stat you trust.':'The rival only knows its own top card; it cannot peek at yours.';
 const canPick=!revealing&&!done&&playerTurn;
 $('stat-actions').innerHTML=STAT_FIELDS.map(s=>'<button class="category-btn" data-stat="'+s.key+'" '+(canPick?'':'disabled')+' title="'+escape(s.hint)+'"><span>'+s.icon+' '+s.name+'</span><strong>'+(view.topCard?view.topCard[s.key]:'—')+'</strong><small>'+(s.direction==='min'?'LOWER':'HIGHER')+' WINS</small></button>').join('');
 for(const el of $('stat-actions').querySelectorAll('[data-stat]'))el.onclick=()=>act(0,el.dataset.stat);
 $('pot-line').textContent=view.pot?'◇ '+view.pot+' CARDS IN THE JACKPOT':'◇ NO CARDS IN THE JACKPOT';
 if(showdown){
  const my=card(last.cards[0]),theirs=card(last.cards[1]);
  const title=last.type==='tie'?'THE CARDS ENTER THE JACKPOT':last.winner===0?'YOU WIN THE ROUND':'THE RIVAL WINS THIS ROUND';
  $('result-panel').className='result-panel '+(last.type==='tie'?'tie':last.winner===0?'win':'lose');
  $('result-panel').innerHTML='<div class="result-icon">'+(last.type==='tie'?'◇':last.winner===0?'✦':'⚔')+'</div><div><h3>'+title+'</h3><p>'+escape(my.name)+' <b>'+last.values[0]+'</b> VS <b>'+last.values[1]+'</b> '+escape(theirs.name)+' · '+escape(last.stat.toUpperCase())+'</p><small>'+(last.type==='tie'?'Every tied card stays in the pot.':last.awarded+' cards claimed this round.')+'</small></div>';
  $('result-panel').classList.remove('hidden');
 }else $('result-panel').classList.add('hidden');
 $('match-complete').classList.toggle('hidden',!done||revealing);
 if(done&&!revealing){
  $('complete-text').innerHTML='<div class="complete-glyph">'+(game.winner===0?'🏆':'⚔')+'</div><h3>'+(game.winner===0?'YOU CONQUERED THE DECK':'THE RIVAL PREVAILS')+'</h3><p>'+game.round+' ROUNDS • '+game.total+' CARDS • ONE WINNER</p>';
 }
}
function leaveGame(){
 stopTimers();revealing=false;game=null;
 $('arena').classList.add('hidden');
 $('result-panel').classList.add('hidden');
 $('intro').scrollIntoView({behavior:'smooth'});
}
$('start-duel').onclick=startGame;
$('restart-duel').onclick=startGame;
$('leave-duel').onclick=leaveGame;
$('character-search').oninput=renderRoster;
$('drawer-close').onclick=closeDetails;
$('drawer-scrim').onclick=closeDetails;
window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!$('character-drawer').classList.contains('hidden'))closeDetails()});
renderFilters();renderRoster();
