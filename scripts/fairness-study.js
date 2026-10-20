// DeckVerse V2: reproducible, read-only game-theory study.
// Usage: node scripts/fairness-study.js --seeds=500 --strategies=best,random,rank --opening=both
// No API, database, rule, catalog, or production writes.
import {DECKS, STAT_FIELDS, card} from '../src/catalog.js';
import {newGame, takeTurn, benchmark} from '../src/engine.js';
import {startMultiGame, multiTurn} from '../src/multi-engine.js';

export const STUDY_VERSION = 1;
export const DEFAULT_SEED = 20261020;
export const METHODS = Object.freeze(['best', 'random', 'rank']);
const FIELD_KEYS = STAT_FIELDS.map(f => f.key);
const MAX_SEEDS = 3000;

export function rng32(seed) {
  let x = (seed >>> 0) || 0x6d2b79f5;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}
export function seedFor(master, size, index) {
  let s = (master ^ Math.imul(size, 0x85ebca6b) ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  s ^= s >>> 16; s = Math.imul(s, 0x7feb352d) >>> 0;
  s ^= s >>> 15; s = Math.imul(s, 0x846ca68b) >>> 0; s ^= s >>> 16;
  return s || 1;
}

export function bestCategories(size) {
  const deck = DECKS[size];
  const map = new Map();
  for (const id of deck) {
    const mine = card(id);
    const scores = STAT_FIELDS.map(rule => deck.reduce((score, other) => {
      if (id === other) return score;
      const theirs = card(other)[rule.key];
      if (mine[rule.key] === theirs) return score + .5;
      return score + ((rule.direction === 'min' ? mine[rule.key] < theirs : mine[rule.key] > theirs) ? 1 : 0);
    }, 0));
    map.set(id, FIELD_KEYS[scores.indexOf(Math.max(...scores))]);
  }
  return map;
}

export function runMatch({size, seed, chooser, method = 'best', opening = 'normal', cap = 3000, strengths} = {}) {
  if (![2, 3, 4].includes(size)) throw new Error('size must be 2, 3 or 4');
  if (!Number.isInteger(chooser) || chooser < 0 || chooser >= size) throw new Error('invalid starting chooser');
  if (!METHODS.includes(method)) throw new Error('unknown strategy');
  if (!['normal', 'blind'].includes(opening)) throw new Error('invalid opening');
  if (!Number.isInteger(cap) || cap < 1) throw new Error('invalid round cap');
  const shuffleRandom = rng32(seed);
  const picker = max => Math.floor(shuffleRandom() * max);
  const strategyRandom = rng32((seed ^ 0xa8f3d171) >>> 0);
  const openingRandom = rng32((seed ^ 0x27d4eb2f) >>> 0);
  const firstCategory = FIELD_KEYS[Math.floor(openingRandom() * FIELD_KEYS.length)];
  let game = size === 2
    ? newGame({ids: DECKS[2], picker, chooser})
    : startMultiGame({playerCount: size, picker, chooser});
  const optimal = strengths || (method === 'best' ? bestCategories(size) : null);
  let ties = 0, maxPot = 0, maxAward = 0, outcome = 'round-cap', rounds = 0;
  const categories = Object.fromEntries(FIELD_KEYS.map(key => [key, 0]));
  const seen = new Set();
  while (game.status === 'playing' && rounds < cap) {
    // Include complete deck orders and full tie count to avoid false cycle reports.
    const stateKey = game.players.map(p => p.deck.join(',')).join('|') + '#' +
      game.pot.join(',') + '#' + game.chooser + '#' + game.consecutiveTies;
    if (seen.has(stateKey)) { outcome = 'cycle'; break; }
    seen.add(stateKey);
    const currentCard = game.players[game.chooser].deck[0];
    let category = method === 'best' ? optimal.get(currentCard)
      : method === 'rank' ? 'rank'
      : FIELD_KEYS[Math.floor(strategyRandom() * FIELD_KEYS.length)];
    if (opening === 'blind' && rounds === 0) category = firstCategory;
    categories[category]++;
    game = size === 2
      ? takeTurn(game, game.chooser, category)
      : multiTurn(game, game.chooser, category);
    rounds++;
    if (game.last.kind === 'tie') ties++;
    maxPot = Math.max(maxPot, game.pot.length);
    maxAward = Math.max(maxAward, size === 2 ? game.last.awarded.length : game.last.awardedCount);
  }
  if (game.status === 'finished') outcome = 'finished';
  return {size, seed, chooser, method, opening, outcome, winner:game.winner, rounds,
    ties, maxPot, maxAward, categories, firstWin:game.status === 'finished' && game.winner === chooser};
}

export function confidence95(blocks) {
  if (!blocks.length) return {mean:null, low:null, high:null, clusters:0};
  const mean = blocks.reduce((a,b) => a + b, 0) / blocks.length;
  if (blocks.length < 2) return {mean, low:null, high:null, clusters:blocks.length};
  const variance = blocks.reduce((a,b) => a + (b - mean) ** 2, 0) / (blocks.length - 1);
  const half = 1.96 * Math.sqrt(variance / blocks.length);
  return {mean, low:mean - half, high:mean + half, clusters:blocks.length};
}
const quantile = (sorted, p) => sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null;
const mean = a => a.length ? a.reduce((x,y) => x+y, 0) / a.length : null;

export function deckAudit(size) {
  const ids = DECKS[size], score = benchmark(ids);
  const category = {};
  for (const field of STAT_FIELDS) {
    let equal = 0, comparisons = 0;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      comparisons++;
      if (card(ids[i])[field.key] === card(ids[j])[field.key]) equal++;
    }
    category[field.key] = {pairs:comparisons, ties:equal, tieRate:equal/comparisons};
  }
  const rated = [...score.score].sort((a,b) => a.rate-b.rate);
  return {size, cards:ids.length, pairComparisons:score.pairs, totalStatComparisons:score.comparisons,
    completeDominance:score.completeDominance, sevenOfEightDominance:score.dominance,
    weakest:rated.slice(0,3), strongest:rated.slice(-3).reverse(), category};
}

