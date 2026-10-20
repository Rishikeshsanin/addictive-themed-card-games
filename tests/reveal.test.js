import test from 'node:test';
import assert from 'node:assert/strict';
import {revealState,revealDeadline,mayAdvance,validateRevealSettings} from '../src/reveal.js';
test('default 2-second reveal blocks early selections',()=>{
 const now=Date.parse('2026-10-20T08:00:00.000Z');
 const until=revealDeadline({mode:'auto',seconds:2},now);
 assert.equal(until,'2026-10-20T08:00:02.000Z');
 assert.equal(revealState({mode:'auto',seconds:2,until,acks:[]},now+1000).active,true);
 assert.equal(mayAdvance({mode:'auto',seconds:2,until},now+1999),false);
 assert.equal(mayAdvance({mode:'auto',seconds:2,until},now+2000),true);
});
test('host can select 3, 5 or 8 second auto intervals',()=>{
 for(const seconds of [2,3,5,8]){
  const until=revealDeadline({mode:'auto',seconds},0);
  assert.equal(Date.parse(until),seconds*1000);
 }
 assert.throws(()=>validateRevealSettings('auto',4));
 assert.throws(()=>validateRevealSettings('unlimited',2));
});
test('manual reveal needs TWO acknowledgements or a 90s fallback',()=>{
 const until=revealDeadline({mode:'manual',seconds:2},0);
 const base={mode:'manual',seconds:2,until};
 assert.equal(Date.parse(until),90000);
 assert.equal(revealState({...base,acks:[]},10000).active,true);
 assert.equal(revealState({...base,acks:[0]},10000).active,true);
 assert.equal(revealState({...base,acks:[0,0]},10000).active,true);
 assert.equal(revealState({...base,acks:[0,1]},10000).active,false);
 assert.equal(revealState({...base,acks:[]},90000).active,false);
});

for(const n of [3,4]){
 test(n+'-player manual reveal requires unanimous confirmation',()=>{
  const r={mode:'manual',seconds:2,required:n,until:new Date(90000).toISOString()};
  const all=Array.from({length:n},(_,i)=>i);
  assert.equal(revealState({...r,acks:all.slice(0,-1)},1000).active,true);
  assert.equal(revealState({...r,acks:all},1000).active,false);
  assert.equal(revealState({...r,acks:[...all.slice(0,-1),999]},1000).active,true);
  assert.equal(revealState({...r,acks:[]},90000).active,false);
 });
}
