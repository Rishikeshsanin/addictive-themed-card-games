// Experimental 3-4 player engine. Keep the deployed 2-player engine unchanged.
// This module deliberately has no network/storage side effects.
import {card,DECKS,STAT_FIELDS} from './catalog.js';
import {shuffle,secureIndex,assert} from './engine.js';
export const MULTI_RULE_VERSION='multi-1.0.0';
export const supportedPlayers=Object.freeze([3,4]);
const copy=x=>structuredClone(x);
const validStat=key=>STAT_FIELDS.find(s=>s.key===key);
const activeSeats=s=>s.players.flatMap((p,i)=>p.deck.length?[i]:[]);
const clockwise=(seats,from)=>seats.includes(from)?from:seats.find(i=>i>from)??seats[0];
const nextSeat=(seats,from)=>seats.find(i=>i>from)??seats[0];
export function startMultiGame({playerCount,ids=DECKS[playerCount],picker=secureIndex,chooser=null}={}){
 assert(supportedPlayers.includes(playerCount),'Only 3 or 4 player decks supported');
 assert(Array.isArray(ids)&&ids.length===20*playerCount&&new Set(ids).size===ids.length,'Deck size must equal 20 distinct cards per player');
 assert(ids.every(id=>card(id)),'Deck includes an unknown card');
 const cards=shuffle(ids,picker);
 const start=chooser===null?picker(playerCount):chooser;
 assert(Number.isInteger(start)&&start>=0&&start<playerCount,'Invalid chooser');
 const state={version:MULTI_RULE_VERSION,playerCount,total:ids.length,players:Array.from({length:playerCount},(_,i)=>({deck:cards.slice(i*20,(i+1)*20)})),pot:[],chooser:start,consecutiveTies:0,round:0,status:'playing',winner:null,last:null};
 validateMulti(state);return state;
}
export function validateMulti(s){
 assert(s&&supportedPlayers.includes(s.playerCount),'Invalid player count');
 assert(s.total===s.playerCount*20,'Invalid configured deck total');
 assert(['playing','finished','aborted'].includes(s.status),'Invalid match status');
 assert(Number.isSafeInteger(s.round)&&s.round>=0,'Invalid round counter');
 assert(s.players?.length===s.playerCount,'Wrong roster length');
 assert(s.players.every(p=>Array.isArray(p.deck))&&Array.isArray(s.pot),'Missing decks');
 const all=[...s.players.flatMap(p=>p.deck),...s.pot];
 assert(all.length===s.total,'Card conservation violated');
 assert(new Set(all).size===all.length,'Duplicate card in game');
 assert(all.every(id=>card(id)),'Unknown card');
 assert(Number.isInteger(s.chooser)&&s.chooser>=0&&s.chooser<s.playerCount,'Bad chooser');
 assert(Number.isInteger(s.consecutiveTies)&&s.consecutiveTies>=0,'Invalid tie count');
 if(s.status==='finished')assert(Number.isInteger(s.winner)&&s.winner>=0&&s.winner<s.playerCount,'Invalid winner');
 return true;
}
export function multiTurn(input,actor,key){
 assert(input?.status==='playing','Match already finished');
 const rule=validStat(key);
 assert(rule,'Invalid category');
 assert(actor===input.chooser,'Not your category-selection turn');
 validateMulti(input);
 const s=copy(input),seats=activeSeats(s);
 assert(seats.length>=2,'At least two competing decks are required');
 assert(seats.includes(actor),'Chooser has no cards');
 const cardsDrawn=seats.map(i=>({seat:i,id:s.players[i].deck.shift()}));
 const ordered=[...cardsDrawn].sort((a,b)=>(rule.direction==='min'?card(a.id)[key]-card(b.id)[key]:card(b.id)[key]-card(a.id)[key])||a.seat-b.seat);
 const best=card(ordered[0].id)[key];
 const leading=ordered.filter(p=>card(p.id)[key]===best);
 s.round++;let winner=null,kind='win',awarded=[];
 if(leading.length>1){
  s.pot.push(...cardsDrawn.map(x=>x.id));s.consecutiveTies++;kind='tie';
  const remaining=activeSeats(s);
  if(remaining.length===0){
   // Every deck exhausted. Rank is uniquely assigned; resolve to avoid permanent stalemate.
   const chosen=[...cardsDrawn].sort((a,b)=>card(a.id).rank-card(b.id).rank)[0];
   winner=chosen.seat;kind='sudden-death';
  }else if(remaining.length===1){
   winner=remaining[0];kind='last-standing';
  }else{
   s.chooser=s.consecutiveTies%2===0?nextSeat(remaining,s.chooser):clockwise(remaining,s.chooser);
  }
 }else{winner=leading[0].seat}
 if(winner!==null){
  if(kind==='win')awarded=[cardsDrawn.find(x=>x.seat===winner).id,...cardsDrawn.filter(x=>x.seat!==winner).map(x=>x.id),...s.pot];
  else awarded=[...s.pot];
  s.players[winner].deck.push(...awarded);s.pot=[];
  s.chooser=winner;s.consecutiveTies=0;
 }
 const remaining=activeSeats(s);
 if(remaining.length===1&&s.pot.length===0){s.status='finished';s.winner=remaining[0];s.chooser=remaining[0]}
 s.last={round:s.round,cards:cardsDrawn,stat:key,values:cardsDrawn.map(x=>card(x.id)[key]),kind,winner,awardedCount:awarded.length,counts:s.players.map(p=>p.deck.length),pot:s.pot.length};
 validateMulti(s);return s;
}
export function multiViewFor(state,seat){
 validateMulti(state);
 assert(Number.isInteger(seat)&&seat>=0&&seat<state.playerCount,'Invalid viewer');
 const own=state.players[seat].deck, last=state.last;
 return {version:state.version,playerCount:state.playerCount,status:state.status,round:state.round,chooser:state.chooser,winner:state.winner,me:seat,counts:state.players.map(p=>p.deck.length),pot:state.pot.length,consecutiveTies:state.consecutiveTies,topCard:own.length?card(own[0]):null,last:last?{...copy(last),cards:last.cards.map(x=>({seat:x.seat,id:x.id,name:card(x.id).name}))}:null,total:state.total};
}
