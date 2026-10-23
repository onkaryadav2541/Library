import http from 'node:http';
import {readFile, stat} from 'node:fs/promises';
import {resolve, extname} from 'node:path';
import {gzip} from 'node:zlib';
import {promisify} from 'node:util';
import {isWithinRoot} from './safe-path.js';

// Older Node versions do not expose this API; normal direct networking still works.
http.setGlobalProxyFromEnv?.();
const root = resolve('public');
const zip = promisify(gzip);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.txt':'text/plain; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
const upstreamCache = new Map(), pending = new Map(), compressed = new Map();
async function upstream(url, ttl = 900000) {
  const cached = upstreamCache.get(url);
  if (cached && cached.expires > Date.now()) return cached;
  if (pending.has(url)) return pending.get(url);
  const request = (async () => {
    const response = await fetch(url, {signal:AbortSignal.timeout(15000), headers:{'Accept':'application/json, text/plain, */*'}});
    if (!response.ok) throw Error(`Source returned ${response.status}`);
    const body = await response.text();
    const entry = {body, expires:Date.now() + ttl};
    if (upstreamCache.size >= 80) upstreamCache.delete(upstreamCache.keys().next().value);
    upstreamCache.set(url, entry); return entry;
  })();
  pending.set(url, request);
  try { return await request; } finally { pending.delete(url); }
}
function send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, {'Content-Type':type,'X-Content-Type-Options':'nosniff',...headers}); res.end(body);
}
http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!['GET','HEAD'].includes(req.method)) return send(res, 405, 'Method not allowed', undefined, {Allow:'GET, HEAD'});
    if (url.pathname === '/api/health') return send(res, 200, JSON.stringify({service:'folio',version:2}), types['.json']);
    if (url.pathname === '/api/books') {
      const target = new URL('https://gutendex.com/books/');
      for (const key of ['search','topic']) if (url.searchParams.get(key)) target.searchParams.set(key, url.searchParams.get(key).slice(0, 200));
      target.searchParams.set('page', String(Math.max(1, Math.min(3000, Number.parseInt(url.searchParams.get('page'), 10) || 1))));
      const result = await upstream(target.href);
      return send(res, 200, result.body, types['.json'], {'Cache-Control':'public, max-age=300'});
    }
    if (url.pathname === '/api/series') {
      const kind = url.searchParams.get('kind');
      if (!['manga','anime'].includes(kind)) return send(res, 400, 'Choose manga or anime');
      const target = new URL(`https://api.jikan.moe/v4/${kind}`);
      target.searchParams.set('sfw', 'true'); target.searchParams.set('limit', '24');
      target.searchParams.set('page', String(Math.max(1, Math.min(1000, Number.parseInt(url.searchParams.get('page'), 10) || 1))));
      if (url.searchParams.get('q')) target.searchParams.set('q', url.searchParams.get('q').slice(0, 150));
      else { target.searchParams.set('order_by','members'); target.searchParams.set('sort','desc'); }
      const result = await upstream(target.href, 3600000);
      return send(res, 200, result.body, types['.json'], {'Cache-Control':'public, max-age=600'});
    }
    if (url.pathname === '/api/read') {
      const id = url.searchParams.get('id');
      if (!/^\d{1,7}$/.test(id || '')) return send(res, 400, 'Invalid book');
      // Serve the downloaded edition first even if the client has older metadata.
      try { return send(res, 200, await readFile(resolve(root, 'books', `${id}.txt`)), types['.txt']); } catch {}
      const result = await upstream(`https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`, 86400000);
      return send(res, 200, result.body, types['.txt'], {'Cache-Control':'public, max-age=3600'});
    }
    let decoded;
    try { decoded = decodeURIComponent(url.pathname); } catch { return send(res, 400, 'Invalid path'); }
    const file = resolve(root, '.' + (decoded === '/' ? '/index.html' : decoded));
    if (!isWithinRoot(root, file)) return send(res, 403, 'Access denied');
    const info = await stat(file); if (!info.isFile()) return send(res, 404, 'Not found');
    const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const ext = extname(file);
    const headers = {'ETag':etag,'Cache-Control':['.jpg','.png','.webp','.txt'].includes(ext) ? 'public, max-age=3600' : 'no-cache','Vary':'Accept-Encoding'};
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
    if (req.method === 'HEAD') return send(res, 200, '', types[ext], headers);
    const canCompress = /\bgzip\b/.test(req.headers['accept-encoding'] || '') && ['.html','.js','.css','.txt','.json','.svg'].includes(ext);
    let data;
    if (canCompress) {
      const key = file + ':' + etag;
      data = compressed.get(key);
      if (!data) { data = await zip(await readFile(file)); if (compressed.size >= 40) compressed.delete(compressed.keys().next().value); compressed.set(key, data); }
      headers['Content-Encoding'] = 'gzip';
    } else data = await readFile(file);
    return send(res, 200, data, types[ext] || 'application/octet-stream', headers);
  } catch (error) {
    const api = req.url.startsWith('/api/');
    send(res, api ? 502 : 404, api ? 'This catalog is temporarily unavailable. Downloaded books still work; please try again shortly.' : 'Not found');
  }
}).listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => {
  console.log(`Folio is ready: http://127.0.0.1:${Number(process.env.PORT) || 3000}`);
  console.log('Keep this window open while using the library.');
});
