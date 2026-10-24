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
}finally{await browser.close()}
