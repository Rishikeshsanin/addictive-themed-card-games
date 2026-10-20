import test from 'node:test';
import assert from 'node:assert/strict';
import {DECKS, STAT_FIELDS} from '../src/catalog.js';
import {bestCategories, confidence95, deckAudit, rng32, runMatch, seedFor, study} from '../scripts/fairness-study.js';

test('seeded PRNG and match results are reproducible, without hidden global RNG', () => {
  const s=seedFor(20261020,2,5);
  assert.equal(s,seedFor(20261020,2,5));
  assert.notEqual(s,seedFor(20261020,3,5));
  const a=rng32(s),b=rng32(s);
  assert.deepEqual(Array.from({length:12},()=>a()),Array.from({length:12},()=>b()));
  const args={size:2,seed:s,chooser:0,method:'best',cap:3000};
  assert.deepEqual(runMatch(args),runMatch(args));
});

test('best-category selection covers each curated deck with valid category labels', () => {
  for(const n of [2,3,4]){
    const map=bestCategories(n);
    assert.equal(map.size,DECKS[n].length);
    assert.ok([...map.values()].every(k=>STAT_FIELDS.some(f=>f.key===k)));
    const audit=deckAudit(n);
    assert.equal(audit.cards,20*n+(n===2?10:0));
    assert.equal(audit.pairComparisons,DECKS[n].length*(DECKS[n].length-1)/2);
    assert.ok(Object.values(audit.category).every(x=>x.tieRate>=0&&x.tieRate<=1));
    assert.equal(audit.category.rank.ties,0,'Rank values are unique in each active deck');
  }
});

test('confidence intervals cluster by seed, including zero variance',()=>{
  assert.deepEqual(confidence95([]),{mean:null,low:null,high:null,clusters:0});
  assert.deepEqual(confidence95([.5,.5,.5]),{mean:.5,low:.5,high:.5,clusters:3});
  const c=confidence95([0,1,0,1]);
  assert.equal(c.mean,.5);
  assert.ok(c.low < .5 && c.high > .5);
});

test('all three player counts permit normal and blind openings without rule mutations',()=>{
  for(const n of [2,3,4]){
    for(let chooser=0;chooser<n;chooser++){
      const seed=seedFor(20261020,n,chooser);
      for(const opening of ['normal','blind']){
        const result=runMatch({size:n,seed,chooser,method:'best',opening,cap:3000});
        assert.ok(['finished','cycle','round-cap'].includes(result.outcome));
        assert.equal(result.size,n);
        assert.ok(result.rounds<=3000);
        assert.equal(Object.values(result.categories).reduce((a,b)=>a+b,0),result.rounds);
        assert.ok(result.maxPot>=0&&result.maxPot<=DECKS[n].length);
        assert.ok(result.maxAward>=0&&result.maxAward<=DECKS[n].length);
        if(result.outcome==='finished')assert.ok(Number.isInteger(result.winner));
      }
    }
  }
});

test('paired seat-rotation simulation is fully reproducible and statistically accountable',()=>{
  const args={seeds:5,seed:123456,methods:['best','rank'],opening:'both',cap:3000};
  const a=study(args),b=study(args);
  assert.deepEqual(a,b);
  assert.equal(a.scenarios.length,6);
  for(const scenario of a.scenarios){
    const expected=5*scenario.size;
    for(const run of Object.values(scenario.results)){
      assert.equal(run.attempted,expected);
      assert.equal(run.finished+run.stalls.cycle+run.stalls['round-cap'],expected);
      assert.equal(run.winningSeats.reduce((x,y)=>x+y,0),run.finished);
      assert.ok(run.pairedSeedBlocks<=5);
      assert.equal(run.firstChooserCI95.clusters,run.pairedSeedBlocks);
    }
  }
});

test('reject invalid experimental parameters',()=>{
  assert.throws(()=>runMatch({size:5,seed:5,chooser:0}),/size/);
  assert.throws(()=>runMatch({size:2,seed:5,chooser:0,method:'unknown'}),/strategy/);
  assert.throws(()=>runMatch({size:2,seed:5,chooser:3}),/chooser/);
  assert.throws(()=>study({seeds:1}),/seed blocks/);
  assert.throws(()=>study({seeds:4,opening:'invalid'}),/opening/);
});
