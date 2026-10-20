// Server-side theme-aware match adapter. Stateless and database-agnostic.
// Existing Pokémon V2 games delegate to the ORIGINAL 2P/3P/4P engines unchanged.
// Expansion state is never sent directly to a client: use themeViewFor().
import {newGame,takeTurn,viewFor,validate,shuffle,secureIndex} from '../engine.js';
import {startMultiGame,multiTurn,multiViewFor,validateMulti} from '../multi-engine.js';
import {requireThemeId,getServerTheme,getServerManifest,getServerCard,
  serverCompare,DECK_SIZE_BY_PLAYERS,HAND_SIZE_BY_PLAYERS} from './theme-registry.js';

const check=(ok,message)=>{if(!ok)throw new Error(message)};
const clone=value=>structuredClone(value);
const playableSeats=s=>s.players.flatMap((p,seat)=>p.deck.length?[seat]:[]);
const nextSeat=(seats,from)=>seats.find(x=>x>from)??seats[0];
const clockwise=(seats,from)=>seats.includes(from)?from:nextSeat(seats,from);
const checkedStat=(themeId,key)=>{
  const category=getServerTheme(themeId).categories.find(c=>c.key===key);
  check(category,'Unsupported category for room theme');
  return category;
};
const validateChooser=(chooser,n)=>check(Number.isInteger(chooser)&&chooser>=0&&chooser<n,
  'Invalid category chooser');

