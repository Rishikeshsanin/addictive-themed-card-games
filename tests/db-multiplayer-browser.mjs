/**
 * Genuine localhost HTTP -> api/game.js -> disposable PostgreSQL -> real Chromium.
 * Every browser has separate sessionStorage; no API routes are mocked.
 * This is synthetic browser hardware and fictional CI room data, NOT physical-device QA.
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright-core';
import postgres from 'postgres';

if(process.env.DB_MULTIPLAYER_TEST_ONLY!=='1'||
 !process.env.DECKVERSE_DATABASE_URL?.includes('@127.0.0.1:5432/deckverse_ci')||
 !process.env.DB_MULTIPLAYER_FIXTURE_URL?.includes('@127.0.0.1:5432/deckverse_ci'))
 throw Error('Browser SQL QA is restricted to loopback disposable deckverse_ci only');
const {default:gameHandler}=await import('../api/game.js');
const sql=postgres(process.env.DB_MULTIPLAYER_FIXTURE_URL,{ssl:'require',prepare:false,max:3});
const root=process.cwd(),host='http://127.0.0.1:4174/';
const types={'.js':'text/javascript','.css':'text/css','.html':'text/html',
 '.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,host);
 res.status=n=>{res.statusCode=n;return res};
 res.json=x=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(x));return res};
 try{
  if(url.pathname==='/api/game'){
   if(req.method==='POST'){
    let body='';for await(const chunk of req){body+=chunk;if(body.length>12000){res.statusCode=413;res.end();return}}
    req.body=JSON.parse(body);
   }
   await gameHandler(req,res);return;
  }
  const file=path.resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!file.startsWith(root+path.sep)){res.statusCode=403;res.end();return}
  const bytes=await fs.readFile(file);
  res.setHeader('content-type',types[path.extname(file)]||'application/octet-stream');
  res.end(bytes);
 }catch(error){res.statusCode=error.code==='ENOENT'?404:500;res.end('Local disposable QA failure: '+error.message)}
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4174,'127.0.0.1',resolve)});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
 args:['--no-sandbox','--disable-dev-shm-usage']});
const problems=[];
async function gameRow(code){const [r]=await sql`select status,state from deckverse.rooms where code=${code}`;assert.ok(r);return r}
try{
 for(const n of [2,3,4]){
  const contexts=[],pages=[],pageErrors=[];
  try{
   for(let i=0;i<n;i++){
    const context=await browser.newContext({viewport:{width:i===0?320:390,height:844},
     serviceWorkers:'block',deviceScaleFactor:1});
    contexts.push(context);
    const page=await context.newPage();pages.push(page);
    page.on('pageerror',err=>pageErrors.push({seat:i,message:err.message}));
    await page.goto(host,{waitUntil:'domcontentloaded'});
    await page.locator('#pokemon-tile').click();
    await page.locator('#player-name').fill('Database QA '+i);
    await page.waitForFunction(()=>!document.querySelector('#create-room').disabled);
   }
   await pages[0].locator('[data-player-count="'+n+'"]').click();
   await pages[0].locator('#create-room').click();
   await pages[0].locator('#room-code').waitFor({timeout:12000});
   const code=(await pages[0].locator('#room-code').textContent()).trim();
   assert.match(code,/^[A-Z0-9]{6}$/);
   // Use real manual acknowledgement through the browser, with server-stored timing.
   await pages[0].locator('#reveal-setting').selectOption('manual-2');
   for(let i=1;i<n;i++){
    await pages[i].locator('#join-code').fill(code);
    await pages[i].locator('#join-room').click();
    await pages[i].locator('#room-code').waitFor({timeout:9000});
    await pages[i].locator('#toggle-ready').click();
   }
   await pages[0].waitForFunction(n=>document.querySelectorAll('#lobby-players .player-slot small')
    .length===n&&[...document.querySelectorAll('#lobby-players .player-slot small')]
    .every(e=>e.textContent.includes('● READY')),n,{timeout:12000});
   await pages[0].locator('#start-match').click();
   for(let i=0;i<n;i++){
    await pages[i].locator('#stat-buttons .stat-button').first().waitFor({timeout:12000});
    assert.equal(await pages[i].locator('.stat-button').count(),8);
   }
   let row=await gameRow(code);
   assert.equal(row.state.total,n===2?50:n*20);
   assert.equal(row.state.players.length,n);
   assert.deepEqual(row.state.players.map(x=>x.deck.length),Array(n).fill(n===2?25:20));
   for(let i=0;i<n;i++){
    if(n===2){
     assert.equal(await pages[i].locator('#my-card .card-name').count(),1);
     assert.equal(await pages[i].locator('#their-card .card-name').count(),0);
    }else{
     assert.equal(await pages[i].locator('#multi-arena .multi-player').count(),n);
     assert.equal(await pages[i].locator('#multi-arena .card-name').count(),1);
     assert.equal(await pages[i].locator('#multi-arena .card-back').count(),n-1);
    }
    const bounds=await pages[i].evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,
      width:document.querySelector('#multi-arena:not(.hidden) .multi-card')?.getBoundingClientRect().width||null}));
    assert.ok(bounds.overflow<=2,JSON.stringify(bounds));
    if(n>2)assert.ok(bounds.width>=230,'Phone-size card must not be unreadably narrow: '+JSON.stringify(bounds));
   }
   await pages[row.state.chooser].locator('.stat-button:not([disabled])').first().click();
   row=await gameRow(code);
   assert.equal(row.state.round,1);
   for(let i=0;i<n;i++){
    await pages[i].locator('#result.compact').waitFor({state:'visible',timeout:12000});
    assert.equal(await pages[i].locator('#round-continue').isVisible(),true);
    const played=n===2?await pages[i].locator('#battle .tabletop .card-name').allTextContents():
      await pages[i].locator('#multi-arena .card-name').allTextContents();
    assert.equal(played.length,n,'Every player must see all played cards');
   }
   // All N acknowledgements required; a missing last voter keeps the reveal up.
   for(let i=0;i<n-1;i++){
    await pages[i].locator('#round-continue').click();
    await pages[i].waitForFunction(()=>document.querySelector('#round-continue')?.disabled);
   }
   assert.equal((await gameRow(code)).state.round,1);
   await pages[n-1].locator('#round-continue').click();
   const acknowledgements=await sql`select reveal_acks from deckverse.rooms where code=${code}`;
   assert.deepEqual([...acknowledgements[0].reveal_acks].sort(),Array.from({length:n},(_,i)=>i));
   await pages[0].screenshot({path:'/tmp/deckverse-db-multiplayer-'+n+'p-320.png',fullPage:true});
   await pages[0].reload({waitUntil:'domcontentloaded'});
   if(n===2)await pages[0].locator('#my-card .card-name').first().waitFor({timeout:10000});
   else await pages[0].locator('#multi-arena .multi-player').first().waitFor({timeout:10000});
   assert.equal((await gameRow(code)).state.round,1);
   assert.deepEqual(pageErrors,[],JSON.stringify(pageErrors));
   console.log('PASS real SQL-backed '+n+'P Chromium browser lobby, private cards, shared reveal, N acknowledgements, mobile layout and refresh');
  }catch(error){problems.push({n,error:error.stack||String(error)});throw error}
  finally{for(const context of contexts)await context.close()}
 }
}catch(error){console.error('DATABASE BROWSER QA FAIL',error.stack||error);process.exitCode=1}
finally{
 await browser.close();
 await sql.end({timeout:5});
 await new Promise(resolve=>server.close(resolve));
}
