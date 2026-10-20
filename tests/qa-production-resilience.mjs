import assert from 'node:assert/strict';

const BASE=process.env.QA_URL||'https://addictive-themed-card-games.vercel.app';
const percentile=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.ceil(values.length*p)-1)];
async function raw(action,payload={}){
 const started=performance.now();
 const response=await fetch(BASE+'/api/game',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,...payload}),signal:AbortSignal.timeout(15000)});
 const body=await response.json().catch(()=>({error:'non-json'}));
 return {status:response.status,body,ms:Math.round(performance.now()-started)};
}
async function ok(action,payload={}){const result=await raw(action,payload);assert.equal(result.status,200,`${action}: ${JSON.stringify(result.body)}`);return result}
async function close(code,tokens){for(const token of tokens.filter(Boolean)){try{await raw('leave',{code,token})}catch{}}}

const report={validation:{},races:{},load:[]};
const owned=[];
try{
 const health=await fetch(BASE+'/api/game?health=1');assert.equal(health.status,200);
 const badMode=await raw('create',{name:'QA Invalid Mode',mode:'bogus'});
 report.validation.invalidModeStatus=badMode.status;
 if(badMode.status===200){owned.push({code:badMode.body.room.code,tokens:[badMode.body.token]});report.validation.invalidModeBug='accepted as '+badMode.body.room.mode}
 const controlName=await raw('create',{name:'QA\nControl',mode:'same'});
 report.validation.controlNameStatus=controlName.status;
 if(controlName.status===200){owned.push({code:controlName.body.room.code,tokens:[controlName.body.token]});report.validation.controlNameBug='accepted'}

 const host=(await ok('create',{name:'QA Race Host',mode:'same'})).body;
 const raceRoom={code:host.room.code,tokens:[host.token]};owned.push(raceRoom);
 const joins=await Promise.all([raw('join',{name:'QA Race Guest A',code:raceRoom.code}),raw('join',{name:'QA Race Guest B',code:raceRoom.code})]);
 const joined=joins.find(x=>x.status===200);assert.ok(joined,'one concurrent guest must join');raceRoom.tokens.push(joined.body.token);
 assert.deepEqual(joins.map(x=>x.status).sort((a,b)=>a-b),[200,400]);
 report.races.concurrentJoinStatuses=joins.map(x=>x.status);
 await ok('ready',{code:raceRoom.code,token:joined.body.token,ready:true});
 const started=(await ok('start',{code:raceRoom.code,token:host.token})).body;
 const chooserToken=started.game.chooser===0?host.token:joined.body.token;
 const turns=await Promise.all([raw('select',{code:raceRoom.code,token:chooserToken,stat:'rank',expectedRound:0}),raw('select',{code:raceRoom.code,token:chooserToken,stat:'attack',expectedRound:0})]);
 assert.deepEqual(turns.map(x=>x.status).sort((a,b)=>a-b),[200,409]);
 report.races.concurrentTurnStatuses=turns.map(x=>x.status);
 const badToken=await raw('get',{code:raceRoom.code,token:'0'.repeat(64)});assert.equal(badToken.status,401);report.validation.unauthorizedStatus=badToken.status;

 for(const count of [2,5,10,20]){
  const cohort=[];
  try{
   const creates=await Promise.all(Array.from({length:count},(_,i)=>ok('create',{name:`QA Load ${count}-${i}`,mode:'same'})));
   for(const result of creates)cohort.push({code:result.body.room.code,token:result.body.token});
   const reads=await Promise.all(cohort.map(room=>ok('get',{code:room.code,token:room.token})));
   report.load.push({activeRooms:count,createP50Ms:percentile(creates.map(x=>x.ms),.5),createP95Ms:percentile(creates.map(x=>x.ms),.95),readP50Ms:percentile(reads.map(x=>x.ms),.5),readP95Ms:percentile(reads.map(x=>x.ms),.95),errors:0});
  }finally{await Promise.all(cohort.map(room=>close(room.code,[room.token])))}
 }
 console.log(JSON.stringify(report,null,2));
}finally{
 for(const room of owned)await close(room.code,room.tokens);
}
