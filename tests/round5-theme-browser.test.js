/**
 * Round 5 Agent E: GitHub CI starts ITS OWN disposable postgres:16 service.
 * Never read user-supplied DB credentials or contact Supabase. By default this
 * file skips outside GitHub CI; the explicit ROUND5_QA_RUN=YES opt-in is allowed.
 * A full browser test run requires Docker, local SSL PostgreSQL and Chrome.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const repoDB='deckverse_ci',local='127.0.0.1:5432';
function run(cmd,args,options={}) {
 return execFileSync(cmd,args,{encoding:'utf8',timeout:options.timeout??150000,
  stdio:options.silent?'pipe':'inherit',...options});
}
const pause=ms=>new Promise(done=>setTimeout(done,ms));
async function waitFor(fn,{attempts=45,delay=700}={}) {
 let err;
 for(let n=0;n<attempts;n++){try{const v=fn();if(v)return v;}catch(e){err=e;}await pause(delay);}
 throw Error('Disposable PostgreSQL did not reach expected state: '+String(err?.message||'timeout'));
}
function step(file,env,{timeout=450000}={}) {
 return new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[file],{stdio:'inherit',env:{...process.env,...env}});
  const timer=setTimeout(()=>child.kill('SIGKILL'),timeout);
  child.on('error',error=>{clearTimeout(timer);reject(error);});
  child.on('exit',(code,signal)=>{clearTimeout(timer);code===0?resolve():reject(Error(file+' exited '+(signal||code)));});
 });
}
test('Round 5: isolated PostgreSQL + real Chromium 8 themes x 2/3/4 players (frontend Agent C gate)',{timeout:600000},async t=>{
 if(process.env.ROUND5_QA_RUN!=='YES'&&process.env.CI!=='true'){
  t.skip('Opt in with ROUND5_QA_RUN=YES (requires isolated Docker postgres and Chrome)');
  return;
 }
 // Reject any inherited production DB settings, even if they happen to be present in CI.
 for(const k of ['DECKVERSE_DATABASE_URL','DB_INTEGRATION_ADMIN_URL']){
  if(process.env[k]&&!new URL(process.env[k]).hostname.match(/^(127\.0\.0\.1|localhost)$/))
   throw Error('Refuse non-loopback inherited DB URL in '+k);
 }
 const container='deckverse-r5-qa-'+process.pid;
 const dir=await mkdtemp(join(tmpdir(),'dv-r5-'));
 const env={
  ROUND5_LOCAL_ONLY:'YES', DB_INTEGRATION_LOCAL_ONLY:'YES',
  DB_INTEGRATION_ADMIN_URL:'postgres://postgres:ci_admin_only@'+local+'/'+repoDB,
  DECKVERSE_DATABASE_URL:'postgres://deckverse_app:ci_disposable_app_only@'+local+'/'+repoDB,
  CHROME_PATH:process.env.CHROME_PATH||'/usr/bin/google-chrome',
  LIVEKIT_URL:'wss://synthetic-only.invalid',
  LIVEKIT_API_KEY:'round5-test-key',
  LIVEKIT_API_SECRET:'round5-fictional-secret',
 };
 let started=false;
 try{
  run('docker',['run','-d','--rm','--name',container,
   '-e','POSTGRES_DB='+repoDB,'-e','POSTGRES_USER=postgres',
   '-e','POSTGRES_PASSWORD=ci_admin_only',
   '-p','127.0.0.1:5432:5432','postgres:16'],{silent:true});
  started=true;
  await waitFor(()=>run('docker',['exec',container,'pg_isready','-U','postgres','-d',repoDB],{silent:true}).includes('accepting connections'));
  // Generate a throwaway one-day server TLS certificate in this runner only.
  const key=join(dir,'server.key'),cert=join(dir,'server.crt');
  run('openssl',['req','-x509','-nodes','-newkey','rsa:2048','-days','1',
   '-subj','/CN=localhost','-keyout',key,'-out',cert],{silent:true});
  run('docker',['cp',key,container+':/var/lib/postgresql/data/server.key']);
  run('docker',['cp',cert,container+':/var/lib/postgresql/data/server.crt']);
  run('docker',['exec','-u','root',container,'chown','postgres:postgres','/var/lib/postgresql/data/server.key','/var/lib/postgresql/data/server.crt']);
  run('docker',['exec','-u','root',container,'chmod','600','/var/lib/postgresql/data/server.key']);
  // PostgreSQL's image can report pg_isready=true during the temporary
  // init server and then restart into the real server. Retry only this local
  // disposable TLS configuration across that brief startup transition.
  await waitFor(()=>{
   run('docker',['exec','-u','postgres',container,'psql','-U','postgres','-d',repoDB,
    '-v','ON_ERROR_STOP=1','-c',"ALTER SYSTEM SET ssl = 'on'",
    '-c',"ALTER SYSTEM SET ssl_cert_file = '/var/lib/postgresql/data/server.crt'",
    '-c',"ALTER SYSTEM SET ssl_key_file = '/var/lib/postgresql/data/server.key'"],{silent:true});
   return true;
  },{attempts:50,delay:600});
  run('docker',['kill','--signal=HUP',container],{silent:true});
  await waitFor(()=>run('docker',['exec','-u','postgres',container,'psql','-U','postgres','-d',repoDB,'-tAc','SHOW ssl'],{silent:true}).trim()==='on');
  await step('tests/db-integration-mobile-setup.mjs',env,{timeout:120000});
  await step('tests/round5-theme-browser-apply-007.mjs',env,{timeout:120000});
  await step('tests/round5-theme-browser-e2e.mjs',env,{timeout:425000});
  // Independent six-case synthetic SDK lifecycle regression, no LiveKit Cloud.
  await step('tests/livekit-mobile-lifecycle.mjs',env,{timeout:90000});
  assert.ok(true);
 }finally{
  if(started){try{run('docker',['rm','-f',container],{silent:true,timeout:30000});}catch(e){console.error('Disposable container cleanup error',e.message)}}
  await rm(dir,{recursive:true,force:true});
 }
});
