import test from 'node:test';
import assert from 'node:assert/strict';
import {THEME_IDS,getTheme,validatePack} from '../themes/packs/index.js';

const card=(theme,name)=>{
 const found=getTheme(theme).cards.find(c=>c.name===name);
 assert.ok(found,'Missing '+theme+' / '+name);
 return found;
};

test('Correct One Piece alliances without changing card inventory or deck sizes',()=>{
 for(const name of ['Bartolomeo','Cavendish']){
  assert.equal(card('onepiece',name).group,'Straw Hat Grand Fleet');
  assert.equal(card('onepiece',name).role,'pirate');
 }
 assert.equal(card('onepiece',"Kin'emon").group,'Wano Allies');
 assert.equal(card('onepiece','Kozuki Oden').group,'Wano Legends');
 assert.ok(card('onepiece','Bartolomeo').stats.devilfruit>=90,'Barrier power should matter');
 assert.ok(card('onepiece','Cavendish').stats.devilfruit<=20,'No invented Devil Fruit mastery');
 assert.ok(card('onepiece','Kozuki Oden').stats.swordsmanship>=95,'Famed swordsman identity');
 const shanks=card('onepiece','Shanks'),mihawk=card('onepiece','Dracule Mihawk'),katakuri=card('onepiece','Charlotte Katakuri');
 assert.ok(shanks.stats.rank<mihawk.stats.rank,'Shanks should not be ranked below Mihawk in these editorial rules');
 assert.ok(mihawk.stats.rank<katakuri.stats.rank,'Mihawk should not be ranked below Katakuri');
});

test('Football goalkeeper cards are recognisable specialists, without changing seven axes',()=>{
 const p=getTheme('football'),lionel=card('football','Lionel Messi');
 assert.equal(p.categories.length,8);
 for(const name of ['Mary Earps','Christiane Endler']){
  const keeper=card('football',name);
  assert.equal(keeper.role,'goalkeeper');
  assert.equal(keeper.group,'Goalkeeper Legends');
  assert.ok(keeper.stats.defending>=95,'Keepers need elite defensive impact');
  assert.ok(keeper.stats.shooting<=25,'Do not give keepers elite outfield finishing');
  assert.ok(keeper.stats.defending>lionel.stats.defending);
 }
 assert.match(p.categories.find(c=>c.key==='defending').meaning,/goalkeeper/i);
});

test('Wizarding specialists offer counters to Dumbledore without stripping his iconic magic',()=>{
 const albus=card('wizarding','Albus Dumbledore');
 const snape=card('wizarding','Severus Snape');
 const harry=card('wizarding','Harry Potter');
 const filch=card('wizarding','Argus Filch');
 assert.equal(albus.stats.magic,100);
 assert.ok(snape.stats.potions>albus.stats.potions,'Potions expert has meaningful counterplay');
 assert.ok(harry.stats.courage>albus.stats.courage,'Bravery offers meaningful counterplay');
 assert.ok(filch.stats.magic<=10,'Squib cannot cast spells');
});

test('All twelve 80-card registries remain valid after editorial corrections',()=>{
 for(const id of THEME_IDS){
  const theme=getTheme(id);
  assert.equal(theme.cards.length,80,id);
  assert.equal(validatePack(theme),true,id);
  for(const n of [2,3,4])assert.equal(new Set(theme.decks[n]).size,n===2?50:n===3?60:80,id+'/'+n);
 }
});
