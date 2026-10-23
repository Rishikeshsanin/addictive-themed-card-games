/**
 * LOCAL ONLY: truthful screenshots of original Elemental Realms UI; no API
 * multiplayer rooms, Supabase credentials, or production screenshots.
 * Review rights/privacy/legibility manually BEFORE copying captures into a PR.
 * Requires an independently started local static server on 127.0.0.1:4173.
 * Captures are PNG review candidates in OS temp; never commits them for you.
 */
import {chromium} from 'playwright-core';
import {mkdtemp,stat,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const origin='http://127.0.0.1:4173';
const out=await mkdtemp(join(tmpdir(),'deckverse-repo-media-review-'));
const executablePath=process.env.CHROME_PATH||'/usr/bin/chromium';
const browser=await chromium.launch({headless:true,executablePath,
 args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 for(const {width,height,name} of [
  {width:1440,height:900,name:'desktop'},
  {width:390,height:844,name:'mobile-390'},
  {width:320,height:740,name:'mobile-320'}
 ]){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/themes/packs/?theme=fantasy&qa-first=0',{waitUntil:'domcontentloaded'});
  await page.locator('.theme-tile[data-theme="fantasy"]').click();
  await page.locator('#players').selectOption('2');
  await page.locator('#start').click();
  await page.locator('#game:not(.hidden)').waitFor();
  // Fight only against local bot; screenshot just the local game panel,
  // not public rooms, URLs, social profiles or unrelated fan-art posters.
  const game=page.locator('#game');
  const overflow=await page.evaluate(()=>Math.max(0,document.documentElement.scrollWidth-innerWidth));
  if(overflow>2)throw Error(name+' has horizontal document overflow '+overflow+'px');
  if(await page.locator('#actions .stat-button').count()!==8)
   throw Error('Expected eight real comparison categories');
  const path=join(out,'elemental-realms-game-'+name+'.png');
  await game.screenshot({path,animations:'disabled'});
  if(errors.length)throw Error('Uncaught browser error: '+errors.join('; '));
  const info=await stat(path);
  console.log('REAL_LOCAL_SCREENSHOT '+name+' '+width+'x'+height+' '+info.size+' bytes '+path);
  await page.close();
 }
 console.log('Review capture directory: '+out);
 console.log('NOT PUBLISHED. Inspect every image, strip private data, verify rights, then optimize.');
}finally{await browser.close()}