// Picker/chooser are server test controls only; HTTP callers MUST NOT map user
// JSON fields into these arguments. Production must use its secure random picker.
export function startServerThemeMatch({themeId='pokemon',playerCount=2,
  picker=secureIndex,chooser=null}={}){
  const id=requireThemeId(themeId);
  const cards=getServerManifest(id,playerCount);
  if(id==='pokemon'){
    return playerCount===2?newGame({ids:cards,picker,chooser}):
      startMultiGame({playerCount,ids:cards,picker,chooser});
  }
  const shuffled=shuffle(cards,picker);
  const caller=chooser===null?picker(playerCount):chooser;
  validateChooser(caller,playerCount);
  const size=HAND_SIZE_BY_PLAYERS[playerCount];
  const state={
    version:playerCount===2?'theme-2p-v1':'theme-multi-v1',
    themeId:id,playerCount,total:cards.length,
    players:Array.from({length:playerCount},(_,i)=>({
      deck:shuffled.slice(i*size,(i+1)*size)
    })),
    pot:[],chooser:caller,consecutiveTies:0,round:0,status:'playing',winner:null,last:null
  };
  validateServerThemeMatch(state,id);
  return state;
}
export function validateServerThemeMatch(state,expectedThemeId){
  check(state&&typeof state==='object','Missing game state');
  const id=requireThemeId(state.themeId??'pokemon');
  if(expectedThemeId!==undefined)
    check(id===requireThemeId(expectedThemeId),'Room theme and game-state theme mismatch');
  const n=state.playerCount??2;
  const ids=getServerManifest(id,n),allowed=new Set(ids);
  check(state.total===DECK_SIZE_BY_PLAYERS[n],'Invalid game card total');
  check(Array.isArray(state.players)&&state.players.length===n&&
    state.players.every(p=>Array.isArray(p.deck))&&Array.isArray(state.pot),
    'Malformed hands or central pot');
  check(Number.isSafeInteger(state.round)&&state.round>=0&&
    Number.isSafeInteger(state.consecutiveTies)&&state.consecutiveTies>=0,
    'Invalid round/tie metadata');
  validateChooser(state.chooser,n);
  check(['playing','finished','aborted'].includes(state.status),'Invalid match phase');
  if(state.status==='finished')
    check(Number.isInteger(state.winner)&&state.winner>=0&&state.winner<n,
      'Invalid match winner');
  const all=[...state.players.flatMap(p=>p.deck),...state.pot];
  check(all.length===ids.length&&new Set(all).size===all.length,
    'Card conservation failure');
  check(all.every(cardId=>allowed.has(cardId)),'Foreign card in match');
  // Protect previously serialized V2 Pokémon sessions from accidental changes.
  if(id==='pokemon'){
    if(n===2)validate(state);
    else validateMulti(state);
  }else{
    check(state.playerCount===n&&(n===2?state.version==='theme-2p-v1':
      state.version==='theme-multi-v1'),'Wrong theme game format');
  }
  return true;
}
function twoPlayerTurn(previous,actor,key){
  check(previous.status==='playing','Match already ended');
  check(actor===previous.chooser,'Not your category-selection turn');
  checkedStat(previous.themeId,key);
  const s=clone(previous);
  check(s.players[0].deck.length&&s.players[1].deck.length,'Missing playable cards');
  const played=s.players.map(p=>p.deck.shift());
  const result=serverCompare(s.themeId,played[0],played[1],key);
  s.round++;
  let winner=result,kind='win',awarded=[];
  if(result===-1){
    s.pot.push(...played);s.consecutiveTies++;kind='tie';
    if(s.consecutiveTies%2===0)s.chooser=1-s.chooser;
    if(s.players.some(p=>p.deck.length===0)){
      winner=serverCompare(s.themeId,played[0],played[1],'rank');
      kind='sudden-death';
      check(winner!==-1,'Unique rank contract broken');
      s.players[winner].deck.push(...s.pot);
      awarded=[...s.pot];s.pot=[];s.chooser=winner;s.consecutiveTies=0;
    }
  }else{
    awarded=[played[winner],played[1-winner],...s.pot];
    s.players[winner].deck.push(...awarded);
    s.pot=[];s.chooser=winner;s.consecutiveTies=0;
  }
  if(s.players.some(p=>p.deck.length===0)&&s.pot.length===0){
    s.status='finished';s.winner=s.players[0].deck.length?0:1;
  }
  s.last={round:s.round,cards:played,stat:key,
    values:played.map(cardId=>getServerCard(s.themeId,cardId).stats[key]),
    kind,winner:kind==='tie'?null:winner,awarded,
    counts:s.players.map(p=>p.deck.length),pot:s.pot.length};
  return s;
}
function multiplayerTurn(previous,actor,key){
  check(previous.status==='playing','Match already finished');
  const rule=checkedStat(previous.themeId,key);
  check(actor===previous.chooser,'Not your category-selection turn');
  const s=clone(previous);
  const seats=playableSeats(s);
  check(seats.length>=2,'At least two competing decks required');
  check(seats.includes(actor),'Chooser has no cards');
  const drawn=seats.map(seat=>({seat,id:s.players[seat].deck.shift()}));
  const ordered=[...drawn].sort((a,b)=>
    (rule.direction==='min'?
      getServerCard(s.themeId,a.id).stats[key]-getServerCard(s.themeId,b.id).stats[key]:
      getServerCard(s.themeId,b.id).stats[key]-getServerCard(s.themeId,a.id).stats[key])||
    a.seat-b.seat);
  const best=getServerCard(s.themeId,ordered[0].id).stats[key];
  const leaders=ordered.filter(item=>getServerCard(s.themeId,item.id).stats[key]===best);
  s.round++;
  let winner=null,kind='win',awarded=[];
  if(leaders.length>1){
    s.pot.push(...drawn.map(x=>x.id));s.consecutiveTies++;kind='tie';
    const remaining=playableSeats(s);
    if(remaining.length===0){
      const chosen=[...drawn].sort((a,b)=>
        getServerCard(s.themeId,a.id).stats.rank-
        getServerCard(s.themeId,b.id).stats.rank)[0];
      winner=chosen.seat;kind='sudden-death';
    }else if(remaining.length===1){
      winner=remaining[0];kind='last-standing';
    }else{
      s.chooser=s.consecutiveTies%2===0?
        nextSeat(remaining,s.chooser):clockwise(remaining,s.chooser);
    }
  }else winner=leaders[0].seat;
  if(winner!==null){
    awarded=kind==='win'?
      [drawn.find(x=>x.seat===winner).id,...drawn.filter(x=>x.seat!==winner).map(x=>x.id),...s.pot]:
      [...s.pot];
    s.players[winner].deck.push(...awarded);
    s.pot=[];s.chooser=winner;s.consecutiveTies=0;
  }
  const remaining=playableSeats(s);
  if(remaining.length===1&&s.pot.length===0){
    s.status='finished';s.winner=remaining[0];s.chooser=remaining[0];
  }
  s.last={round:s.round,cards:drawn,stat:key,
    values:drawn.map(x=>getServerCard(s.themeId,x.id).stats[key]),
    kind,winner,awardedCount:awarded.length,
    counts:s.players.map(p=>p.deck.length),pot:s.pot.length};
  return s;
}
export function takeServerThemeTurn(previous,actor,categoryKey,{roomThemeId}={}){
  const id=roomThemeId===undefined?previous?.themeId??'pokemon':requireThemeId(roomThemeId);
  validateServerThemeMatch(previous,id);
  checkedStat(id,categoryKey);
  if(id==='pokemon')return previous.players.length===2?
    takeTurn(previous,actor,categoryKey):multiTurn(previous,actor,categoryKey);
  const next=previous.playerCount===2?
    twoPlayerTurn(previous,actor,categoryKey):
    multiplayerTurn(previous,actor,categoryKey);
  validateServerThemeMatch(next,id);
  return next;
}
export function themeViewFor(previous,viewer,{roomThemeId}={}){
  const id=roomThemeId===undefined?previous?.themeId??'pokemon':requireThemeId(roomThemeId);
  validateServerThemeMatch(previous,id);
  check(Number.isInteger(viewer)&&viewer>=0&&viewer<previous.players.length,
    'Invalid authenticated viewer seat');
  if(id==='pokemon')return previous.players.length===2?
    viewFor(previous,viewer):multiViewFor(previous,viewer);
  const own=previous.players[viewer].deck;
  const last=previous.last?clone(previous.last):null;
  if(last){
    last.cards=previous.players.length===2?
      last.cards.map(cardId=>getServerCard(id,cardId)):
      last.cards.map(card=>({seat:card.seat,...getServerCard(id,card.id)}));
    delete last.awarded; // Never include hidden pot/deck-order attribution.
  }
  const base={version:previous.version,themeId:id,playerCount:previous.playerCount,
    status:previous.status,round:previous.round,chooser:previous.chooser,
    winner:previous.winner,counts:previous.players.map(p=>p.deck.length),
    pot:previous.pot.length,consecutiveTies:previous.consecutiveTies,
    topCard:own.length?getServerCard(id,own[0]):null,last,total:previous.total};
  if(previous.playerCount===2)return {...base,me:viewer};
  return {...base,me:viewer};
}
