// VNext browser smoke: actual controls, two gameplay modes, reset and rematch.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
try {
 for(const width of [390,1366]){
  const context=await browser.newContext({viewport:{width,height:width===390?844:900},reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4173/themes/packs/?qa-first=0',{waitUntil:'domcontentloaded'});
  await page.locator('#ruleset').waitFor();
  assert.equal(await page.locator('#ruleset').inputValue(),'classic','Classic remains the default');
  assert.equal(await page.locator('#difficulty').inputValue(),'expert','Original expert bot remains default');
  assert.equal(await page.locator('#pace').inputValue(),'standard');
  await page.locator('#ruleset').selectOption('quick');
  assert.match(await page.locator('#rule-explainer').textContent(),/35 rounds/);
  await page.locator('#difficulty').selectOption('normal');
  await page.locator('#pace').selectOption('quick');
  await page.locator('#players').selectOption('4');
  assert.match(await page.locator('#rule-explainer').textContent(),/48 rounds/);
  await page.locator('#start').click();
  await page.locator('#game:not(.hidden)').waitFor();
  assert.match(await page.locator('#round-indicator').textContent(),/48 QUICK CLASH/);
  assert.equal(await page.locator('.battle-slot').count(),4);
  assert.equal(await page.locator('.hidden-card').count(),3);
  assert.equal(await page.locator('.stat-button:not([disabled])').count(),8);
  assert.equal((await page.locator('.score b').allTextContents()).map(Number).reduce((a,b)=>a+b,0),80);
  await page.locator('.stat-button:not([disabled])').first().click();
  await page.locator('#reveal:not(.hidden)').waitFor();
  assert.ok(await page.locator('.haul-chip').isVisible(),'Every round visibly reports gained or jackpot cards');
  assert.match(await page.locator('.haul-chip').textContent(),/CARDS (CLAIMED|IN JACKPOT)/);
  assert.match(await page.locator('.round-insight').textContent(),/NEXT|MATCH FINISHED/,'Reveal identifies the next caller or finished result');
  assert.match(await page.locator('.round-insight').textContent(),/WINNING MARGIN|TOP VALUES TIED|LAST CARDS SETTLED|LAST REMAINING PLAYER|DECISIVE ROUND/,'Reveal explains why the category result was decisive');
  assert.equal(await page.locator('.stat-button:not([disabled])').count(),0,'Cannot issue duplicate moves during reveal');
  await page.locator('#end').click();
  assert.ok(await page.locator('#game').isHidden(),'Exit cancels and hides match');
  await page.locator('#ruleset').selectOption('classic');
  await page.locator('#difficulty').selectOption('expert');
  await page.locator('#players').selectOption('2');
  await page.locator('#start').click();
  assert.match(await page.locator('#round-indicator').textContent(),/CLASSIC/);
  await page.locator('#start').click();
  assert.match(await page.locator('#round-indicator').textContent(),/ROUND 01/,'New match resets round count');
  assert.equal((await page.locator('.score b').allTextContents()).map(Number).reduce((a,b)=>a+b,0),50);
  await page.locator('#end').click();
  assert.ok(await page.locator('#game').isHidden());
  assert.ok(await page.locator('#match-result').isHidden());
  const overflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));
  assert.ok(overflow<=2,'No horizontal overflow: '+overflow);
  assert.deepEqual(errors,[],'No JS page errors');
  console.log('VNEXT_BROWSER_PASS '+width+'px: Classic default, Quick Clash, skill selector, round status, turn lock, restart, exit and overflow');
  await context.close();
 }

 // Full browser-played Quick Clash regressions: previous checks only exercised the opening round.
 // Speed up app-owned reveal/bot delays in this isolated QA page; production code is unchanged.
 {
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
   const original=window.setTimeout.bind(window);
   window.setTimeout=(callback,delay,...args)=>original(callback,Math.min(Number(delay)||0,4),...args);
  });
  await page.goto('http://127.0.0.1:4173/themes/packs/?qa-first=0',{waitUntil:'domcontentloaded'});
  for(const {theme,players,skill} of [
   {theme:'avengers',players:2,skill:'expert'},
   {theme:'shinchan',players:3,skill:'normal'},
   {theme:'football',players:4,skill:'easy'}
  ]){
   await page.locator('.theme-tile[data-theme="'+theme+'"]').click();
   await page.locator('#ruleset').selectOption('quick');
   await page.locator('#difficulty').selectOption(skill);
   await page.locator('#players').selectOption(String(players));
   await page.locator('#pace').selectOption('quick');
   await page.locator('#start').click();
   let humanChoices=0;
   while(!(await page.locator('#match-result:not(.hidden)').isVisible())){
    await page.waitForFunction(()=>{
     const result=document.getElementById('match-result');
     return (result&&!result.classList.contains('hidden'))||
       document.querySelector('.stat-button:not([disabled])');
    },null,{timeout:15000});
    if(await page.locator('#match-result:not(.hidden)').isVisible())break;
    await page.locator('.stat-button:not([disabled])').first().click();
    assert.ok(++humanChoices<=50,'Match requires an unexpected number of human choices');
   }
   const result=await page.locator('#match-result').innerText();
   assert.match(result,/FINAL CARDS/,'Completed match must display final scores');
   assert.ok(await page.locator('#rematch').isVisible(),'Completed match must offer a rematch');
   const cards=(await page.locator('.score b').allTextContents()).map(Number);
   assert.equal(cards.reduce((a,b)=>a+b,0),players===2?50:players===3?60:80,'All cards remain owned at finish');
   assert.match(await page.locator('#jackpot').textContent(),/NO JACKPOT CARDS/,'No cards may remain in jackpot');
   assert.equal(await page.locator('.stat-button:not([disabled])').count(),0,'Finished games cannot accept more moves');
   await page.locator('#rematch').click();
   assert.ok(await page.locator('#match-result').isHidden(),'Rematch must dismiss finished result');
   assert.match(await page.locator('#round-indicator').textContent(),/ROUND 01/,'Rematch starts at round one');
   assert.match(await page.locator('#round-indicator').textContent(),/QUICK CLASH/,'Rematch retains selected rules');
   assert.equal((await page.locator('.score b').allTextContents()).map(Number).reduce((a,b)=>a+b,0),players===2?50:players===3?60:80,'Rematch deals full deck');
   await page.locator('#end').click();
   assert.ok(await page.locator('#game').isHidden(),'Exit clears the rematch');
   console.log('VNEXT_FULL_MATCH_PASS '+theme+' '+players+'P '+skill+': end screen, card conservation, jackpot, same-settings rematch');
  }
  assert.deepEqual(errors,[],'No uncaught errors in completed Quick Clash browser matches');
  await context.close();
 }
}finally{await browser.close()}
