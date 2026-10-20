// Self-contained theme engine. Rules mirror classic DeckVerse 1v1 without importing
// Pokémon data or touching live DB / Vercel APIs.
import {DECK,STAT_FIELDS,card} from './data.js';
const requireState=(condition,msg)=>{if(!condition)throw Error(msg)};
export function securePick(max){
 requireState(Number.isInteger(max)&&max>0,'Invalid draw bound');
 const ceiling=Math.floor(2**32/max)*max;let n;
 do{n=crypto.getRandomValues(new Uint32Array(1))[0]}while(n>=ceiling);
 return n%max;
}
export function shuffle(ids,picker=securePick){
 const output=[...ids];
 for(let i=output.length-1;i>0;i--){const j=picker(i+1);requireState(Number.isInteger(j)&&j>=0&&j<=i,'Invalid shuffle index');[output[i],output[j]]=[output[j],output[i]]}
 return output;
}
export function newDuel({ids=DECK,picker=securePick,chooser=null}={}){
 requireState(Array.isArray(ids)&&ids.length===50&&new Set(ids).size===50,'Classic Avengers deck requires 50 unique characters');
 requireState(ids.every(id=>card(id)),'Unknown hero or villain');
 const dealt=shuffle(ids,picker),first=chooser===null?picker(2):chooser;
 requireState(first===0||first===1,'Invalid initial chooser');
 const state={version:'avengers-v0.1',status:'playing',players:[{deck:dealt.slice(0,25)},{deck:dealt.slice(25)}],pot:[],chooser:first,consecutiveTies:0,round:0,last:null,winner:null,total:50};
 validateDuel(state);return state;
}
export function compare(a,b,key){
 const category=STAT_FIELDS.find(f=>f.key===key);
 requireState(category,'Unknown stat');
 const x=card(a)?.[key],y=card(b)?.[key];
 requireState(Number.isFinite(x)&&Number.isFinite(y),'Bad comparison values');
 return x===y?-1:category.direction==='min'?(x<y?0:1):(x>y?0:1);
}
export function playTurn(input,actor,key){
 requireState(input?.status==='playing','Match already over');
 requireState(actor===input.chooser,'Only the category caller can act');
 requireState(STAT_FIELDS.some(f=>f.key===key),'Unknown stat');
 const state=structuredClone(input);
 requireState(state.players.every(p=>p.deck.length),'Missing playable card');
 const drawn=state.players.map(p=>p.deck.shift());
 let outcome=compare(drawn[0],drawn[1],key),type='win',awarded=[];
 state.round++;
 if(outcome===-1){
  state.pot.push(...drawn);state.consecutiveTies++;type='tie';
  if(state.consecutiveTies%2===0)state.chooser=1-state.chooser;
  if(state.players.some(p=>p.deck.length===0)){
   // Rank 1..50 is distinct, so sudden death never introduces another tie.
   outcome=compare(drawn[0],drawn[1],'rank');
   type='sudden-death';
   awarded=[...state.pot];state.players[outcome].deck.push(...awarded);
   state.pot=[];state.chooser=outcome;state.consecutiveTies=0;
  }
 }else{
  awarded=[drawn[outcome],drawn[1-outcome],...state.pot];
  state.players[outcome].deck.push(...awarded);
  state.pot=[];state.chooser=outcome;state.consecutiveTies=0;
 }
 if(state.pot.length===0&&state.players.some(p=>p.deck.length===0)){
  state.status='finished';state.winner=state.players[0].deck.length?0:1;
 }
 state.last={round:state.round,cards:drawn,stat:key,values:drawn.map(id=>card(id)[key]),type,winner:type==='tie'?null:outcome,awarded:awarded.length,counts:state.players.map(p=>p.deck.length)};
 validateDuel(state);return state;
}
export function validateDuel(state){
 requireState(state?.players?.length===2,'Two-player state required');
 const all=[...state.players.flatMap(p=>p.deck),...state.pot];
 requireState(all.length===state.total,'Card conservation failed');
 requireState(new Set(all).size===all.length,'A card was duplicated');
 requireState(all.every(id=>card(id)),'Unknown card');
 requireState(state.chooser===0||state.chooser===1,'Invalid chooser');
 requireState(Number.isInteger(state.consecutiveTies)&&state.consecutiveTies>=0,'Bad tie state');
 if(state.status==='finished')requireState(state.winner===0||state.winner===1,'Missing winner');
 return true;
}
export function viewFor(state,viewer){
 requireState(viewer===0||viewer===1,'Invalid viewer');
 const last=state.last?{...state.last,cards:[...state.last.cards]}:null;
 return {status:state.status,round:state.round,chooser:state.chooser,me:viewer,winner:state.winner,counts:state.players.map(p=>p.deck.length),pot:state.pot.length,consecutiveTies:state.consecutiveTies,topCard:card(state.players[viewer].deck[0])||null,last,total:state.total};
}
