import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createApiCache} from '../lib/api-cache.js';
test('concurrent requests share one load and cached metadata survives cache instances',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'folio-test-'));let calls=0;try{
 const cache=createApiCache({directory});const loader=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,20));return {books:[{id:1}]};};
 await Promise.all([cache.get('q',loader),cache.get('q',loader)]);assert.equal(calls,1);
 const restored=createApiCache({directory});const result=await restored.get('q',()=>{throw Error('Should not fetch');});assert.equal(result.cache,'hit');assert.equal(result.books[0].id,1);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('stale metadata returns immediately while revalidation runs independently',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'folio-test-'));let now=100;let unblock;try{
 const cache=createApiCache({directory,freshMs:10,staleMs:1000,now:()=>now});await cache.get('q',async()=>({books:[1]}));now=200;
 const refresh=new Promise(resolve=>{unblock=resolve;});const result=await cache.get('q',async()=>{await refresh;return {books:[2]};});
 assert.equal(result.cache,'stale');assert.deepEqual(result.books,[1]);const inFlight=cache.pending.get('q');unblock();await inFlight;
 assert.deepEqual((await cache.get('q',async()=>{throw Error();})).books,[2]);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('failed requests have a cooldown instead of repeatedly hammering a source',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'folio-test-'));let calls=0;try{const cache=createApiCache({directory});const loader=async()=>{calls++;throw Error('Unavailable');};await assert.rejects(cache.get('x',loader));await assert.rejects(cache.get('x',loader));assert.equal(calls,1);}finally{await rm(directory,{recursive:true,force:true});}
});
