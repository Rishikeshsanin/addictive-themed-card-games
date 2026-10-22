import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const chromiumExecutable=process.env.CHROME_PATH||'/usr/bin/google-chrome';
const browser=await chromium.launch({headless:true,executablePath:chromiumExecutable,args:['--no-sandbox','--use-fake-ui-for-media-stream']});
const address='http://127.0.0.1:4173/themes/packs/?qa-first=0';
const ids=['avengers','ben10','shinchan','dc','naruto','cricket','fantasy'];
try{
 for(const [width,height] of [[320,640],[390,844],[768,1024],[1366,900]]){
   const page=await browser.newPage({viewport:{width,height}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(address,{waitUntil:'domcontentloaded'});
   await page.locator('.theme-tile').first().waitFor();
   assert.equal(await page.locator('.theme-tile').count(),7);
   for(const id of ids){
     await page.locator('.theme-tile[data-theme="'+id+'"]').click();
     assert.equal(await page.locator('.collection-card').count(),50,id+' initial 2-player deck');
     await page.locator('#player-filter').selectOption('3');
     assert.equal(await page.locator('.collection-card').count(),60,id+' three-player inventory');
     await page.locator('#player-filter').selectOption('4');
     assert.equal(await page.locator('.collection-card').count(),80,id+' four-player inventory');
     await page.locator('#player-filter').selectOption('2');
   }
   await page.locator('.theme-tile[data-theme="shinchan"]').click();
   await page.locator('#search').fill('Shinnosuke');
   assert.equal(await page.locator('.collection-card').count(),4);
   await page.locator('.collection-card').first().click();
   assert.ok((await page.locator('#detail-name').textContent()).includes('SHINNOSUKE'));
   await page.locator('#close').click();await page.locator('#search').fill('');
   for(const playerCount of [2,3,4]){
     await page.locator('#players').selectOption(String(playerCount));
     await page.locator('#start').click();
     await page.locator('#game:not(.hidden)').waitFor();
     assert.equal(await page.locator('.battle-slot').count(),playerCount,'All seats render');
     assert.equal(await page.locator('.hidden-card').count(),playerCount-1,'Opponent cards hidden at start');
     assert.equal(await page.locator('.stat-button:not([disabled])').count(),8);
     const sum=await page.locator('.score b').allTextContents();
     assert.equal(sum.map(Number).reduce((a,b)=>a+b,0),playerCount===2?50:playerCount===3?60:80);
     await page.locator('.stat-button:not([disabled])').first().click();
     await page.locator('#reveal:not(.hidden)').waitFor();
     assert.equal(await page.locator('.stat-button:not([disabled])').count(),0);
     const horizontalOverflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));
     assert.ok(horizontalOverflow<=2,'Horizontal overflow '+width+'px '+playerCount+'P: '+horizontalOverflow);
     await page.locator('#end').click();
   }
   assert.deepEqual(errors,[],'No uncaught JS errors at width '+width);
   await page.screenshot({path:'/tmp/deckverse-theme-lab-'+width+'.png',fullPage:true});
   console.log('PASS '+width+'x'+height+': all theme inventories, search, details, 2/3/4 local battle, secrecy and overflow');
   await page.close();
 }
}finally{await browser.close()}
// Premium Theme Lab checks run in the existing isolated browser workflow.
await import('./premium-e2e.mjs');
