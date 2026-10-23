const HOSTS=new Set(['covers.openlibrary.org','www.gutenberg.org','gutenberg.org','books.google.com','books.googleusercontent.com','cdn.myanimelist.net','s4.anilist.co','media.kitsu.io','media.kitsu.app']);
export function coverURL(value){
 let url;try{url=new URL(value);}catch{throw Error('Invalid cover URL');}
 if(url.protocol!=='https:'||!HOSTS.has(url.hostname)||url.port||url.username||url.password)throw Error('Invalid cover host');
 return url.href;
}
export function createCoverCache({fetcher=fetch,maxBytes=8*1024*1024,timeout=4500}={}){
 const cache=new Map(),pending=new Map(),failures=new Map();let bytes=0,active=0;const queue=[];
 const enter=()=>active<4?(active++,Promise.resolve()):new Promise(resolve=>queue.push(resolve));
 const leave=()=>{if(queue.length)queue.shift()();else active--;};
 async function load(url){
  await enter();try{
   let target=url;
   for(let redirect=0;redirect<4;redirect++){
    const response=await fetcher(target,{redirect:'manual',signal:AbortSignal.timeout(timeout),headers:{Accept:'image/avif,image/webp,image/png,image/jpeg,image/*'}});
    if(response.status>=300&&response.status<400){target=coverURL(new URL(response.headers.get('location'),target).href);continue;}
    if(!response.ok)throw Error('Cover unavailable');
    const type=response.headers.get('content-type')?.split(';')[0];
    if(!['image/jpeg','image/png','image/webp','image/gif','image/avif'].includes(type))throw Error('Invalid image');
    if(Number(response.headers.get('content-length'))>1024*1024)throw Error('Cover too large');
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>1024*1024)throw Error('Cover too large');chunks.push(chunk);}
    if(size<300)throw Error('No cover supplied');
    const result={body:Buffer.concat(chunks),type,expires:Date.now()+86400000};
    while(bytes+size>maxBytes&&cache.size){const key=cache.keys().next().value;bytes-=cache.get(key).body.length;cache.delete(key);}
    cache.set(url,result);bytes+=size;return result;
   }
   throw Error('Too many cover redirects');
  }finally{leave();}
 }
 return {async get(value){
  const url=coverURL(value),cached=cache.get(url);
  if(cached&&cached.expires>Date.now())return cached;
  if(cached){cache.delete(url);bytes-=cached.body.length;}
  if(failures.get(url)>Date.now())throw Error('Cover temporarily unavailable');
  failures.delete(url);
  if(pending.has(url))return pending.get(url);
  const request=load(url);pending.set(url,request);
  try{return await request;}catch(error){if(failures.size>=512)failures.delete(failures.keys().next().value);failures.set(url,Date.now()+20000);throw error;}finally{pending.delete(url);}
 },get bytes(){return bytes;}};
}
