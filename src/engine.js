import {card,STAT_FIELDS,DECKS} from './catalog.js';
export const RULE_VERSION='1.0.0';
export const assert=(condition,message)=>{if(!condition)throw new Error(message)};
export const secureIndex=(max)=>{assert(Number.isInteger(max)&&max>0,'Invalid shuffle bound');const ceiling=Math.floor(4294967296/max)*max;let n;do{n=crypto.getRandomValues(new Uint32Array(1))[0]}while(n>=ceiling);return n%max};
export function shuffle(cards,pick=secureIndex){const out=[...cards];for(let i=out.length-1;i>0;i--){const j=pick(i+1);[out[i],out[j]]=[out[j],out[i]]}return out}
export function newGame({ids=DECKS[2],picker=secureIndex,chooser=null}={}) {
 assert(Array.isArray(ids)&&ids.length>0&&ids.length%2===0&&new Set(ids).size===ids.length,'Deck must have an even count of distinct cards');
 assert(ids.every(x=>card(x)),'Unknown card in deck');
 const shuffled=shuffle(ids,picker),half=ids.length/2;
 const start=chooser===null?picker(2):chooser;
 assert(start===0||start===1,'Invalid initial chooser');
 return {version:RULE_VERSION,total:ids.length,players:[{deck:shuffled.slice(0,half)},{deck:shuffled.slice(half)}],pot:[],chooser:start,consecutiveTies:0,round:0,status:'playing',winner:null,last:null};
}
export function compare(a,b,key){
 const rule=STAT_FIELDS.find(s=>s.key===key);assert(rule,'Invalid category');
 const x=card(a)?.[key],y=card(b)?.[key];
 assert(Number.isFinite(x)&&Number.isFinite(y),'Bad stat value');
 return x===y?-1:(rule.direction==='min'?(x<y?0:1):(x>y?0:1));
}
export function takeTurn(input,actor,key) {
 assert(input?.status==='playing','Match already ended');
 assert(actor===input.chooser,'Not your category-selection turn');
 assert(STAT_FIELDS.some(s=>s.key===key),'Invalid category');
 const next=JSON.parse(JSON.stringify(input));
 assert(next.players[0].deck.length&&next.players[1].deck.length,'Missing playable cards');
 const drawn=next.players.map(p=>p.deck.shift());
 const cmp=compare(drawn[0],drawn[1],key);
 next.round++;
 let winner=cmp,kind='win',awarded=[];
 if(cmp===-1){
   next.pot.push(...drawn);
   next.consecutiveTies++;
   kind='tie';
   if(next.consecutiveTies%2===0)next.chooser=1-next.chooser;
   if(next.players.some(p=>p.deck.length===0)){
     winner=compare(drawn[0],drawn[1],'rank');kind='sudden-death';
     next.players[winner].deck.push(...next.pot);awarded=[...next.pot];next.pot=[];next.chooser=winner;next.consecutiveTies=0;
   }
 }else{
   // Current winning card first, then losing card, followed by the accumulated jackpot.
   awarded=[drawn[winner],drawn[1-winner],...next.pot];
   next.players[winner].deck.push(...awarded);
   next.pot=[];next.chooser=winner;next.consecutiveTies=0;
 }
 if(next.players.some(p=>p.deck.length===0)&&next.pot.length===0){
   next.status='finished';next.winner=next.players[0].deck.length?0:1;
 }
 next.last={round:next.round,cards:drawn,stat:key,values:drawn.map(id=>card(id)[key]),kind,winner:kind==='tie'?null:winner,awarded,counts:next.players.map(p=>p.deck.length),pot:next.pot.length};
 validate(next);return next;
}
export function validate(state){
 assert(state.players.length===2,'Invalid player count');const all=[...state.players[0].deck,...state.players[1].deck,...state.pot];
 assert(all.length===state.total,'Card conservation violated');
 assert(new Set(all).size===all.length,'Duplicated card found');
 assert(all.every(x=>card(x)),'Unknown deck card');assert(state.chooser===0||state.chooser===1,'Unknown chooser');
 assert(state.consecutiveTies>=0,'Invalid tie counter');
 if(state.status==='finished')assert(state.winner===0||state.winner===1,'Missing winner');
 return true;
}
export function viewFor(state,viewer){
 assert(viewer===0||viewer===1,'Invalid player index');
 const own=state.players[viewer].deck;
 const last=state.last?{...state.last,cards:state.last.cards.map(id=>({id,name:card(id).name})),awarded:undefined}:null;
 return {status:state.status,round:state.round,chooser:state.chooser,winner:state.winner,me:viewer,topCard:own.length?card(own[0]):null,counts:state.players.map(p=>p.deck.length),pot:state.pot.length,consecutiveTies:state.consecutiveTies,last,total:state.total};
}
export function benchmark(ids=DECKS[2]){
 const pairs=[],wins=Object.fromEntries(ids.map(i=>[i,{w:0,l:0,t:0}]));
 for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
 const a=ids[i],b=ids[j];let aw=0,bw=0,t=0;
 for(const s of STAT_FIELDS){const w=compare(a,b,s.key);if(w===0)aw++;else if(w===1)bw++;else t++}
 wins[a].w+=aw;wins[b].w+=bw;wins[a].l+=bw;wins[b].l+=aw;wins[a].t+=t;wins[b].t+=t;pairs.push({a,b,aw,bw,t});
 }
 return {cards:ids.length,pairs:pairs.length,comparisons:pairs.length*STAT_FIELDS.length,score:Object.entries(wins).map(([id,x])=>({id:+id,rate:(x.w+x.t/2)/(x.w+x.l+x.t)})),dominance:pairs.filter(p=>p.aw>=7||p.bw>=7).length,completeDominance:pairs.filter(p=>p.aw===8||p.bw===8).length};
}
