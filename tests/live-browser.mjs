import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const URL='https://addictive-themed-card-games.vercel.app/';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
const host=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
const guest=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
const pageErrors=[];
for(const [who,page] of [['host',host],['guest',guest]])page.on('pageerror',e=>pageErrors.push(who+': '+e.message));
async function waitReady(button){await button.waitFor({state:'visible',timeout:15000});await button.isEnabled()||await button.waitFor({state:'visible',timeout:10000})}
try{
 await host.goto(URL,{waitUntil:'domcontentloaded',timeout:20000});
 await host.locator('#pokemon-tile').click();
 await host.locator('#player-name').fill('QA Browser Host');
 await host.locator('#create-room').waitFor({state:'visible'});
 await host.waitForFunction(()=>!document.getElementById('create-room').disabled,{timeout:12000});
 await host.locator('#create-room').click();
 await host.locator('#room-code').waitFor({state:'visible',timeout:20000});
 const code=(await host.locator('#room-code').textContent()).trim();
 assert.match(code,/^[A-Z0-9]{6}$/);
 await host.locator('#reveal-setting').selectOption('manual-2');
 await host.waitForFunction(()=>document.getElementById('reveal-help').textContent.includes('Both players'),{timeout:10000});
 await guest.goto(URL,{waitUntil:'domcontentloaded',timeout:20000});
 await guest.locator('#pokemon-tile').click();
 await guest.locator('#player-name').fill('QA Browser Guest');
 await guest.locator('#join-code').fill(code);
 await guest.waitForFunction(()=>!document.getElementById('join-room').disabled,{timeout:12000});
 await guest.locator('#join-room').click();
 await guest.locator('#room-code').waitFor({state:'visible',timeout:20000});
 assert.equal(await guest.locator('#reveal-setting').inputValue(),'manual-2');
 assert.equal(await guest.locator('#reveal-setting').isDisabled(),true);
 await guest.locator('#toggle-ready').click();
 await guest.waitForFunction(()=>document.getElementById('toggle-ready').textContent.includes('READY — TAP'),{timeout:12000});
 await host.waitForFunction(()=>!document.getElementById('start-match').disabled,{timeout:12000});
 await host.locator('#start-match').click();
 await host.locator('#my-card .card-name').waitFor({timeout:16000});
 await guest.locator('#my-card .card-name').waitFor({timeout:16000});
 assert.equal(await host.locator('#battle-settings-open').isVisible(),true,'Host sees in-match settings');
 assert.equal(await guest.locator('#battle-settings-open').isVisible(),false,'Guest cannot edit host reveal settings');
 const chooser=await host.locator('#turn-power').textContent();
 const selecting=chooser.includes('YOU HAVE THE POWER')?host:guest;
 await selecting.locator('.stat-button:not([disabled])').first().click();
 for(const page of [host,guest]){
   await page.locator('#result.compact').waitFor({timeout:16000});
   assert.equal(await page.locator('#my-card .card-name').isVisible(),true);
   assert.equal(await page.locator('#their-card .card-name').isVisible(),true);
   assert.equal(await page.locator('.stat-button:not([disabled])').count(),0);
 }
 const [hMy,hOpp,gMy,gOpp]=await Promise.all([host.locator('#my-card .card-name').textContent(),host.locator('#their-card .card-name').textContent(),guest.locator('#my-card .card-name').textContent(),guest.locator('#their-card .card-name').textContent()]);
 assert.equal(hMy,gOpp,'Host drawn card should be the guest\'s revealed opponent');
 assert.equal(gMy,hOpp,'Guest drawn card should be the host\'s revealed opponent');
 await host.screenshot({path:'/tmp/deckverse-live-reveal-host.png',fullPage:true});
 await guest.screenshot({path:'/tmp/deckverse-live-reveal-guest.png',fullPage:true});
 await host.locator('#battle-settings-open').click();
 await host.locator('#battle-reveal-setting').selectOption('auto-5');
 await host.waitForFunction(()=>document.querySelector('#battle-settings-status').textContent.includes('Saved!'),{timeout:10000});
 assert.equal(await host.locator('#result.compact').isVisible(),true,'Current reveal remains manual after setting change');
 await guest.locator('#round-continue').click();
 await guest.waitForFunction(()=>document.getElementById('round-continue')?.textContent.includes('READY'),{timeout:10000});
 assert.equal(await host.locator('.stat-button:not([disabled])').count(),0,'First confirmation must not unlock the round');
 await host.locator('#round-continue').click();
 await host.waitForFunction(()=>document.querySelector('#result.compact')?.classList.contains('hidden')||!document.querySelector('#result.compact'),{timeout:12000});
 await guest.waitForFunction(()=>document.querySelector('#result.compact')?.classList.contains('hidden')||!document.querySelector('#result.compact'),{timeout:12000});
 assert.deepEqual(pageErrors,[]);
 console.log('PASS: two independent mobile browsers, host timing controls, real room setup/ready, both card faces on both phones, manual 2-ack next round. Room '+code);
}finally{
 try{const info=await host.evaluate(()=>JSON.parse(sessionStorage.getItem('deckverse_session')||'null'));if(info?.token){await fetch(URL+'api/game',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'leave',code:info.code,token:info.token})})}}catch{}
 await browser.close();
}
