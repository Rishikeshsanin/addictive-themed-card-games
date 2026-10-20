import test from 'node:test';
import assert from 'node:assert/strict';
import {DECKS,STAT_FIELDS} from '../src/catalog.js';
import {newGame,takeTurn,viewFor} from '../src/engine.js';
import {startMultiGame,multiTurn,multiViewFor} from '../src/multi-engine.js';
import {THEME_PACKS} from '../themes/packs/index.js';
import {
  ALLOWED_THEME_IDS,DECK_SIZE_BY_PLAYERS,HAND_SIZE_BY_PLAYERS,requireThemeId,
  themeIdForRoom,requireSameRoomTheme,requireCreateTheme,validateThemeDefinition,
  getServerTheme,getServerManifest,getServerCard,listServerThemes,serverCompare
} from '../src/server/theme-registry.js';
import {
  startServerThemeMatch,takeServerThemeTurn,themeViewFor,validateServerThemeMatch
} from '../src/server/theme-match.js';

const THEMES=['pokemon','avengers','ben10','shinchan','dc','naruto','cricket','fantasy'];
const COUNTS=[2,3,4];
const picker=n=>0;
const manifest=id=>({2:[...getServerManifest(id,2)],
  3:[...getServerManifest(id,3)],4:[...getServerManifest(id,4)]});
