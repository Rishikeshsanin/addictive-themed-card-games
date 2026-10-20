// Round 5 Agent B — independent API/authoritative-state security contracts.
// Runs in npm test with NO database, secrets, network, LiveKit or production access.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateGameRequestBody,resolveThemeStoragePlan,roomTheme
} from '../api/game.js';
import {
  startServerThemeMatch,takeServerThemeTurn,themeViewFor,validateServerThemeMatch
} from '../src/server/theme-match.js';
import {ALLOWED_THEME_IDS,getServerTheme,getServerManifest} from '../src/server/theme-registry.js';
import {newGame,viewFor,takeTurn} from '../src/engine.js';
import {startMultiGame,multiViewFor,multiTurn} from '../src/multi-engine.js';
import {DECKS} from '../src/catalog.js';

const picked=()=>0;
const expectedStatuses={legacy:{column_ready:false,column_check_ready:false,trigger_ready:false},
 ready:{column_ready:true,column_check_ready:true,trigger_ready:true}};
const throwsStatus=(fn,status)=>assert.throws(fn,e=>e.status===status);

test('API validates actions, size, cyclic JSON, forged server-state fields',()=>{
 const allowed=['create','join','get','ready','start','rematch','select','settings','ack','leave','heartbeat'];
 for(const action of allowed)assert.equal(validateGameRequestBody({action}).action,action);
 assert.equal(validateGameRequestBody({action:'join',name:'Guest',code:'ABCDEF',mode:'same',playerCount:4}).playerCount,4,
   'legacy browser sends harmless mode and count on JOIN');
 assert.equal(validateGameRequestBody({action:'select',stat:'rank',expectedRound:4}).stat,'rank');
 for(const bad of [null,[],false,'hi',{}, {action:'invalid'},{action:'create',name:'x'.repeat(6100)}])
  throwsStatus(()=>validateGameRequestBody(bad),400);
 const cyclic={action:'join'};cyclic.self=cyclic;
 throwsStatus(()=>validateGameRequestBody(cyclic),400);
 for(const field of ['theme_id','deck','decks','cards','card','cardId','manifest','stats','scores',
   'rank','seed','picker','chooser','players','game','state','pot','winner','status',
   'last','revealedCards','nextCards']){
  for(const action of ['create','join','start','select','get','rematch']){
   throwsStatus(()=>validateGameRequestBody({action,[field]:{malicious:true}}),400);
  }
 }
});

test('migration 007 storage gate is explicit, compatible and fail-closed',()=>{
 for(const themeId of ALLOWED_THEME_IDS){
   assert.equal(resolveThemeStoragePlan(expectedStatuses.ready,themeId),'theme-column');
   if(themeId==='pokemon')assert.equal(resolveThemeStoragePlan(expectedStatuses.legacy,themeId),'legacy-pokemon');
   else throwsStatus(()=>resolveThemeStoragePlan(expectedStatuses.legacy,themeId),503);
   for(const partial of [
     {column_ready:true,column_check_ready:false,trigger_ready:false},
     {column_ready:true,column_check_ready:true,trigger_ready:false},
     {column_ready:true,column_check_ready:false,trigger_ready:true},
     {column_ready:false,column_check_ready:true,trigger_ready:false},
     {column_ready:false,column_check_ready:false,trigger_ready:true},
   ])throwsStatus(()=>resolveThemeStoragePlan(partial,themeId),503);
 }
 throwsStatus(()=>resolveThemeStoragePlan({},'pokemon'),503);
 throwsStatus(()=>resolveThemeStoragePlan(null,'pokemon'),503);
});

test('persisted room theme is mandatory and legacy Pokémon requests remain compatible',()=>{
 for(const themeId of ALLOWED_THEME_IDS){
  const room={theme_id:themeId};
  assert.equal(roomTheme(room),themeId);
  assert.equal(roomTheme(room,themeId),themeId);
  throwsStatus(()=>roomTheme(room,themeId==='pokemon'?'naruto':'pokemon'),409);
 }
 assert.equal(roomTheme({}),'pokemon');
 assert.equal(roomTheme({theme_id:null},'pokemon'),'pokemon');
 throwsStatus(()=>roomTheme({theme_id:'__proto__'}),503);
 throwsStatus(()=>roomTheme({theme_id:'Avengers'}),503);
 throwsStatus(()=>roomTheme({theme_id:'naruto'},null),409);
});

