// Isolated theme prototype engine; it does NOT mutate the deployed DeckVerse API.
// Matches existing two-player and experimental multi-player card conservation and tie rules.
import {getTheme,getCard,DECK_SIZE,HAND_SIZE} from './index.js';
const assert=(ok,msg)=>{if(!ok)throw new Error(msg)};
export function secureIndex(bound){
 assert(Number.isSafeInteger(bound)&&bound>0&&bound<=0xffffffff,'Invalid bound');
 const cryptoApi=globalThis.crypto;
 assert(cryptoApi?.getRandomValues,'Secure random required');
 const max=0x100000000;
 const cutoff=Math.floor(max/bound)*bound;
 let n;do{n=cryptoApi.getRandomValues(new Uint32Array(1))[0]}while(n>=cutoff);
 return n%bound;
}
export function shuffle(ids,pick=secureIndex){
 const arr=[...ids];for(let i=arr.length-1;i>0;i--){const j=pick(i+1);assert(Number.isInteger(j)&&j>=0&&j<=i,'Invalid random index');[arr[i],arr[j]]=[arr[j],arr[i]]}
 return arr;
}
const activeSeats=state=>state.players.flatMap((p,i)=>p.deck.length?[i]:[]);
const nextSeat=(seats,from)=>seats.find(i=>i>from)??seats[0];
export function startPackMatch({themeId,playerCount=2,pick=secureIndex,chooser=null}={}){
 const theme=getTheme(themeId),n=Number(playerCount);
 assert(theme,'Unknown theme');assert([2,3,4].includes(n),'Only 2, 3, 4 player matches');
 const ids=theme.decks[n];
 assert(ids.length===DECK_SIZE[n]&&new Set(ids).size===ids.length,'Invalid theme deck');
 const cards=shuffle(ids,pick);
 const chosen=chooser===null?pick(n):chooser;
 assert(Number.isInteger(chosen)&&chosen>=0&&chosen<n,'Invalid initial caller');
 const hand=HAND_SIZE[n];
 const state={version:'theme-match-v1',themeId,playerCount:n,total:cards.length,players:Array.from({length:n},(_,i)=>({deck:cards.slice(i*hand,(i+1)*hand)})),pot:[],chooser:chosen,round:0,consecutiveTies:0,status:'playing',winner:null,last:null};
 validateMatch(state);return state;
}
export function validateMatch(s){
 const p=getTheme(s?.themeId);
 assert(p&&[2,3,4].includes(s?.playerCount),'Invalid match/theme');
 assert(s.total===DECK_SIZE[s.playerCount]&&s.players?.length===s.playerCount&&Array.isArray(s.pot),'Invalid hand count');
 assert(Number.isSafeInteger(s.round)&&s.round>=0,'Invalid round');
 assert(Number.isInteger(s.chooser)&&s.chooser>=0&&s.chooser<s.playerCount,'Invalid caller');
 const all=[...s.players.flatMap(p=>p.deck),...s.pot];
 assert(all.length===s.total&&new Set(all).size===all.length,'Card conservation failure');
 assert(all.every(id=>p.decks[s.playerCount].includes(id)),'Foreign card in match');
 assert(['playing','finished'].includes(s.status),'Invalid phase');
 if(s.status==='finished')assert(Number.isInteger(s.winner)&&s.winner>=0&&s.winner<s.playerCount,'Invalid winner');
 return true;
}
export function compareCards(themeId,one,two,categoryKey){
 const p=getTheme(themeId);
 const stat=p?.categories.find(x=>x.key===categoryKey);
 assert(stat,'Unknown category');
 const a=getCard(themeId,one)?.stats[categoryKey],b=getCard(themeId,two)?.stats[categoryKey];
 assert(Number.isInteger(a)&&Number.isInteger(b),'Unknown card');
 if(a===b)return null;
 return (stat.direction==='min'?a<b:a>b)?0:1;
}
export function takeTurn(previous,actor,categoryKey){
 validateMatch(previous);
 assert(previous.status==='playing','Match finished');
 assert(Number.isInteger(actor)&&actor===previous.chooser,'Only the current caller selects');
 const pack=getTheme(previous.themeId);
 const stat=pack.categories.find(x=>x.key===categoryKey);
 assert(stat,'Invalid category');
 const s=structuredClone(previous);
 const seats=activeSeats(s);
 assert(seats.length>=2&&seats.includes(actor),'Insufficient live cards');
 const played=seats.map(seat=>({seat,id:s.players[seat].deck.shift()}));
 const best=stat.direction==='min'?Math.min(...played.map(c=>getCard(s.themeId,c.id).stats[stat.key])):Math.max(...played.map(c=>getCard(s.themeId,c.id).stats[stat.key]));
 const leaders=played.filter(c=>getCard(s.themeId,c.id).stats[stat.key]===best);
 s.round++;
 let winner=null,kind='win';
 if(leaders.length>1){
   s.pot.push(...played.map(x=>x.id));s.consecutiveTies++;kind='tie';
   const remaining=activeSeats(s);
   if(!remaining.length){
     // Unique rank on every manifest guarantees exactly one decisive sudden-death winner.
     winner=[...played].sort((a,b)=>getCard(s.themeId,a.id).stats.rank-getCard(s.themeId,b.id).stats.rank)[0].seat;
     kind='sudden-death';
   }else if(remaining.length===1){
     winner=remaining[0];kind='last-standing';
   }else{
     if(s.consecutiveTies%2===0||!remaining.includes(s.chooser))s.chooser=nextSeat(remaining,s.chooser);
   }
 }else{
   winner=leaders[0].seat;
 }
 let awarded=[];
 if(winner!==null){
   awarded=kind==='win'?[played.find(x=>x.seat===winner).id,...played.filter(x=>x.seat!==winner).map(x=>x.id),...s.pot]:[...s.pot];
   s.players[winner].deck.push(...awarded);s.pot=[];s.chooser=winner;s.consecutiveTies=0;
 }
 const live=activeSeats(s);
 if(live.length===1&&!s.pot.length){s.status='finished';s.winner=live[0];s.chooser=live[0];}
 s.last={round:s.round,kind,stat:categoryKey,played:played.map(x=>({...x,name:getCard(s.themeId,x.id).name,value:getCard(s.themeId,x.id).stats[categoryKey]})),winner,awarded:awarded.length,counts:s.players.map(p=>p.deck.length),pot:s.pot.length};
 validateMatch(s);return s;
}
export function viewFor(state,seat){
 validateMatch(state);
 assert(Number.isInteger(seat)&&seat>=0&&seat<state.playerCount,'Invalid viewer');
 const own=state.players[seat].deck[0];
 return {themeId:state.themeId,playerCount:state.playerCount,total:state.total,round:state.round,status:state.status,chooser:state.chooser,winner:state.winner,counts:state.players.map(p=>p.deck.length),pot:state.pot.length,last:state.last?structuredClone(state.last):null,topCard:own?getCard(state.themeId,own):null};
}
export const bestBlindCategory=(state,seat)=>{
 validateMatch(state);
 const pack=getTheme(state.themeId),top=state.players[seat]?.deck[0];
 assert(top&&state.chooser===seat,'No eligible caller');
 const self=getCard(state.themeId,top);
 const rivals=pack.decks[state.playerCount].filter(id=>id!==top);
 const ranked=pack.categories.map(cat=>{
  let points=0;
  for(const id of rivals){
   const other=getCard(state.themeId,id).stats[cat.key],mine=self.stats[cat.key];
   points+=mine===other?.5:(cat.direction==='min'?mine<other:mine>other)?1:0;
  }
  return {key:cat.key,score:points};
 }).sort((a,b)=>b.score-a.score||pack.categories.findIndex(x=>x.key===a.key)-pack.categories.findIndex(x=>x.key===b.key));
 return ranked[0].key;
};
