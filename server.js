import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {isWithinRoot} from './safe-path.js';
const root=resolve('public');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.txt':'text/plain','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{
 try {
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/api/books'){
  const upstream=new URL('https://gutendex.com/books/');
  for(const k of ['search','topic','page']) if(url.searchParams.get(k)) upstream.searchParams.set(k,url.searchParams.get(k));
  const response=await fetch(upstream,{signal:AbortSignal.timeout(15000)});
  if(!response.ok) throw Error('Catalog temporarily unavailable');
  res.writeHead(200,{'Content-Type':'application/json'});return res.end(JSON.stringify(await response.json()));
 }
 if(url.pathname==='/api/read'){
  const id=url.searchParams.get('id');
  if(!/^\d{1,7}$/.test(id||'')){res.writeHead(400);return res.end('Invalid book');}
  const response=await fetch(`https://www.gutenberg.org/ebooks/${id}.txt.utf-8`,{signal:AbortSignal.timeout(20000)});
  if(!response.ok) throw Error('This book is temporarily unavailable');
  res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});return res.end(await response.text());
 }
 const file=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
 if(!isWithinRoot(root,file)){res.writeHead(403);return res.end();}
 const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});res.end(data);
 }catch(e){res.writeHead(req.url.startsWith('/api/')?502:404,{'Content-Type':'text/plain'});res.end(req.url.startsWith('/api/')?'The book service is unavailable. Please try again later.':'Not found');}
}).listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Folio listening on port '+(process.env.PORT||3000)));
