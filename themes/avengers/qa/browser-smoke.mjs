// Standalone Avengers Saga preview: no production database, media, or accounts.
import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:4173/themes/avengers/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 for(const [width,height] of [[320,568],[390,844],[768,1024],[1440,900]]){
  const page=await browser.newPage({viewport:{width,height}});
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:15000});
  await page.locator('.roster-card').first().waitFor({timeout:5000});
  assert.equal(await page.locator('.roster-card').count(),50,'Roster must show all fifty');
  assert.equal(await page.locator('#collection-count').textContent(),'50');
  await page.locator('[data-faction="Villains"]').click();
  assert.equal(await page.locator('.roster-card').count(),14,'Villains must be fourteen');
  await page.locator('[data-faction="All"]').click();
  await page.locator('#character-search').fill('Scarlet');
  assert.equal(await page.locator('.roster-card').count(),1);
  await page.locator('.roster-card').click();
  assert.equal(await page.locator('#drawer-name').textContent(),'SCARLET WITCH');
  await page.locator('#drawer-close').click();
  await page.locator('#character-search').fill('');
  await page.locator('#start-duel').click();
  await page.locator('#arena:not(.hidden)').waitFor({timeout:5000});
  assert.ok((await page.locator('#own-card').textContent()).length>15);
  assert.equal(await page.locator('#enemy-card .playing-back').count(),1,'Do not reveal opponent future card');
  const before=Number(await page.locator('#your-count').textContent())+Number(await page.locator('#rival-count').textContent());
  assert.equal(before,50);
  const ready=page.locator('.category-btn:not([disabled])').first();
  await ready.waitFor({timeout:12000});
  await ready.click();
  await page.locator('#result-panel:not(.hidden)').waitFor({timeout:5000});
  assert.ok((await page.locator('#enemy-card').textContent()).includes('NO. '));
  assert.equal(await page.locator('.category-btn:not([disabled])').count(),0,'Cannot choose during reveal');
  await page.waitForTimeout(2800);
  assert.ok(await page.locator('#arena:not(.hidden)').isVisible());
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  if(overflow>2){
    const offenders=await page.evaluate(()=>Array.from(document.querySelectorAll('*')).map(el=>{
      const r=el.getBoundingClientRect();return {tag:el.tagName,id:el.id,cls:typeof el.className==='string'?el.className.slice(0,55):'',left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width)};
    }).filter(x=>x.right>innerWidth+3||x.left<-3).slice(0,15));
    console.error('Mobile overflow elements',JSON.stringify(offenders));
  }
  assert.ok(overflow<=2,'Horizontal viewport overflow on '+width+'px: '+overflow);
  assert.deepEqual(errors,[],'No browser JavaScript exceptions at '+width+'px');
  await page.screenshot({path:'/tmp/deckverse-avengers-'+width+'.png',fullPage:true});
  console.log('PASS: '+width+'×'+height+' roster, faction filter, search, intel and live solo reveal');
  await page.close();
 }
}finally{await browser.close()}
