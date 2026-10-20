import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {startMultiGame,multiTurn,multiViewFor} from '../src/multi-engine.js';
const origin='http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 for(const count of [3,4]){
  let state=startMultiGame({playerCount:count,picker:()=>0,chooser:0});
  let status='lobby';
  const users=Array.from({length:count},(_,i)=>({index:i,name:i?'Bot P'+(i+1):'QA Host',ready:true}));
  const info=()=>({room:{code:'TEST42',mode:'same',playerCount:count,status,revealSettings:{mode:'auto',seconds:2}},players:users,me:users[0],game:status==='playing'?{...multiViewFor(state,0),reveal:state.last?{mode:'auto',seconds:2,until:new Date(Date.now()+1700).toISOString(),acks:[],required:count,active:true}:null,matchNumber:1}:null});
  const ctx=await browser.newContext({viewport:{width:390,height:844}});
  const page=await ctx.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/game?health=1',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({status:'ready',app:'deckverse'})}));
  await page.route('**/api/game',async route=>{
   const b=route.request().postDataJSON();
   if(b.action==='create'){assert.equal(b.playerCount,count);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...info(),token:'a'.repeat(64)})})}
   if(b.action==='start'){status='playing';return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(info())})}
   if(b.action==='select'){assert.equal(b.expectedRound,state.round);state=multiTurn(state,0,b.stat);return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(info())})}
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(info())});
  });
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  await page.locator('#pokemon-tile').click();
  await page.locator('#player-name').fill('QA Host');
  await page.locator('[data-player-count="'+count+'"]').click();
  await page.waitForFunction(()=>!document.querySelector('#create-room').disabled);
  await page.locator('#create-room').click();
  await page.locator('#lobby-players .player-slot').first().waitFor({timeout:7000});
  assert.equal(await page.locator('#lobby-players .player-slot').count(),count);
  await page.locator('#start-match').click();
  await page.locator('#multi-arena .multi-player').first().waitFor({timeout:7000});
  assert.equal(await page.locator('#multi-arena .multi-player').count(),count);
  assert.equal(await page.locator('#multi-arena .card-name').count(),1,'Other future cards must be concealed');
  assert.equal(await page.locator('#multi-arena .card-back').count(),count-1);
  assert.ok(await page.locator('#battle .battle-meta').isHidden());
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  assert.ok(overflow<=2,'Mobile game overflow '+overflow);
  await page.locator('.stat-button:not([disabled])').first().click();
  await page.locator('#result.compact').waitFor({timeout:7000});
  assert.equal(await page.locator('#multi-arena .card-name').count(),count,'Played cards must reveal for all players');
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'/tmp/deckverse-multi-'+count+'.png',fullPage:true});
  console.log('PASS: '+count+'-player mobile setup, lobby, concealed decks, played-card reveal and responsive arena');
  await ctx.close();
 }
}finally{await browser.close()}
