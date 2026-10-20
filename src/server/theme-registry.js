// DeckVerse SERVER-ONLY authoritative registry. Never import this module in browser UI.
// Explicit allowlist: prototype property lookup or arbitrary module filenames cannot select a theme.
import {CATALOG, DECKS, STAT_FIELDS} from '../catalog.js';
import {THEME_PACKS} from '../../themes/packs/index.js';

export const ALLOWED_THEME_IDS = Object.freeze([
  'pokemon','avengers','ben10','shinchan','dc','naruto','cricket','fantasy'
]);
export const DECK_SIZE_BY_PLAYERS = Object.freeze({2:50,3:60,4:80});
export const HAND_SIZE_BY_PLAYERS = Object.freeze({2:25,3:20,4:20});
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const check=(condition,message)=>{if(!condition)throw new Error(message)};
const numeric=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const validKey=x=>typeof x==='string'&&/^[a-z][a-z0-9_]{1,31}$/.test(x);
const isId=x=>Number.isSafeInteger(x)&&x>0;

// Only server-defined IDs may cross the trust boundary; undefined is the
// backward-compatible Pokémon default on CREATE. Null/whitespace/objects are invalid.
export function requireThemeId(id,{allowMissing=false}={}){
  if(id===undefined&&allowMissing)return 'pokemon';
  if(typeof id!=='string'||!ALLOWED_THEME_IDS.includes(id))
    throw new Error('Unsupported theme ID');
  return id;
}
export function themeIdForRoom(room){
  check(room&&typeof room==='object'&&!Array.isArray(room),'Invalid room');
  // Legacy V1/V2 rows had no theme column. Migration 007 defaults them to Pokémon.
  return requireThemeId(room.theme_id===undefined||room.theme_id===null
    ?'pokemon':room.theme_id);
}
export function requireSameRoomTheme(room,proposed){
  const persisted=themeIdForRoom(room);
  if(proposed!==undefined&&requireThemeId(proposed)!==persisted)
    throw new Error('A room theme cannot change after creation or during rematch');
  return persisted;
}
const UNTRUSTED_GAME_FIELDS=Object.freeze([
  'cards','deck','decks','deckOrder','manifest','manifests','categories','stats',
  'scores','rank','seed','picker','shuffle','chooser','cardValues','theme_id'
]);
export function requireCreateTheme(request){
  check(request&&typeof request==='object'&&!Array.isArray(request),
    'Invalid create request');
  for(const key of UNTRUSTED_GAME_FIELDS)
    check(!own(request,key),'Client-controlled card or scoring data is forbidden');
  return requireThemeId(request.themeId,{allowMissing:true});
}
// Validate an entire theme definition BEFORE making it available. The input
// shape is {id,name,categories:[{key,name,direction}],cards:[{id,name,stats}],
// manifests:{2:[id...],3:[...],4:[...]}}. All keys are server-owned.
export function validateThemeDefinition(definition){
  check(definition&&typeof definition==='object'&&!Array.isArray(definition),'Invalid theme');
  const {id,name,categories,cards,manifests}=definition;
  check(validKey(id)&&typeof name==='string'&&name.trim().length>0,'Invalid theme metadata');
  check(Array.isArray(categories)&&categories.length===8,'Exactly eight categories required');
  const keys=new Set();
  for(let i=0;i<categories.length;i++){
    const c=categories[i];
    check(c&&validKey(c.key)&&!keys.has(c.key)&&typeof c.name==='string'&&c.name.length>0,
      'Invalid or repeated category');
    check(c.direction===(i===0?'min':'max')&&(i!==0||c.key==='rank')&&
      (i===0||c.key!=='rank'),'Rank must be lower-wins and all other categories higher-wins');
    keys.add(c.key);
  }
  check(Array.isArray(cards)&&cards.length>=80,'At least 80 unique theme cards required');
  const ids=new Set(),names=new Set(),ranks=new Set();
  for(const c of cards){
    check(c&&isId(c.id)&&typeof c.name==='string'&&c.name.trim().length>0,
      'Invalid card identity');
    check(!ids.has(c.id)&&!names.has(c.name),'Duplicate card ID or name');
    ids.add(c.id);names.add(c.name);
    check(c.stats&&typeof c.stats==='object'&&!Array.isArray(c.stats)&&
      Object.keys(c.stats).length===keys.size,'Malformed card stats');
    for(const key of keys)
      check(own(c.stats,key)&&numeric(c.stats[key]),'Missing or invalid card score');
    check(Number.isSafeInteger(c.stats.rank)&&c.stats.rank>0&&!ranks.has(c.stats.rank),
      'Duplicate or invalid rank; sudden-death must be decisive');
    ranks.add(c.stats.rank);
  }
  check(manifests&&typeof manifests==='object'&&!Array.isArray(manifests),
    'Invalid deck manifests');
  for(const [n,size] of Object.entries(DECK_SIZE_BY_PLAYERS)){
    const deck=manifests[n];
    check(Array.isArray(deck)&&deck.length===size,'Incorrect deck manifest length');
    const seen=new Set();
    for(const cardId of deck){
      check(isId(cardId)&&ids.has(cardId)&&!seen.has(cardId),
        'Duplicate or unknown card in manifest');
      seen.add(cardId);
    }
  }
  return true;
}
const normalize=(raw)=>{
  validateThemeDefinition(raw);
  const categories=Object.freeze(raw.categories.map(x=>Object.freeze({
    key:x.key,name:x.name,direction:x.direction,unit:x.unit??''
  })));
  const cards=Object.freeze(raw.cards.map(x=>Object.freeze({
    id:x.id,name:x.name,
    stats:Object.freeze(Object.fromEntries(categories.map(({key})=>[key,x.stats[key]])))
  })));
  const cardById=new Map(cards.map(c=>[c.id,c]));
  const manifests=Object.freeze(Object.fromEntries(
    Object.keys(DECK_SIZE_BY_PLAYERS).map(n=>[n,Object.freeze([...raw.manifests[n]])])
  ));
  const metadata=Object.freeze({id:raw.id,name:raw.name,cardCount:cards.length,
    categories,playerCounts:Object.freeze([2,3,4])});
  return {metadata,cardById,manifests};
};
const pokemon={
  id:'pokemon',name:'Pokémon',
  categories:STAT_FIELDS,
  cards:CATALOG.filter(c=>DECKS[4].includes(c.id)).map(c=>({id:c.id,name:c.name,
    stats:Object.fromEntries(STAT_FIELDS.map(({key})=>[key,c[key]]))})),
  manifests:DECKS
};
const expansions=ALLOWED_THEME_IDS.slice(1);
check(Object.keys(THEME_PACKS).length===expansions.length&&
  expansions.every(id=>own(THEME_PACKS,id)),'Theme Lab pack inventory differs from explicit server allowlist');
