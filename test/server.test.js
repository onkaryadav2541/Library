import {test,after,before} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
let server;const base='http://127.0.0.1:3099';
before(async()=>{server=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3099'},stdio:'pipe'});await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('error',reject);server.once('exit',()=>reject(Error('Server exited early')))});});
after(()=>server.kill());
test('home loads the discovery interface and application assets',async()=>{const home=await fetch(base);assert.equal(home.status,200);assert.match(await home.text(),/just one more chapter/);for(const path of ['/app.js','/reader.js','/style.css'])assert.equal((await fetch(base+path)).status,200)});
test('starter library serves complete locally cached books',async()=>{const catalog=await(await fetch(base+'/catalog.json')).json();assert.ok(catalog.length>=9);let count=0;for(const book of catalog.filter(b=>b.local)){const response=await fetch(base+`/books/${book.id}.txt`);assert.equal(response.status,200);const text=await response.text();assert.ok(text.length>10000);assert.match(text,/gutenberg/i);count++}assert.ok(count>=9)});
test('reader API rejects arbitrary URLs and invalid IDs',async()=>{for(const id of ['https://example.com','../secret','abc',''])assert.equal((await fetch(base+'/api/read?id='+encodeURIComponent(id))).status,400)});
test('missing files return 404',async()=>{assert.equal((await fetch(base+'/missing-file')).status,404)});

test('server identifies itself for full-featured and static-preview detection', async () => {
  const response = await fetch(base + '/api/health');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).service, 'folio');
});
test('static assets revalidate with ETags and compress text', async () => {
  const response = await fetch(base + '/books/1342.txt', {headers:{'Accept-Encoding':'gzip'}});
  assert.equal(response.headers.get('content-encoding'), 'gzip');
  assert.match(await response.text(), /Gutenberg/);
  const cached = await fetch(base + '/books/1342.txt', {headers:{'If-None-Match':response.headers.get('etag')}});
  assert.equal(cached.status, 304);
});
test('local full-text API works without contacting an external provider', async () => {
  const response = await fetch(base + '/api/read?id=1342');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /truth universally acknowledged/);
});
test('series endpoint validates the collection', async () => {
  assert.equal((await fetch(base + '/api/series?kind=invalid')).status, 400);
});
test('provider registry exposes six free-source adapters',async()=>{const data=await(await fetch(base+'/api/providers')).json();assert.equal(Object.keys(data).length,6);assert.ok(data.openlibrary.kinds.includes('book'));assert.ok(data.anilist.kinds.includes('anime'));});
test('discovery rejects arbitrary provider destinations and malformed series IDs',async()=>{assert.equal((await fetch(base+'/api/discover?provider=https://example.com')).status,400);assert.equal((await fetch(base+'/api/series-details?provider=jikan&kind=anime&id=../secret')).status,400);});
