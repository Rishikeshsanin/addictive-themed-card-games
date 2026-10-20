import test from 'node:test';
import assert from 'node:assert/strict';
import {safeMode,safeName} from '../api/game.js';

test('nicknames accept ordinary Unicode but reject markup and invisible controls',()=>{
 assert.equal(safeName('  Player One  '),'Player One');
 assert.equal(safeName('मित्र'),'मित्र');
 for(const name of ['A','x'.repeat(25),'Bad<Name','Line\nBreak','Zero\u200bWidth']){
  assert.throws(()=>safeName(name));
 }
});

test('room mode is explicit rather than silently downgraded',()=>{
 assert.equal(safeMode('same'),'same');
 assert.equal(safeMode('remote'),'remote');
 for(const mode of [undefined,null,'REMOTE','invalid'])assert.throws(()=>safeMode(mode));
});