const registry=new Map([['pokemon',normalize(pokemon)]]);
for(const id of expansions){
  const source=THEME_PACKS[id];
  check(source?.id===id,'Unrecognized theme pack');
  registry.set(id,normalize({id,name:source.name,categories:source.categories,
    cards:source.cards,manifests:source.decks}));
}
export function listServerThemes(){
  return Object.freeze(ALLOWED_THEME_IDS.map(id=>registry.get(id).metadata));
}
export function getServerTheme(themeId){
  const id=requireThemeId(themeId);
  return registry.get(id).metadata;
}
export function getServerManifest(themeId,playerCount){
  const id=requireThemeId(themeId);
  check(own(DECK_SIZE_BY_PLAYERS,playerCount)&&Number.isInteger(playerCount),
    'Only 2, 3, or 4-player manifests are allowed');
  return registry.get(id).manifests[playerCount]; // frozen, pre-validated
}
export function getServerCard(themeId,cardId){
  const id=requireThemeId(themeId);
  check(isId(cardId),'Invalid card ID');
  const card=registry.get(id).cardById.get(cardId);
  check(card,'Unknown theme card');
  return card; // frozen, server-side; only reveal the requesting player's top card
}
export function serverCompare(themeId,leftId,rightId,categoryKey){
  const theme=getServerTheme(themeId);
  const category=theme.categories.find(c=>c.key===categoryKey);
  check(category,'Unsupported category for room theme');
  const left=getServerCard(themeId,leftId).stats[categoryKey];
  const right=getServerCard(themeId,rightId).stats[categoryKey];
  return left===right?-1:category.direction==='min'?(left<right?0:1):(left>right?0:1);
}