export function study({seeds=500, seed=DEFAULT_SEED, cap=3000, methods=METHODS, opening='both'}={}) {
  if (!Number.isInteger(seeds) || seeds < 2 || seeds > MAX_SEEDS) throw new Error('invalid number of seed blocks');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('invalid master seed');
  if (!Number.isInteger(cap) || cap < 1 || cap > 20000) throw new Error('invalid cap');
  if (!Array.isArray(methods) || !methods.length || methods.some(x => !METHODS.includes(x))) throw new Error('invalid strategies');
  if (!['normal','blind','both'].includes(opening)) throw new Error('invalid opening selection');
  const scenarios = [], audits=[2,3,4].map(deckAudit);
  for (const size of [2,3,4]) for (const method of methods) {
    const optimal = method === 'best' ? bestCategories(size) : null;
    const openModes = opening === 'both' ? ['normal','blind'] : [opening];
    const completed = Object.fromEntries(openModes.map(x => [x, []]));
    const perBlock = Object.fromEntries(openModes.map(x => [x, []]));
    const stalled = Object.fromEntries(openModes.map(x => [x, {cycle:0, 'round-cap':0}]));
    const pairedDifferences = [];
    for (let i=0; i<seeds; i++) {
      const shuffleSeed = seedFor(seed,size,i);
      const local = Object.fromEntries(openModes.map(x => [x, []]));
      for (let chooser=0; chooser<size; chooser++) for (const mode of openModes) {
        const result = runMatch({size, seed:shuffleSeed, chooser, method, opening:mode, cap, strengths:optimal});
        if (result.outcome === 'finished') {completed[mode].push(result);local[mode].push(result);}
        else stalled[mode][result.outcome]++;
      }
      for (const mode of openModes) if (local[mode].length === size) {
        perBlock[mode].push(local[mode].filter(x=>x.firstWin).length/size);
      }
      if (openModes.length === 2 && local.normal.length === size && local.blind.length === size)
        pairedDifferences.push((local.blind.filter(x=>x.firstWin).length -
          local.normal.filter(x=>x.firstWin).length) / size);
    }
    const outputModes = {};
    for (const mode of openModes) {
      const games=completed[mode], rs=games.map(x=>x.rounds).sort((a,b)=>a-b);
      const wins=Array(size).fill(0);
      const cat=Object.fromEntries(FIELD_KEYS.map(k=>[k,0]));
      let turns=0, tieRounds=0;
      for (const g of games) {wins[g.winner]++;turns+=g.rounds;tieRounds+=g.ties;
        for(const key of FIELD_KEYS)cat[key]+=g.categories[key];}
      outputModes[mode]={attempted:seeds*size, finished:games.length, stalls:stalled[mode],
        pairedSeedBlocks:perBlock[mode].length,
        firstChooserWins:games.filter(x=>x.firstWin).length,
        firstChooserRate:mean(perBlock[mode]), firstChooserCI95:confidence95(perBlock[mode]),
        neutralRate:1/size, winningSeats:wins, medianRounds:quantile(rs,.5),
        p90Rounds:quantile(rs,.9), p99Rounds:quantile(rs,.99), maxRounds:rs.at(-1)??null,
        tieRounds, tiePerRound:turns?tieRounds/turns:null, meanMaxPot:mean(games.map(x=>x.maxPot)),
        maxPotObserved:Math.max(0,...games.map(x=>x.maxPot)),
        maxAwardObserved:Math.max(0,...games.map(x=>x.maxAward)),
        categoryCalls:cat};
    }
    scenarios.push({size, method, results:outputModes,
      blindMinusNormalPairedCI95:pairedDifferences.length ? confidence95(pairedDifferences) : null});
  }
  return {studyVersion:STUDY_VERSION, seedBlocks:seeds, masterSeed:seed, cap,
    strategyDefinitions:{
      best:'Original oracle-like strategy: highest global pairwise category win-score for own top card',
      random:'Uniform random category on every selectable turn',
      rank:'Always calls Rank (lower value wins; globally unique ranks in this catalog)',
      blind:'Opening category chosen uniformly from a separate fixed RNG stream before any strategic calls'
    },
    methodology:'Same shuffled deck and strategy RNG seed reused for every starting chooser seat; each seed is a cluster. Only fully finished matched seed clusters enter first-win confidence intervals. 95% normal-approximation clustered intervals; independent shuffled seeds, not independent seat rotations. No production rule modifications.',
    deckAudits:audits, scenarios};
}
function parseArgs(args) {
  const options={};
  for (const token of args) {
    if (!token.startsWith('--') || !token.includes('=')) throw new Error('Expected --key=value: ' + token);
    const [key,raw] = token.slice(2).split('=');
    if (key === 'seeds' || key === 'seed' || key === 'cap') options[key]=Number(raw);
    else if (key === 'strategies') options.methods=raw.split(',');
    else if (key === 'opening') options.opening=raw;
    else throw new Error('Unknown argument: '+key);
  }
  return options;
}
if (process.argv[1] && import.meta.url === new URL('file://' + process.argv[1]).href) {
  try { console.log(JSON.stringify(study(parseArgs(process.argv.slice(2))), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode=1; }
}