test('every 2/3/4 player theme is server-created from fixed manifests only',()=>{
 for(const themeId of ALLOWED_THEME_IDS)for(const n of [2,3,4]){
  const state=startServerThemeMatch({themeId,playerCount:n,picker:picked,chooser:0});
  const manifest=getServerManifest(themeId,n);
  assert.equal(validateServerThemeMatch(state,themeId),true);
  assert.deepEqual([...state.players.flatMap(p=>p.deck)].sort((a,b)=>a-b),
    [...manifest].sort((a,b)=>a-b));
  const view=themeViewFor(state,0,{roomThemeId:themeId});
  assert.equal(view.topCard.id,state.players[0].deck[0]);
  assert.equal(view.counts.reduce((a,b)=>a+b,0),manifest.length);
  assert.doesNotMatch(JSON.stringify(view),/"players"|"deck"|"deckOrder"|"token_hash"/);
  for(const other of state.players.slice(1))assert.notEqual(view.topCard.id,other.deck[0]);
  throwsStatus(()=>roomTheme({theme_id:themeId},themeId==='pokemon'?'naruto':'pokemon'),409);
  assert.throws(()=>takeServerThemeTurn(state,0,'arbitrary-stat',{roomThemeId:themeId}));
  assert.throws(()=>themeViewFor(state,n,{roomThemeId:themeId}));
  assert.throws(()=>takeServerThemeTurn(state,0,'rank',{roomThemeId:
     themeId==='pokemon'?'fantasy':'pokemon'}));
 }
});

test('Pokémon canonical engine and JSON outputs remain exact for all player counts',()=>{
 for(const n of [2,3,4]){
  const state=startServerThemeMatch({themeId:'pokemon',playerCount:n,picker:picked,chooser:0});
  const legacy=n===2?newGame({ids:DECKS[n],picker:picked,chooser:0}):
    startMultiGame({playerCount:n,ids:DECKS[n],picker:picked,chooser:0});
  assert.deepEqual(state,legacy);
  assert.deepEqual(themeViewFor(state,0,{roomThemeId:'pokemon'}),
    n===2?viewFor(legacy,0):multiViewFor(legacy,0));
  assert.deepEqual(takeServerThemeTurn(state,0,'rank',{roomThemeId:'pokemon'}),
    n===2?takeTurn(legacy,0,'rank'):multiTurn(legacy,0,'rank'));
 }
});

test('expansion viewers receive explicit public round records only, never opaque hidden state',()=>{
 for(const themeId of ALLOWED_THEME_IDS.slice(1))for(const n of [2,3,4]){
  const state=startServerThemeMatch({themeId,playerCount:n,picker:picked,chooser:0});
  const next=takeServerThemeTurn(state,0,'rank',{roomThemeId:themeId});
  assert.equal(validateServerThemeMatch(next,themeId),true);
  // Simulate an internal persistence-field addition. Never spread this object.
  next.last.internalDeckOrder=['SECRET','BURIED'];
  next.last.tokens=['private'];
  next.last.awarded=[1,2,3];
  next.last.debugSql='private-token';
  const view=themeViewFor(next,n-1,{roomThemeId:themeId});
  const json=JSON.stringify(view);
  for(const forbidden of ['internalDeckOrder','tokens','debugSql','"awarded"','"players"','"deck"'])
   assert.ok(!json.includes(forbidden),themeId+' leaked '+forbidden);
  assert.equal(view.last.cards.length,n);
  assert.equal(view.last.stat,'rank');
  assert.equal(view.last.round,1);
  assert.equal(view.last.values.length,n);
  assert.equal(view.last.counts.length,n);
  assert.equal(view.topCard?.id,next.players[n-1].deck[0]);
  assert.notEqual(view.topCard?.id,next.players[0].deck[0]);
  assert.equal(next.last.debugSql,'private-token','view may not mutate server state');
 }
});

test('concurrent-style stale round/actor and forged manifest cannot advance authoritative state',()=>{
 for(const themeId of ALLOWED_THEME_IDS.slice(1))for(const n of [2,3,4]){
  const old=startServerThemeMatch({themeId,playerCount:n,picker:picked,chooser:0});
  const next=takeServerThemeTurn(old,0,'rank',{roomThemeId:themeId});
  assert.equal(old.round,0);
  assert.equal(next.round,1);
  assert.throws(()=>takeServerThemeTurn(old,1,'rank',{roomThemeId:themeId}),/category-selection turn/);
  const bad=structuredClone(next);
  bad.players[0].deck[0]=1000000;
  assert.throws(()=>validateServerThemeMatch(bad,themeId),/Foreign card|conservation/);
  const switched=structuredClone(next);
  switched.themeId=themeId==='fantasy'?'naruto':'fantasy';
  assert.throws(()=>themeViewFor(switched,0,{roomThemeId:themeId}),/mismatch/);
  assert.ok(getServerTheme(themeId).categories.some(x=>x.key==='rank'));
 }
});
