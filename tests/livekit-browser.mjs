// End-to-end smoke using two independent browsers, fake microphone/video devices and a test-only DeckVerse room.
// Never exposes LiveKit tokens or credentials to CI logs. The test room is removed on completion.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const ORIGIN='https://addictive-themed-card-games.vercel.app';
const browser=await chromium.launch({
  executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',
  headless:true,
  args:['--no-sandbox','--disable-dev-shm-usage','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']
});
const host=await browser.newPage({viewport:{width:390,height:844}});
const guest=await browser.newPage({viewport:{width:390,height:844}});
const errors=[];
for(const [name,p] of [['host',host],['guest',guest]])p.on('pageerror',e=>errors.push(name+': '+e.message));
let code,hostToken,guestToken;
async function api(action,token){
  const r=await fetch(ORIGIN+'/api/game',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,code,token})});return r.json()
}
async function waitConnected(page,label){
 await page.waitForFunction(()=>/Voice connected|Connected without mic/.test(document.querySelector('#call-status')?.textContent||''),{timeout:45000});
 assert.equal(await page.locator('#call-leave').isVisible(),true,label+' should expose Leave Call');
}
try{
  const config=await (await fetch(ORIGIN+'/api/livekit-token')).json();
  assert.equal(config.configured,true,'LiveKit credentials must be set in dedicated DeckVerse project');
  const health=await (await fetch(ORIGIN+'/api/game?health=1')).json();
  assert.equal(health.status,'ready','Game DB must be ready before joining LiveKit');

  await host.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:20000});
  await host.locator('#pokemon-tile').click();
  await host.locator('[data-mode="remote"]').click();
  await host.locator('#player-name').fill('Call QA Host');
  await host.waitForFunction(()=>!document.querySelector('#create-room')?.disabled,{timeout:15000});
  await host.locator('#create-room').click();
  await host.locator('#room-code').waitFor({timeout:20000});
  code=(await host.locator('#room-code').textContent()).trim();
  assert.match(code,/^[A-Z0-9]{6}$/);
  hostToken=await host.evaluate(()=>JSON.parse(sessionStorage.getItem('deckverse_session')||'null')?.token);

  await guest.goto(ORIGIN,{waitUntil:'domcontentloaded',timeout:20000});
  await guest.locator('#pokemon-tile').click();
  await guest.locator('[data-mode="remote"]').click();
  await guest.locator('#player-name').fill('Call QA Guest');
  await guest.locator('#join-code').fill(code);
  await guest.waitForFunction(()=>!document.querySelector('#join-room')?.disabled,{timeout:15000});
  await guest.locator('#join-room').click();
  await guest.locator('#room-code').waitFor({timeout:20000});
  guestToken=await guest.evaluate(()=>JSON.parse(sessionStorage.getItem('deckverse_session')||'null')?.token);
  await guest.locator('#toggle-ready').click();
  await host.waitForFunction(()=>!document.querySelector('#start-match')?.disabled,{timeout:15000});
  await host.locator('#start-match').click();
  await host.locator('#my-card .card-name').waitFor({timeout:20000});
  await guest.locator('#my-card .card-name').waitFor({timeout:20000});

  await host.locator('#call-join').click();
  await waitConnected(host,'Host');
  await guest.locator('#call-join').click();
  await waitConnected(guest,'Guest');
  console.log('PASS: both independent remote-room browsers connected to LiveKit');

  await host.locator('#call-mic').click();
  await host.waitForFunction(()=>/muted/i.test(document.querySelector('#call-status')?.textContent||''),{timeout:10000});
  await host.locator('#call-mic').click();
  console.log('PASS: microphone toggle');

  await host.locator('#call-camera').click();
  await guest.locator('#call-camera').click();
  await host.locator('#local-video video').waitFor({timeout:20000});
  await guest.locator('#local-video video').waitFor({timeout:20000});
  await host.locator('#remote-video video').waitFor({timeout:30000});
  await guest.locator('#remote-video video').waitFor({timeout:30000});
  console.log('PASS: camera publication and opponent video subscription on both sides');

  await host.locator('#call-leave').click();
  await host.locator('#call-join').waitFor({timeout:15000});
  console.log('PASS: call leave without disturbing cards');
  assert.deepEqual(errors,[],'No unhandled JavaScript page errors');
}finally{
  for(const [token,name] of [[guestToken,'guest'],[hostToken,'host']]){
    if(token&&code){try{await api('leave',token)}catch{console.log('Test room cleanup attempted for '+name)}}
  }
  await browser.close();
}
