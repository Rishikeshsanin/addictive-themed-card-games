import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';

const chrome=process.env.CHROME_PATH||'/usr/bin/google-chrome';
const base=process.env.QA_URL||'http://127.0.0.1:4173/';
const label=(process.env.QA_LABEL||'local').replace(/[^a-z0-9_-]/gi,'_');
const output=path.resolve('artifacts/qa/screenshots',label);
const viewports=[[320,568],[360,800],[390,844],[430,932],[768,1024],[1024,768],[1366,768],[1920,1080]];
await fs.mkdir(output,{recursive:true});

const browser=await chromium.launch({headless:true,executablePath:chrome,args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
try{
 for(const [width,height] of viewports){
  const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,serviceWorkers:'block'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const started=performance.now();
  const response=await page.goto(base,{waitUntil:'networkidle',timeout:30000});
  assert.equal(response?.ok(),true,`${width}x${height} landing should load`);
  const landingOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  const landingScrollX=await page.evaluate(()=>{scrollTo(10000,0);const x=scrollX;scrollTo(0,0);return x});
  assert.equal(landingScrollX,0,`${width}x${height} landing can scroll horizontally (${landingOverflow}px content overflow)`);
  if(width===320||width===1920)await page.screenshot({path:path.join(output,`landing-${width}x${height}.png`),fullPage:true});

  await page.locator('#pokemon-tile').click();
  assert.equal(await page.locator('#setup').isVisible(),true);
  const setupOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  const setupScrollX=await page.evaluate(()=>{scrollTo(10000,0);const x=scrollX;scrollTo(0,0);return x});
  assert.equal(setupScrollX,0,`${width}x${height} setup can scroll horizontally (${setupOverflow}px content overflow)`);
  if(width===320||width===1920)await page.screenshot({path:path.join(output,`setup-${width}x${height}.png`),fullPage:true});

  await page.locator('#player-name').fill('Responsive QA');
  await page.locator('#practice-btn').click();
  await page.locator('#my-card .card-name').waitFor({timeout:10000});
  const battleOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
  const battleScrollX=await page.evaluate(()=>{scrollTo(10000,0);const x=scrollX;scrollTo(0,0);return x});
  const battleBounds=await page.locator('#battle').boundingBox();
  assert.ok(battleBounds&&battleBounds.width<=width+2,`${width}x${height} battle surface exceeds viewport`);
  const cards=page.locator('.battle-card');
  for(let i=0;i<await cards.count();i++){
   const box=await cards.nth(i).boundingBox();
   assert.ok(box&&box.width>0&&box.height>0,`${width}x${height} card ${i} is visible`);
  }
  const smallestTarget=await page.locator('button:visible').evaluateAll(nodes=>Math.min(...nodes.map(node=>{const r=node.getBoundingClientRect();return Math.min(r.width,r.height)})));
  await page.screenshot({path:path.join(output,`battle-${width}x${height}.png`),fullPage:true});
  const nav=await page.evaluate(()=>performance.getEntriesByType('navigation')[0]?.toJSON());
  const resources=await page.evaluate(()=>performance.getEntriesByType('resource').map(r=>({name:r.name,transferSize:r.transferSize,decodedBodySize:r.decodedBodySize,duration:r.duration})));
  results.push({viewport:`${width}x${height}`,loadMs:Math.round(performance.now()-started),domContentLoadedMs:Math.round(nav?.domContentLoadedEventEnd||0),landingOverflow,setupOverflow,battleOverflow,smallestVisibleButtonPx:Math.round(smallestTarget),resourceTransferBytes:resources.reduce((n,r)=>n+(r.transferSize||0),0),resourceDecodedBytes:resources.reduce((n,r)=>n+(r.decodedBodySize||0),0),pageErrors:errors});
  assert.deepEqual(errors,[],`${width}x${height} browser errors`);
  await page.close();
 }
 console.log(JSON.stringify(results,null,2));
}finally{await browser.close()}
