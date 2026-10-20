// Mocked multi-browser UI contract. NOT evidence of a real PostgreSQL / Vercel multiplayer session.
// Executed by tests/multi-browser.mjs inside the existing PR Chromium CI job.
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {startMultiGame,multiViewFor} from '../src/multi-engine.js';

const origin='http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 for(const count of [3,4]){
  const tokens=Array.from({length:count},(_,i)=>String(i+1).repeat(64));
  const people=Array.from({length:count},(_,i)=>({index:i,name:'QA Player '+(i+1),ready:false}));
  let state=startMultiGame({playerCount:count,chooser:0,picker:()=>0});
  state.status='finished';state.winner=0;state.round=45;
  let status='finished',matchNumber=1,restarts=0;
  const votes=new Set(),errors=[],contexts=[],pages=[];
  const info=seat=>({
   room:{code:'MOCK42',mode:'same',status,playerCount:count,revealSettings:{mode:'auto',seconds:2}},
   players:people,me:people[seat],
   game:{...multiViewFor(state,seat),matchNumber,rematchVotes:[...votes].sort((a,b)=>a-b),reveal:null,endReason:null}
  });
  try{
   for(let i=0;i<count;i++){
    const ctx=await browser.newContext({viewport:{width:i===0?320:390,height:844},serviceWorkers:'block'});
    contexts.push(ctx);
    const page=await ctx.newPage();pages.push(page);
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(({token,seat,name})=>sessionStorage.setItem('deckverse_session',
     JSON.stringify({code:'MOCK42',token,mode:'same',me:{index:seat,name,ready:false}})),
     {token:tokens[i],seat:i,name:people[i].name});
    await page.route('**/api/game',async route=>{
     const b=route.request().postDataJSON();
     const seat=tokens.indexOf(b.token);
     if(seat<0)return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Bad mocked token'})});
     if(b.action==='rematch'){
      if(status!=='finished'||b.expectedMatchNumber!==matchNumber){
       return route.fulfill({status:409,contentType:'application/json',body:JSON.stringify({error:'Stale rematch vote'})});
      }
      votes.add(seat);
      if(votes.size===count){
       restarts++;status='playing';matchNumber++;
       state=startMultiGame({playerCount:count,chooser:0,picker:()=>0});
       state.matchNumber=matchNumber;votes.clear();
      }
     }
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(info(seat))});
    });
    await page.goto(origin,{waitUntil:'domcontentloaded'});
    await page.locator('#play-again').waitFor({state:'visible',timeout:9000});
    assert.match(await page.locator('.rematch-status').textContent(),new RegExp('0/'+count));
   }
   const first=pages[0];
   await first.locator('#play-again').click();
   await first.locator('#play-again').waitFor({state:'visible'});
   assert.equal(await first.locator('#play-again').isDisabled(),true);
   // A replayed request from the already-voted seat must not count twice.
   const duplicate=await first.evaluate(async()=>{
    const session=JSON.parse(sessionStorage.getItem('deckverse_session'));
    const response=await fetch('/api/game',{method:'POST',headers:{'content-type':'application/json'},
     body:JSON.stringify({action:'rematch',code:session.code,token:session.token,expectedMatchNumber:1})});
    return response.status;
   });
   assert.equal(duplicate,200);assert.equal(votes.size,1);assert.equal(restarts,0);
   await pages[1].waitForFunction(n=>document.querySelector('.rematch-status')?.textContent.includes('1/'+n),count,{timeout:8000});
   for(let i=1;i<count;i++){
    await pages[i].locator('#play-again').click();
   }
   assert.equal(restarts,1,'A unanimous rematch must start exactly one fresh match');
   assert.equal(matchNumber,2);assert.equal(votes.size,0);
   for(let i=0;i<count;i++){
    const page=pages[i];
    await page.waitForFunction(()=>document.querySelector('#battle-status')?.textContent.includes('TURN')||
      document.querySelector('#battle-status')?.textContent.includes('WAITING'),null,{timeout:9000});
    assert.equal(await page.locator('#multi-arena .multi-player').count(),count);
    assert.equal(await page.locator('#multi-arena .card-name').count(),1);
    assert.equal(await page.locator('#multi-arena .card-back').count(),count-1);
    assert.equal(await page.locator('.result-pop:visible').count(),0,'Old final modal must disappear');
    const meta=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-window.innerWidth,
      cardWidth:document.querySelector('#multi-arena .multi-card')?.getBoundingClientRect().width}));
    assert.ok(meta.overflow<=2,'No horizontal mobile overflow: '+JSON.stringify(meta));
    assert.ok(meta.cardWidth>=235,'Mobile cards must remain readable: '+JSON.stringify(meta));
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#multi-arena .multi-player').first().waitFor({timeout:9000});
    assert.equal(await page.locator('#multi-arena .card-name').count(),1,'Refresh must preserve concealment');
   }
   await first.screenshot({path:'/tmp/deckverse-rematch-'+count+'p-320.png',fullPage:true});
   assert.deepEqual(errors,[]);
   console.log('PASS: mocked '+count+'P unanimous rematch, duplicate vote, live vote refresh, match reset, phone width, refresh and concealment');
  }finally{
   for(const ctx of contexts)await ctx.close();
  }
 }
}finally{await browser.close()}