function sampleDefinition(){
  const keys=['rank','strength','speed','attack','defense','skill','luck','energy'];
  return {id:'fixture',name:'Fixture',categories:keys.map((key,i)=>({
    key,name:key.toUpperCase(),direction:i===0?'min':'max'})),
    cards:Array.from({length:80},(_,i)=>({
      id:i+1,name:'Card '+(i+1),
      stats:Object.fromEntries(keys.map((key,k)=>[key,k===0?i+1:10+i%15]))
    })),
    manifests:{2:Array.from({length:50},(_,i)=>i+1),
      3:Array.from({length:60},(_,i)=>i+1),
      4:Array.from({length:80},(_,i)=>i+1)}
  };
}
test('server allowlist EXACTLY eight immutable themes; prototype injection fails closed',()=>{
  assert.deepEqual(ALLOWED_THEME_IDS,THEMES);
  assert.deepEqual(listServerThemes().map(t=>t.id),THEMES);
  assert.ok(Object.isFrozen(ALLOWED_THEME_IDS));
  assert.deepEqual(Object.keys(DECK_SIZE_BY_PLAYERS),['2','3','4']);
  for(const invalid of ['__proto__','constructor','toString','Avengers',' AVENGERS ','pokemon ', '',null,
    {},[],0])assert.throws(()=>requireThemeId(invalid),/Unsupported theme/);
  assert.equal(requireThemeId(undefined,{allowMissing:true}),'pokemon');
  assert.throws(()=>requireThemeId(undefined),/Unsupported/);
});
test('legacy Pokémon rooms default safely; an assigned theme is immutable',()=>{
  for(const room of [{}, {theme_id:null},{theme_id:'pokemon'}])
    assert.equal(themeIdForRoom(room),'pokemon');
  assert.equal(themeIdForRoom({theme_id:'naruto'}),'naruto');
  assert.equal(requireSameRoomTheme({theme_id:'dc'},undefined),'dc');
  assert.equal(requireSameRoomTheme({theme_id:'dc'},'dc'),'dc');
  assert.throws(()=>requireSameRoomTheme({theme_id:'dc'},'pokemon'),/cannot change/);
  assert.throws(()=>requireSameRoomTheme({},'dc'),/cannot change/);
  assert.throws(()=>themeIdForRoom({theme_id:'__proto__'}),/Unsupported/);
});
test('create accepts only server-known theme IDs and no client-supplied game data',()=>{
  assert.equal(requireCreateTheme({name:'Player',mode:'same'}),'pokemon');
  for(const id of THEMES)assert.equal(requireCreateTheme({name:'Test',themeId:id}),id);
  for(const key of ['cards','deck','decks','deckOrder','manifest','manifests','categories',
    'stats','scores','rank','seed','picker','shuffle','chooser','cardValues','theme_id'])
    assert.throws(()=>requireCreateTheme({themeId:'pokemon',[key]:null}),/forbidden/,key);
  assert.throws(()=>requireCreateTheme({themeId:'missing'}),/Unsupported/);
  assert.throws(()=>requireCreateTheme([]),/Invalid create/);
});
test('every theme has eight unique stat keys and properly directed rank',()=>{
  for(const id of THEMES){
    const theme=getServerTheme(id),categories=theme.categories;
    assert.equal(categories.length,8,id);
    assert.deepEqual(categories.map(c=>c.direction),['min',...Array(7).fill('max')],id);
    assert.equal(categories[0].key,'rank',id);
    assert.equal(new Set(categories.map(c=>c.key)).size,8,id);
    assert.ok(Object.isFrozen(theme)&&Object.isFrozen(categories)&&
      categories.every(Object.isFrozen),id);
    assert.equal(theme.cardCount,80,id);
    if(id!=='pokemon')
      assert.deepEqual(categories.map(c=>c.key),
        THEME_PACKS[id].categories.map(c=>c.key),id);
    else assert.deepEqual(categories.map(c=>c.key),STAT_FIELDS.map(c=>c.key));
  }
});
test('all 8 x 3 manifests contain EXACT unique server-approved card IDs',()=>{
  for(const themeId of THEMES)for(const n of COUNTS){
    const ids=getServerManifest(themeId,n);
    assert.equal(ids.length,DECK_SIZE_BY_PLAYERS[n],themeId+' / '+n);
    assert.equal(new Set(ids).size,ids.length,themeId+' / '+n);
    assert.ok(Object.isFrozen(ids),themeId+' / '+n);
    const theme=getServerTheme(themeId);
    const ranks=new Set();
    for(const id of ids){
      const card=getServerCard(themeId,id);
      assert.ok(card.id===id&&card.name&&Object.isFrozen(card)&&Object.isFrozen(card.stats));
      assert.deepEqual(Object.keys(card.stats).sort(),
        theme.categories.map(c=>c.key).sort());
      for(const stat of theme.categories)
        assert.ok(Number.isFinite(card.stats[stat.key])&&card.stats[stat.key]>=0);
      assert.ok(!ranks.has(card.stats.rank),themeId+' repeated rank');
      ranks.add(card.stats.rank);
    }
    assert.throws(()=>{ids[0]=999999},TypeError);
    assert.deepEqual([...ids],themeId==='pokemon'?[...DECKS[n]]:[...THEME_PACKS[themeId].decks[n]]);
    assert.equal(HAND_SIZE_BY_PLAYERS[n]*n,ids.length);
  }
});
test('each theme refuses categories from other themes and compares using server stats',()=>{
  for(const themeId of THEMES){
    const ids=getServerManifest(themeId,2);
    const [a,b]=ids;
    for(const cat of getServerTheme(themeId).categories){
      const v1=getServerCard(themeId,a).stats[cat.key],v2=getServerCard(themeId,b).stats[cat.key];
      const expected=v1===v2?-1:cat.direction==='min'?(v1<v2?0:1):(v1>v2?0:1);
      assert.equal(serverCompare(themeId,a,b,cat.key),expected);
      assert.equal(serverCompare(themeId,b,a,cat.key),expected===-1?-1:1-expected);
    }
    assert.throws(()=>serverCompare(themeId,a,b,'__proto__'),/Unsupported category/);
    assert.throws(()=>getServerCard(themeId,100000),/Unknown theme card/);
    assert.throws(()=>getServerCard(themeId,'1'),/Invalid card/);
  }
});
test('validator accepts valid synthetic 80-card inputs and rejects duplicate cards/ranks',()=>{
  const original=sampleDefinition();
  assert.equal(validateThemeDefinition(original),true);
  let bad=structuredClone(original);bad.cards[1].id=bad.cards[0].id;
  assert.throws(()=>validateThemeDefinition(bad),/Duplicate card/);
  bad=structuredClone(original);bad.cards[1].name=bad.cards[0].name;
  assert.throws(()=>validateThemeDefinition(bad),/Duplicate card/);
  bad=structuredClone(original);bad.cards[1].stats.rank=bad.cards[0].stats.rank;
  assert.throws(()=>validateThemeDefinition(bad),/Duplicate or invalid rank/);
  bad=structuredClone(original);bad.cards.pop();
  assert.throws(()=>validateThemeDefinition(bad),/80 unique/);
});
test('validator rejects missing/extra/NaN/nonfinite scores and malformed stat categories',()=>{
  const orig=sampleDefinition();
  for(const change of [
    x=>{delete x.cards[0].stats.attack},
    x=>{x.cards[0].stats.attack=Infinity},
    x=>{x.cards[0].stats.attack=NaN},
    x=>{x.cards[0].stats.attack=-1},
    x=>{x.cards[0].stats.unapproved=50},
  ]){
    const bad=structuredClone(orig);change(bad);
    assert.throws(()=>validateThemeDefinition(bad),/stats|score/);
  }
  for(const change of [
    x=>{x.categories[1].key=x.categories[2].key},
    x=>{x.categories[0].direction='max'},
    x=>{x.categories[2].direction='min'},
    x=>{x.categories.pop()},
    x=>{x.categories[1].key='__proto__'},
  ]){
    const bad=structuredClone(orig);change(bad);
    assert.throws(()=>validateThemeDefinition(bad),/categor|lower-wins|eight|stat/);
  }
});
test('validator rejects every malformed 2/3/4 manifest and foreign cards',()=>{
  const orig=sampleDefinition();
  for(const n of COUNTS){
    const changes=[
      x=>{x.manifests[n].pop()},
      x=>{x.manifests[n][0]=x.manifests[n][1]},
      x=>{x.manifests[n][0]=10000},
      x=>{x.manifests[n][0]='1'},
    ];
    for(const mutation of changes){
      const bad=structuredClone(orig);mutation(bad);
      assert.throws(()=>validateThemeDefinition(bad),/manifest|Duplicate|unknown/);
    }
  }
});
test('canonical Pokémon match state and V2 views remain bit-for-bit compatible',()=>{
  for(const n of COUNTS){
    const a=startServerThemeMatch({themeId:'pokemon',playerCount:n,picker,chooser:0});
    const b=n===2?newGame({ids:DECKS[n],picker,chooser:0}):
      startMultiGame({playerCount:n,ids:DECKS[n],picker,chooser:0});
    assert.deepEqual(a,b);
    assert.equal(validateServerThemeMatch(a,'pokemon'),true);
    assert.deepEqual(themeViewFor(a,0),n===2?viewFor(b,0):multiViewFor(b,0));
    const from=a.chooser;
    const next=takeServerThemeTurn(a,from,'rank',{roomThemeId:'pokemon'});
    const old=n===2?takeTurn(b,from,'rank'):multiTurn(b,from,'rank');
    assert.deepEqual(next,old);
    assert.deepEqual(a,b,'turn must not mutate original game state');
  }
});
test('expansion match creation deals unique 50/60/80 cards to 2/3/4 participants',()=>{
  for(const themeId of THEMES.slice(1))for(const playerCount of COUNTS){
    const state=startServerThemeMatch({themeId,playerCount,picker,chooser:0});
    assert.equal(state.themeId,themeId);
    assert.equal(state.playerCount,playerCount);
    assert.deepEqual(state.players.map(p=>p.deck.length),
      Array(playerCount).fill(HAND_SIZE_BY_PLAYERS[playerCount]));
    assert.equal(validateServerThemeMatch(state,themeId),true);
    const view=themeViewFor(state,0,{roomThemeId:themeId});
    assert.equal(view.topCard.id,state.players[0].deck[0]);
    assert.deepEqual(view.counts,Array(playerCount).fill(HAND_SIZE_BY_PLAYERS[playerCount]));
    const serialized=JSON.stringify(view);
    assert.ok(!serialized.includes('"players":'),'full hands exposed');
    assert.ok(!serialized.includes('"deck":'),'deck order exposed');
    for(const seat of state.players.slice(1)){
      assert.ok(!serialized.includes('"id":'+seat.deck[0]+',"name":'),
        'opponent upcoming card identity exposed');
    }
    assert.throws(()=>themeViewFor(state,playerCount),/Invalid authenticated/);
    assert.throws(()=>takeServerThemeTurn(state,1,'rank'),/category-selection turn/);
    assert.throws(()=>takeServerThemeTurn(state,0,'foreign_stat'),/Unsupported category/);
    assert.throws(()=>takeServerThemeTurn(state,0,'rank',{roomThemeId:'pokemon'}),
      /theme mismatch/);
    assert.deepEqual(startServerThemeMatch({themeId,playerCount,picker,chooser:0}),state);
  }
});
test('all expansions preserve original match cards and visibility after a decisive turn',()=>{
  for(const themeId of THEMES.slice(1))for(const playerCount of COUNTS){
    const previous=startServerThemeMatch({themeId,playerCount,picker,chooser:0});
    const next=takeServerThemeTurn(previous,0,'rank');
    assert.equal(next.round,1);
    assert.equal(validateServerThemeMatch(next,themeId),true);
    assert.equal(next.players.reduce((total,p)=>total+p.deck.length,0)+next.pot.length,
      DECK_SIZE_BY_PLAYERS[playerCount]);
    assert.deepEqual(previous.players.map(p=>p.deck.length),
      Array(playerCount).fill(HAND_SIZE_BY_PLAYERS[playerCount]));
    const viewer=themeViewFor(next,0);
    assert.ok(!JSON.stringify(viewer).includes('"awarded"'));
    assert.ok(!JSON.stringify(viewer).includes('"deck"'));
    assert.equal(viewer.last.cards.length,playerCount);
    assert.equal(viewer.last.stat,'rank');
  }
});
test('all expansion 2P themes correctly tie, retain pot, then distribute 4 cards',()=>{
  for(const themeId of THEMES.slice(1)){
    const s=startServerThemeMatch({themeId,playerCount:2,picker,chooser:0});
    let pair=null;
    for(const category of getServerTheme(themeId).categories.slice(1)){
      for(const a of s.players[0].deck){
        const b=s.players[1].deck.find(id=>
          getServerCard(themeId,id).stats[category.key]===
          getServerCard(themeId,a).stats[category.key]);
        if(b!==undefined){pair=[a,b,category.key];break;}
      }
      if(pair)break;
    }
    assert.ok(pair,themeId+' no tie pair');
    for(const [deck,wanted] of [[s.players[0].deck,pair[0]],[s.players[1].deck,pair[1]]]){
      const index=deck.indexOf(wanted);[deck[0],deck[index]]=[deck[index],deck[0]];
    }
    const before=cloneObject(s);
    const tied=takeServerThemeTurn(s,0,pair[2]);
    assert.equal(tied.last.kind,'tie');
    assert.equal(tied.pot.length,2);
    assert.equal(tied.consecutiveTies,1);
    assert.equal(tied.chooser,0);
    const win=takeServerThemeTurn(tied,tied.chooser,'rank');
    assert.equal(win.pot.length,0);
    assert.equal(win.last.awarded.length,4);
    assert.equal(validateServerThemeMatch(win,themeId),true);
    assert.deepEqual(s,before,'original state changed');
  }
});
const cloneObject=o=>structuredClone(o);
test('every expansion rejects duplicate or foreign game cards and theme tampering',()=>{
  for(const id of THEMES.slice(1)){
    const state=startServerThemeMatch({themeId:id,playerCount:4,picker,chooser:0});
    const bad=cloneObject(state);bad.players[1].deck[1]=bad.players[0].deck[0];
    assert.throws(()=>validateServerThemeMatch(bad,id),/conservation/);
    const wrong=cloneObject(state);wrong.themeId='pokemon';
    assert.throws(()=>validateServerThemeMatch(wrong,id),/mismatch/);
    const foreign=cloneObject(state);foreign.players[0].deck[0]=1000;
    assert.throws(()=>validateServerThemeMatch(foreign,id),/Foreign card/);
  }
});
test('bounded theme-play regression: no card duplication, no mutation, safe round views',()=>{
  let random=19230715;
  const pick=n=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random%n;};
  for(const id of THEMES.slice(1))for(const n of COUNTS){
    let state=startServerThemeMatch({themeId:id,playerCount:n,picker:pick});
    for(let i=0;i<180&&state.status==='playing';i++){
      const old=cloneObject(state);
      const key=getServerTheme(id).categories[pick(8)].key;
      state=takeServerThemeTurn(state,state.chooser,key);
      assert.equal(validateServerThemeMatch(state,id),true);
      assert.deepEqual(old.players.flatMap(p=>p.deck).length+old.pot.length,
        DECK_SIZE_BY_PLAYERS[n]);
      const snapshot=themeViewFor(state,(i+2)%n);
      assert.equal(snapshot.round,state.round);
      assert.ok(!JSON.stringify(snapshot).includes('"deck"'));
      assert.ok(!JSON.stringify(snapshot).includes('"players"'));
    }
  }
});
test('unknown theme/count and unauthorized stored theme switches are rejected',()=>{
  assert.throws(()=>startServerThemeMatch({themeId:'any'}),/Unsupported/);
  assert.throws(()=>startServerThemeMatch({themeId:'avengers',playerCount:5}),/Only 2/);
  assert.throws(()=>startServerThemeMatch({themeId:'avengers',playerCount:'2'}),/Only 2/);
  assert.throws(()=>startServerThemeMatch({themeId:'avengers',playerCount:2,chooser:2}),
    /Invalid category chooser/);
  const a=startServerThemeMatch({themeId:'avengers',playerCount:2,picker,chooser:0});
  assert.throws(()=>takeServerThemeTurn(a,0,'rank',{roomThemeId:'ben10'}),/mismatch/);
  assert.throws(()=>themeViewFor(a,0,{roomThemeId:'ben10'}),/mismatch/);
});


