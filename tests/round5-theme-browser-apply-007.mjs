/**
 * Apply immutable theme migration 007 exclusively to disposable postgres:16.
 * Preceded by db-integration-mobile-setup.mjs (004/005/006); this does NOT
 * run against any Supabase Project Hub instance.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
assert.equal(process.env.ROUND5_LOCAL_ONLY,'YES','Round 5 local-only opt-in is mandatory');
assert.equal(process.env.DB_INTEGRATION_LOCAL_ONLY,'YES','Disposable bootstrap required');
for(const key of ['DB_INTEGRATION_ADMIN_URL','DECKVERSE_DATABASE_URL']){
 const u=new URL(process.env[key]||'');
 assert.equal(u.hostname,'127.0.0.1','Refuse any non-loopback URL');
 assert.equal(u.port,'5432','Refuse unrecognized disposable port');
 assert.equal(u.pathname,'/deckverse_ci','Refuse non-CI database');
}
const db=postgres(process.env.DB_INTEGRATION_ADMIN_URL,{ssl:false,max:1,prepare:false});
try{
 const migration=await readFile(new URL('../migrations/007_theme_rooms.sql',import.meta.url),'utf8');
 assert.match(migration,/hub\.assert_app_scope\('deckverse','deckverse'\)/);
 assert.doesNotMatch(migration,/\b(?:DROP SCHEMA|TRUNCATE|CASCADE)\b/i);
 await db.unsafe(migration);
 const [row]=await db`SELECT
  COUNT(*)::integer AS rooms,
  COUNT(*) FILTER(WHERE theme_id IS NULL)::integer AS null_themes,
  COUNT(*) FILTER(WHERE theme_id NOT IN ('pokemon','avengers','ben10','shinchan','dc','naruto','cricket','fantasy'))::integer AS invalid
 FROM deckverse.rooms`;
 assert.equal(row.null_themes,0);assert.equal(row.invalid,0);
 const [col]=await db`SELECT COUNT(*)::integer AS n
 FROM information_schema.columns WHERE table_schema='deckverse' AND table_name='rooms' AND column_name='theme_id'`;
 assert.equal(col.n,1);
 const [trigger]=await db`SELECT COUNT(*)::integer AS n FROM pg_trigger
 WHERE tgrelid='deckverse.rooms'::regclass AND tgname='deckverse_rooms_theme_immutable' AND tgenabled='O'`;
 assert.equal(trigger.n,1,'Immutable-theme trigger must be active');
 console.log('ROUND5_DB_SETUP_PASS migration 007 applied to fictional deckverse_ci, server allowlist and immutability verified');
}finally{await db.end();}
