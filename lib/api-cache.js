import {readFile,writeFile,mkdir,readdir,unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';

export function createApiCache({directory=join(tmpdir(),'folio-api-v4'),freshMs=300000,staleMs=86400000,maxEntries=160,now=Date.now}={}){
 const memory=new Map(),pending=new Map(),failures=new Map();let initialized=false,writes=0;
 const path=key=>join(directory,createHash('sha256').update(key).digest('hex')+'.json');
 async function initialize(){if(initialized)return;initialized=true;try{await mkdir(directory,{recursive:true});const files=await readdir(directory);if(files.length>maxEntries*2)await Promise.all(files.slice(0,files.length-maxEntries).map(f=>unlink(join(directory,f)).catch(()=>{})));}catch{}}
 async function refresh(key,loader){
  if(pending.has(key))return pending.get(key);
  const promise=(async()=>{
   try{
    const value=await loader(),entry={value,time:now()};
    failures.delete(key);memory.set(key,entry);
    if(memory.size>maxEntries)memory.delete(memory.keys().next().value);
    await initialize();await writeFile(path(key),JSON.stringify(entry)).catch(()=>{});
    if(++writes%maxEntries===0){try{const files=await readdir(directory);if(files.length>maxEntries*2)await Promise.all(files.slice(0,files.length-maxEntries).map(f=>unlink(join(directory,f)).catch(()=>{})));}catch{}}
    return {...value,cache:'fresh'};
   }catch(error){failures.set(key,now()+20000);throw error;}
  })();pending.set(key,promise);try{return await promise;}finally{pending.delete(key);}
 }
 return {async get(key,loader){
  let entry=memory.get(key);
  if(!entry){try{entry=JSON.parse(await readFile(path(key),'utf8'));if(entry.time&&entry.value)memory.set(key,entry);else entry=null;}catch{}}
  const age=entry?now()-entry.time:Infinity;
  if(age<freshMs)return {...entry.value,cache:'hit'};
  if(age<staleMs){if(!(failures.get(key)>now()))refresh(key,loader).catch(()=>{});return {...entry.value,cache:'stale'};}
  if(failures.get(key)>now())throw Error('This source is taking a short break. Please retry shortly.');
  return refresh(key,loader);
 },pending};
}