test('seven theme 2P double-tie rotates chooser, then rank sudden death preserves all cards',()=>{
  for(const themeId of THEMES.slice(1)){
    const base=startServerThemeMatch({themeId,playerCount:2,picker,chooser:0});
    let pair;
    for(const category of getServerTheme(themeId).categories.slice(1)){
      for(const a of base.players[0].deck){
        const b=base.players[1].deck.find(x=>
          getServerCard(themeId,a).stats[category.key]===
          getServerCard(themeId,x).stats[category.key]);
        if(b!==undefined){pair={a,b,key:category.key};break;}
      }
      if(pair)break;
    }
    assert.ok(pair,themeId+' missing tie fixture');
    const double=structuredClone(base);
    for(const [deck,want] of [[double.players[0].deck,pair.a],
      [double.players[1].deck,pair.b]]){
      const at=deck.indexOf(want);[deck[0],deck[at]]=[deck[at],deck[0]];
      double.pot.push(deck.splice(1,1)[0]);
    }
    double.consecutiveTies=1;
    assert.equal(validateServerThemeMatch(double,themeId),true);
    const tied=takeServerThemeTurn(double,0,pair.key);
    assert.equal(tied.last.kind,'tie',themeId);
    assert.equal(tied.consecutiveTies,2,themeId);
    assert.equal(tied.chooser,1,themeId);
    assert.equal(tied.pot.length,4,themeId);
    assert.equal(validateServerThemeMatch(tied,themeId),true);

    const sudden=structuredClone(base);
    const all=[...base.players[0].deck,...base.players[1].deck];
    sudden.players=[{deck:[pair.a]},{deck:[pair.b]}];
    sudden.pot=all.filter(x=>x!==pair.a&&x!==pair.b);
    assert.equal(sudden.pot.length,48);
    const finish=takeServerThemeTurn(sudden,0,pair.key);
    assert.equal(finish.last.kind,'sudden-death',themeId);
    assert.equal(finish.status,'finished');
    assert.equal(finish.players[finish.winner].deck.length,50);
    assert.equal(finish.pot.length,0);
    const bestRank=getServerCard(themeId,pair.a).stats.rank<
      getServerCard(themeId,pair.b).stats.rank?0:1;
    assert.equal(finish.winner,bestRank);
    assert.equal(validateServerThemeMatch(finish,themeId),true);
    assert.equal(themeViewFor(finish,finish.winner).last.awarded,undefined);
  }
});
test('all expansion 3P/4P multiway sudden-death awards unique rank winner once',()=>{
  for(const themeId of THEMES.slice(1))for(const n of [3,4]){
    const state=startServerThemeMatch({themeId,playerCount:n,picker,chooser:0});
    const cards=getServerManifest(themeId,n);
    let selected,key;
    for(const category of getServerTheme(themeId).categories.slice(1)){
      const groups=new Map();
      for(const id of cards){
        const value=getServerCard(themeId,id).stats[category.key];
        if(!groups.has(value))groups.set(value,[]);
        groups.get(value).push(id);
      }
      for(const value of [...groups.keys()].sort((a,b)=>b-a)){
        const winners=groups.get(value);
        const below=cards.filter(id=>getServerCard(themeId,id).stats[category.key]<value);
        if(winners.length>=2&&below.length>=n-2){
          selected=[winners[0],winners[1],...below.slice(0,n-2)];
          key=category.key;break;
        }
      }
      if(selected)break;
    }
    assert.ok(selected,themeId+'/'+n+' lacks tested multi-tie fixture');
    const used=new Set(selected);
    state.players=selected.map(id=>({deck:[id]}));
    state.pot=cards.filter(id=>!used.has(id));
    assert.equal(validateServerThemeMatch(state,themeId),true);
    const next=takeServerThemeTurn(state,0,key);
    const expected=selected.map((id,seat)=>({
      seat,rank:getServerCard(themeId,id).stats.rank
    })).sort((a,b)=>a.rank-b.rank)[0].seat;
    assert.equal(next.last.kind,'sudden-death',themeId+'/'+n);
    assert.equal(next.winner,expected);
    assert.equal(next.status,'finished');
    assert.equal(next.pot.length,0);
    assert.equal(next.players[expected].deck.length,DECK_SIZE_BY_PLAYERS[n]);
    assert.equal(validateServerThemeMatch(next,themeId),true);
    assert.ok(!JSON.stringify(themeViewFor(next,0)).includes('"deck"'));
  }
});
