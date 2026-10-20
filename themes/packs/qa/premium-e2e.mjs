// Independent premium visual / interaction QA. Chromium emulation, not physical phones.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const base='http://127.0.0.1:4173/themes/packs/?qa-first=0';
const themes=['avengers','ben10','shinchan','dc','naruto','cricket','fantasy'];
const widths=[320,390,768,1366];
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
let samples=[];
async function geometry(page,label){
 const result=await page.evaluate(()=>{
  const doc=document.documentElement;
  const start=window.scrollX;
  window.scrollTo({left:10000,top:window.scrollY,behavior:'instant'});
  const actualScroll=window.scrollX;
  window.scrollTo({left:start,top:window.scrollY,behavior:'instant'});
  const selected=[...document.querySelectorAll('.theme-tile,.collection-card,.battle-card,.stat-button,.toolbar select,.search input')]
   .filter(el=>el.getClientRects().length>0&&getComputedStyle(el).visibility!=='hidden');
  const clipped=selected.filter(el=>{
   const box=el.getBoundingClientRect();
   return box.right>innerWidth+2||box.left< -2||box.width<10;
  }).slice(0,6).map(el=>({id:el.id,cls:String(el.className).slice(0,45)}));
  return {scroll:actualScroll,rawOverflow:Math.max(0,doc.scrollWidth-innerWidth),clipped,
   interactive:selected.length,domNodes:document.querySelectorAll('*').length};
 });
 assert.ok(result.scroll<=2, label+' horizontal scroll '+JSON.stringify(result));
 assert.equal(result.clipped.length,0,label+' clipped interactive items '+JSON.stringify(result));
 samples.push({label,...result});
 return result;
}
try{
 for(const width of widths){
  const context=await browser.newContext({viewport:{width,height:width===320?640:width===390?844:width===768?1024:900},reducedMotion:'reduce',serviceWorkers:'block'});
  const page=await context.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});
  await page.locator('.theme-tile').first().waitFor();
  assert.equal(await page.locator('.theme-tile').count(),7);
  assert.equal(await page.getAttribute('body','data-theme'),'avengers');
  await geometry(page,'landing '+width);
  for(const theme of themes){
   await page.locator('[data-theme="'+theme+'"]').click();
   assert.equal(await page.getAttribute('body','data-theme'),theme,'Theme identity must switch');
   assert.equal(await page.locator('[data-theme="'+theme+'"]').getAttribute('aria-pressed'),'true');
   assert.equal(await page.locator('.collection-card').count(),50);
   assert.equal(await page.locator('.theme-tile.selected').count(),1);
   assert.ok((await page.locator('.collection-card .sigil').count())>=50,'Original CSS motif must render');
   await geometry(page,'collection '+theme+' '+width);
   if(width===390){
    // Scroll to selected roster then capture viewport. Chromium screenshot != physical phone.
    await page.locator('#collection-title').scrollIntoViewIfNeeded();
    await page.screenshot({path:'/tmp/deckverse-theme-lab-premium-'+theme+'-'+width+'.png'});
   }
  }
  await page.locator('[data-theme="fantasy"]').click();
  await page.locator('#sort').selectOption('rank');
  const rankList=await page.locator('.rank-pill').allTextContents();
  const ranks=rankList.map(x=>Number(x.replace(/\D/g,'')));
  assert.deepEqual(ranks,[...ranks].sort((a,b)=>a-b),'Rank sort is ascending');
  await page.locator('#sort').selectOption('name');
  const names=await page.locator('.collection-card .card-name').allTextContents();
  assert.deepEqual(names,[...names].sort((a,b)=>a.localeCompare(b)),'Name sort');
  await page.locator('#sort').selectOption('power');
  assert.equal(await page.locator('.collection-card').count(),50);
  const group=await page.locator('#group option').nth(1).getAttribute('value');
  await page.locator('#group').selectOption(group);
  const matches=await page.locator('.collection-card').count();
  assert.ok(matches>0&&matches<50,'Group should filter');
  await page.locator('#search').fill('no card with this fake name xyz');
  assert.equal(await page.locator('.collection-card').count(),0);
  assert.ok(await page.locator('#empty').isVisible());
  await page.locator('#clear-search').click();
  assert.ok(await page.locator('.collection-card').count()>0);
  await page.locator('#group').selectOption('all');
  await page.locator('#sort').selectOption('deck');
  const opening=page.locator('.collection-card').first();
  await opening.focus();
  await opening.press('Enter');
  await page.locator('#detail-name').waitFor({state:'visible'});
  assert.equal(await page.locator('.detail-stat').count(),8);
  assert.equal(await page.locator('[role="meter"]').count(),8);
  assert.equal(await page.locator('#close').evaluate(el=>document.activeElement===el),true);
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('#details').isHidden());
  assert.equal(await opening.evaluate(el=>document.activeElement===el),true,'Dialog focus returns to card');
  const motion=await page.locator('.reveal').evaluate(el=>getComputedStyle(el).animationDuration);
  assert.ok(['0s','0.01ms','0.001s'].includes(motion)||parseFloat(motion)===0,'Respect reduced motion');
  await geometry(page,'filters '+width);
  await page.locator('[data-theme="shinchan"]').click();
  await page.locator('#pace').selectOption('quick');
  await page.locator('#players').selectOption('4');
  await page.locator('#start').click();
  await page.locator('#game:not(.hidden)').waitFor();
  assert.equal(await page.locator('.battle-slot').count(),4);
  assert.equal(await page.locator('.hidden-card').count(),3);
  assert.equal(await page.locator('.stat-button:not([disabled])').count(),8);
  const cards=await page.locator('.score b').allTextContents();
  assert.equal(cards.map(Number).reduce((a,b)=>a+b,0),80);
  assert.ok(await page.locator('#round-indicator').isVisible());
  await geometry(page,'game '+width);
  await page.locator('.stat-button:not([disabled])').first().click();
  await page.locator('#reveal:not(.hidden)').waitFor();
  assert.equal(await page.locator('.stat-button:not([disabled])').count(),0);
  assert.ok(await page.locator('.battle-stat.played-stat').count()>=2);
  assert.ok(await page.locator('.reveal-eyebrow').isVisible());
  await geometry(page,'reveal '+width);
  await page.locator('#end').click();
  assert.ok(await page.locator('#game').isHidden());
  assert.deepEqual(errors,[],'No Chromium runtime errors '+width);
  const nav=await page.evaluate(()=>performance.getEntriesByType('navigation')[0]?.duration||0);
  console.log('PREMIUM_QA_PASS '+width+'px: seven theme identities, sort/group/search, keyboard dialog, reduced motion, 4P reveal, scroll and hit targets; navigation='+nav.toFixed(1)+'ms');
  await context.close();
 }
 console.log('PREMIUM_QA_METRICS='+JSON.stringify(samples));
}finally{await browser.close();}
