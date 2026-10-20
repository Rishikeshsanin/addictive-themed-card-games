import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
const ctx=await browser.newContext({viewport:{width:390,height:844}});
const page=await ctx.newPage();
const saved={code:'QATEST',token:'a'.repeat(64),mode:'same',me:{index:0,name:'Recovery Test',ready:true}};
let calls=0;
await page.addInitScript(s=>sessionStorage.setItem('deckverse_session',JSON.stringify(s)),saved);
await page.route('**/api/game',route=>{
 const b=route.request().postDataJSON();
 if(b.action==='get'){
  calls++;
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
   room:{code:saved.code,mode:'same',status:'lobby',revealSettings:{mode:'auto',seconds:2}},
   me:saved.me,players:[{index:0,name:'Recovery Test',ready:true}],game:null
  })});
 }
 return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({error:'Test-only route'})});
});
try{
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
 await page.locator('#room-code').waitFor({timeout:7000});
 assert.equal((await page.locator('#room-code').textContent()).trim(),'QATEST');
 const before=calls;assert.ok(before>=1);
 await ctx.setOffline(true);
 await page.locator('#network-status').waitFor({state:'visible',timeout:4000});
 assert.match(await page.locator('#network-status').textContent(),/OFFLINE/);
 const stored=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('deckverse_session')));
 assert.equal(stored.token,saved.token,'Network drops must preserve the session');
 await ctx.setOffline(false);
 await page.locator('#network-status').waitFor({state:'hidden',timeout:8000});
 assert.equal((await page.locator('#room-code').textContent()).trim(),'QATEST');
 assert.ok(calls>before,'Online recovery must refetch server truth');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#room-code').waitFor({timeout:7000});
 assert.equal((await page.locator('#room-code').textContent()).trim(),'QATEST');
 console.log('PASS: offline notice, session persistence, online resync and refresh recovery');
}finally{await browser.close()}
