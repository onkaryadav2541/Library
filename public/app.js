import {BookReader} from './reader.js';
import {mergeBooks,orderVolumes,volumeInfo,orderEpisodes} from './catalog-utils.js';
const $ = selector => document.querySelector(selector);
const readStored = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const store = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let saved = readStored('folio-saved', []), history = readStored('folio-history', []), positions = readStored('folio-positions', {});
let catalog = [], seeds = [], remote = [], kind = 'book', genre = 'all', view = 'discover', query = '', sortTitle = false;
let windowStart=0;
let visible = 24, nextPage = 1, hasMore = true, loading = false, serverMode = false, requestId = 0, controller;
let toastTimer, searchTimer, saveTimer, renderFrame;
let providerFilter='all',inAppOnly=false;
const providerNames={gutenberg:'Project Gutenberg',openlibrary:'Open Library',googlebooks:'Google Books',anilist:'AniList',jikan:'Jikan',kitsu:'Kitsu'};
let sourceState=new Map();
const activeProviders=()=>kind==='book'?(serverMode?['gutenberg','openlibrary','googlebooks']:['gutenberg']):(serverMode?['anilist','jikan','kitsu']:['jikan']);
const queueRender=()=>{cancelAnimationFrame(renderFrame);renderFrame=requestAnimationFrame(render);};
const keyOf = b => String(b.id);
const kindOf = b => b.kind || 'book';
const titleCase = s => s.charAt(0).toUpperCase() + s.slice(1);
function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3300); }
function allBooks() { return mergeBooks([...catalog, ...seeds, ...remote, ...saved, ...history]); }
function findBook(id) { return allBooks().find(b => keyOf(b) === String(id) || b.editions?.some(e=>String(e.id)===String(id))); }
function selectedBooks() {
  const list = view === 'saved' ? mergeBooks(saved) : view === 'history' ? mergeBooks(history) : allBooks();
  const remoteIds=new Set(remote.map(keyOf));
  return list.filter(b => kindOf(b) === kind && (providerFilter==='all'||b.provider===providerFilter||b.editions?.some(e=>e.provider===providerFilter)) && (!inAppOnly||kind!=='book'||b.reader==='text'||b.local) && (genre === 'all' || b.genre === genre) && (!query || remoteIds.has(keyOf(b)) || `${b.title} ${b.author} ${(b.tags || []).join(' ')}`.toLowerCase().includes(query.toLowerCase())))
    .sort((a, b) => sortTitle ? a.title.localeCompare(b.title) : 0);
}
function render() {
  const list = selectedBooks();
  $('#saved-count').textContent = saved.length;
  $('#section-title').textContent = view === 'saved' ? 'Your shelf. Your kind of stories.' : view === 'history' ? 'Welcome back to your next chapter.' : kind === 'manga' ? 'A whole universe in every panel.' : kind === 'anime' ? 'Find your next favorite universe.' : 'What are you in the mood for?';
  $('#catalog-title').textContent = view === 'saved' ? 'Saved for a good moment' : view === 'history' ? 'Pick up where you left off' : query ? `Results for “${query}”` : kind === 'manga' ? 'Stories beyond the ordinary' : kind === 'anime' ? 'Your next watchlist' : genre !== 'all' ? `${titleCase(genre)} to get lost in` : 'Worth staying up for';
  $('#result-count').textContent = `${list.length?windowStart+1:0}–${Math.min(visible, list.length)} of ${list.length} ${kind === 'book' ? 'on this shelf' : 'series'}`;
  $('#books').innerHTML = list.length ? list.slice(windowStart, visible).map(b => {
    const kept = saved.some(s => keyOf(s) === keyOf(b));
    const cover = safeImage(b.cover || `/covers/${b.id}.jpg`);
    const label = kindOf(b) === 'book' ? b.reader==='external'?'Read free ↗':b.volume!=null?'Select volume':'Read book' : 'Explore series';
    return `<article class="book-card"><div class="cover-wrap"><button class="cover" data-read="${escapeHtml(b.id)}" aria-label="${label}: ${escapeHtml(b.title)}"><img src="${escapeHtml(cover)}" alt="${escapeHtml(b.title)} cover" width="200" height="300" loading="lazy" decoding="async"></button><button class="save-book ${kept ? 'saved' : ''}" data-save="${escapeHtml(b.id)}" aria-label="${kept ? 'Remove from' : 'Add to'} bookshelf: ${escapeHtml(b.title)}" aria-pressed="${kept}">${kept ? '♥' : '♡'}</button><button class="read-overlay" data-read="${escapeHtml(b.id)}">${label} ↗</button></div><div class="book-info"><h4 title="${escapeHtml(b.title)}">${escapeHtml(b.title)}</h4><p>${escapeHtml(b.author)}</p><div class="book-meta"><span class="genre-label">${escapeHtml(b.genre || b.kind || 'classics')}</span><span class="availability ${b.local ? 'local' : ''}">${kindOf(b) !== 'book' ? 'Series guide' : b.local ? 'Ready to read' : b.reader==='external'?'Read at source':'Free full text'}</span></div><span class="book-source">${escapeHtml(b.source||'Project Gutenberg')}${b.volume!=null?' · Vol. '+escapeHtml(b.volume):''}</span></div></article>`;
  }).join('') : `<div class="empty-state"><h3>${view === 'saved' ? 'Make a little room for your favorites.' : view === 'history' ? 'Your next chapter starts here.' : loading ? 'Looking through the shelves…' : 'Let’s try another shelf.'}</h3><p>${view === 'saved' ? 'Tap a heart on a book or series to keep it here.' : view === 'history' ? 'Open a book and your reading progress will appear here.' : loading ? 'Searching the online collection.' : 'Try a different title, author, or genre.'}</p></div>`;
  document.querySelectorAll('.cover img').forEach(img => img.addEventListener('error', () => {
    const fallback = document.createElement('span'); fallback.className = 'cover-fallback'; fallback.textContent = img.alt.replace(/ cover$/, ''); img.replaceWith(fallback);
  }, {once:true}));
  $('#previous-results').hidden=windowStart===0;
  const personal = ['saved','history'].includes(view);
  $('#load-more').hidden = personal ? visible >= list.length : !hasMore && visible >= list.length;
  $('#load-more').textContent = visible<list.length?'Show more ↓':loading?'Finding more…':'Explore more ↓';
  $('#load-more').disabled = loading && visible>=list.length;
  $('.genres').hidden = kind !== 'book';
  renderSources();
  $('#search').placeholder = kind === 'book' ? 'Search titles, authors, or your next favorite…' : `Search ${kind} titles…`;
}
function safeImage(value) {
  try { const url = new URL(value, location.origin); return url.protocol === 'https:' || url.origin === location.origin ? url.href : ''; } catch { return ''; }
}

const reader = new BookReader({
  getPosition: id => positions[id],
  savePosition: (id, position) => { positions[id] = position; clearTimeout(saveTimer); saveTimer = setTimeout(() => store('folio-positions', positions), 150); },
  onRead: book => { history = [book, ...history.filter(b => keyOf(b) !== keyOf(book))].slice(0, 100); store('folio-history', history); if (view === 'history') render(); },
  toast,
  fetchText: async book => {
    const url = book.local ? `/books/${book.id}.txt` : serverMode ? `/api/read?id=${book.id}` : book.textUrl || `https://www.gutenberg.org/ebooks/${book.id}.txt.utf-8`;
    const response = await fetch(url, {signal: AbortSignal.timeout(25000)});
    if (!response.ok) throw Error('Book unavailable');
    return response.text();
  }
});
window.addEventListener('pagehide', () => store('folio-positions', positions));

$('#books').addEventListener('click', event => {
  const save = event.target.closest('[data-save]'), read = event.target.closest('[data-read]');
  if (save) {
    const book = findBook(save.dataset.save); if (!book) return;
    if (saved.some(b => keyOf(b) === keyOf(book))) { saved = saved.filter(b => keyOf(b) !== keyOf(book)); toast('Removed from your bookshelf.'); }
    else { saved.push(book); toast('Saved to your bookshelf.'); }
    store('folio-saved', saved); render();
  } else if (read) openBook(findBook(read.dataset.read));
});
document.querySelectorAll('[data-featured]').forEach(button => button.onclick = () => openBook(findBook(button.dataset.featured)));
function openBook(book) { if (!book) return; if (kindOf(book) === 'book' && book.reader!=='external' && book.volume==null) readInApp(book); else openDetails(book); }

const topicFor = g => ({'sci-fi':'science fiction',science:'science',children:'children',horror:'horror'}[g] || g);
function categorize(book) {
  const text = [...(book.subjects || []), ...(book.bookshelves || [])].join(' ').toLowerCase();
  for (const [needle, category] of [['love stories','romance'],['romance','romance'],['detective','mystery'],['mystery','mystery'],['science fiction','sci-fi'],['fantasy','fantasy'],['fairy','fantasy'],['children','children'],['philosophy','philosophy'],['science','science'],['poetry','poetry'],['adventure','adventure'],['history','history'],['gothic','horror'],['horror','horror']]) if (text.includes(needle)) return category;
  return 'classics';
}
function normalizeBook(book) {
  const local = catalog.find(b => b.id === book.id);
  return {id: book.id, title: book.title, author: book.authors.map(a => a.name.split(', ').reverse().join(' ')).join(', ') || 'Unknown author', genre: genre !== 'all' ? genre : categorize(book), tags: book.subjects, kind:'book', cover: local?.cover || book.formats['image/jpeg'], local:!!local?.local, textUrl: Object.entries(book.formats).find(([type]) => type.startsWith('text/plain') && type.includes('utf-8'))?.[1], sourceUrl:`https://www.gutenberg.org/ebooks/${book.id}`};
}
function normalizeSeries(series) {
  return {id:`${kind}-${series.mal_id}`, kind, title:series.title_english || series.title, author:series.authors?.map(a => a.name).join(', ') || series.studios?.map(a => a.name).join(', ') || (kind === 'manga' ? 'Manga series' : 'Anime series'), genre:kind, tags:series.genres?.map(g => g.name), cover:series.images?.jpg?.large_image_url || series.images?.jpg?.image_url, description:series.synopsis || '', score:series.score, status:series.status, episodes:series.episodes, sourceUrl:series.url, officialUrl:'https://mangaplus.shueisha.co.jp/'};
}
function renderSources(){
 const providers=activeProviders();
 const select=$('#provider-filter');
 const options=['all',...providers];
 if(select.dataset.kinds!==options.join(',')){
  select.innerHTML='<option value="all">All sources</option>'+providers.map(p=>`<option value="${p}">${providerNames[p]}</option>`).join('');select.dataset.kinds=options.join(',');
 }
 if(!options.includes(providerFilter))providerFilter='all';select.value=providerFilter;
 $('#in-app-only').closest('label').hidden=kind!=='book';
 $('#source-status').innerHTML=providers.map(p=>{const state=sourceState.get(p);return `<span class="source-pill ${state?.loading?'loading':state?.error?'unavailable':''}">${providerNames[p]} <small>${state?.loading?'Searching':state?.error?'Unavailable':state?.count!=null?state.count+' found':'Ready'}</small></span>`}).join('')+(Array.from(sourceState.values()).some(s=>s.error)?'<button id="retry-sources">Retry unavailable sources</button>':'');
 const retry=$('#retry-sources');if(retry)retry.onclick=()=>loadRemote({retry:true});
 $('#source-summary').textContent=serverMode?'Results arrive as each source responds.':'Use npm start for all six sources and full reading access.';
}
$('#provider-filter').onchange=event=>{providerFilter=event.target.value;windowStart=0;visible=24;render();};
$('#in-app-only').onchange=event=>{inAppOnly=event.target.checked;windowStart=0;visible=24;render();};
function getCached(key){try{const value=JSON.parse(sessionStorage.getItem(key));return value&&Date.now()-value.time<300000?value.data:null;}catch{return null;}}
function cacheResult(key,data){try{const keys=Object.keys(sessionStorage).filter(k=>k.startsWith('folio-api-v3:'));if(keys.length>=45)sessionStorage.removeItem(keys[0]);sessionStorage.setItem(key,JSON.stringify({time:Date.now(),data}));}catch{}}
async function loadRemote({reset=false,silent=false,retry=false}={}){
 if(['saved','history'].includes(view))return;
 if(loading&&!reset&&!retry)return;
 if(reset){controller?.abort();requestId++;remote=[];sourceState=new Map();}
 const generation=requestId;
 controller=controller?.signal.aborted||reset||!controller?new AbortController():controller;
 const waveSignal=controller.signal;
 const providers=activeProviders().filter(p=>retry?sourceState.get(p)?.error:reset||!sourceState.has(p)||sourceState.get(p)?.hasMore);
 if(!providers.length)return;
 providers.forEach(p=>sourceState.set(p,{...sourceState.get(p),loading:true,error:false}));loading=true;if(!silent)render();
 await Promise.allSettled(providers.map(async provider=>{
  const previous=sourceState.get(provider),page=reset?1:previous?.page||1;
  const params=new URLSearchParams({provider,kind,q:query,genre,page:String(page)}),cacheKey='folio-api-v3:'+params;
  try{
   let data=getCached(cacheKey);
   if(!data){
    let url=serverMode?`/api/discover?${params}`:null;
    if(!url){
     if(kind==='book'){const direct=new URLSearchParams({page:String(page)});if(query)direct.set('search',query);if(genre!=='all')direct.set('topic',topicFor(genre));url=`https://gutendex.com/books/?${direct}`;}
     else {const direct=new URLSearchParams({page:String(page),sfw:'true',limit:'24'});if(query)direct.set('q',query);else{direct.set('order_by','members');direct.set('sort','desc');}url=`https://api.jikan.moe/v4/${kind}?${direct}`;}
    }
    const response=await fetch(url,{signal:AbortSignal.any([waveSignal,AbortSignal.timeout(6500)])});if(!response.ok)throw Error();data=await response.json();
    if(!serverMode)data=kind==='book'?{books:data.results.filter(b=>Object.keys(b.formats).some(t=>t.startsWith('text/plain'))).map(normalizeBook),hasMore:!!data.next,total:data.count}:{books:data.data.map(normalizeSeries),hasMore:!!data.pagination?.has_next_page};
    cacheResult(cacheKey,data);
   }
   if(generation!==requestId||waveSignal.aborted)return;
   const books=data.books.map(b=>{
    const local=catalog.find(c=>String(c.id)===String(b.id));
    return {...b,provider:b.provider||provider,...(local?{local:true,reader:'text',cover:local.cover}:{} )};
   });
   remote.push(...books);
   sourceState.set(provider,{loading:false,error:false,page:page+1,hasMore:data.hasMore,count:(previous?.count||0)+books.length,total:data.total});
   if(provider==='gutenberg'&&!query&&genre==='all'&&data.total)$('#catalog-total').textContent=data.total.toLocaleString();
  }catch(error){
   if(generation!==requestId||waveSignal.aborted)return;
   sourceState.set(provider,{...previous,loading:false,error:true,page,hasMore:true});
  }finally{
   if(generation===requestId&&!waveSignal.aborted){loading=Array.from(sourceState.values()).some(s=>s.loading);hasMore=Array.from(sourceState.values()).some(s=>s.hasMore||s.error);queueRender();}
  }
 }));
}
$('#previous-results').onclick=()=>{windowStart=Math.max(0,windowStart-24);visible=windowStart+24;render();$('.catalog').scrollIntoView({behavior:'smooth',block:'start'});};
$('#load-more').onclick=async()=>{
 const before=visible,generation=requestId;
 if(visible>=selectedBooks().length)await loadRemote();
 if(generation!==requestId)return;
 if(selectedBooks().length>before){windowStart=before;visible=before+24;render();$('.catalog').scrollIntoView({behavior:'smooth',block:'start'});}
};
function resetResults() { windowStart=0;visible=24;controller?.abort();requestId++;loading=false;remote=[];sourceState=new Map();hasMore=true;render(); }
$('#search').addEventListener('input', event => { query = event.target.value.trim(); resetResults(); clearTimeout(searchTimer); searchTimer = setTimeout(() => loadRemote({reset:true}), 450); });
$('#search').addEventListener('keydown', event => { if (event.key === 'Enter') { clearTimeout(searchTimer); loadRemote({reset:true}); } });
$('.genres').onclick = event => {
  const button = event.target.closest('[data-genre]'); if (!button) return;
  genre = button.dataset.genre; document.querySelectorAll('[data-genre]').forEach(b => b.classList.toggle('selected', b === button));
  resetResults(); loadRemote({reset:true});
};
document.querySelectorAll('[data-kind]').forEach(button => button.onclick = () => {
  kind = button.dataset.kind; providerFilter='all';inAppOnly=false;$('#in-app-only').checked=false;query = ''; genre = 'all'; $('#search').value = '';
  document.querySelectorAll('[data-kind]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-selected', b === button); });
  document.querySelectorAll('[data-genre]').forEach(b => b.classList.toggle('selected', b.dataset.genre === 'all'));
  $('#notice').textContent = ''; resetResults(); loadRemote({reset:true});
});
function setView(next) {
  view = next; genre = 'all'; query = ''; $('#search').value = '';windowStart=0;visible = 24;
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('[data-genre]').forEach(b => b.classList.toggle('selected', b.dataset.genre === 'all'));
  if (['saved','history'].includes(view)) { controller?.abort(); requestId++; loading = false; $('#notice').textContent = ''; }
  render(); if (view !== 'discover') $('#discovery').scrollIntoView({behavior:'smooth'});
}
document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => setView(button.dataset.view));
$('#avatar').onclick = () => setView('saved');
$('#explore').onclick = () => $('#discovery').scrollIntoView({behavior:'smooth'});
$('#sort').onclick = () => { sortTitle = !sortTitle; $('#sort span').textContent = sortTitle ? 'Title A–Z' : 'Popular'; render(); };
$('#ambient').onclick = () => { const quiet = document.body.classList.toggle('quiet'); $('#ambient').setAttribute('aria-pressed',quiet); $('#ambient').innerHTML = `${quiet ? 'Switch to daylight' : 'Switch to evening mode'} <span>◐</span>`; };
$('#surprise').onclick = () => { const books = selectedBooks(); if (books.length) openBook(books[Math.floor(Math.random()*books.length)]); else toast('Try another collection to find a story.'); };

const allowedHosts=new Set(['myanimelist.net','anilist.co','www.viz.com','mangaplus.shueisha.co.jp','openlibrary.org','archive.org','www.gutenberg.org','books.google.com','www.google.com','play.google.com','www.crunchyroll.com','crunchyroll.com','www.youtube.com','youtube.com','www.hidive.com','hidive.com','www.netflix.com','netflix.com','www.bilibili.tv','bilibili.tv','www.adultswim.com','kitsu.io','kitsu.app']);
function externalURL(value){try{const url=new URL(value);return url.protocol==='https:'&&allowedHosts.has(url.hostname)?url.href:null;}catch{return null;}}
let detailToken=0,detailAbort;
function closeDetails(){detailToken++;detailAbort?.abort();$('#details').close();}
function readInApp(book){
 const volumes=orderVolumes(allBooks(),book).filter(b=>b.local||b.reader==='text');
 const select=$('#reader-volume');select.hidden=volumes.length<2;
 select.innerHTML=volumes.map(b=>`<option value="${escapeHtml(b.id)}">Volume ${b.volume}</option>`).join('');select.value=String(book.id);
 reader.open(book);
}
$('#reader-volume').onchange=event=>{const book=findBook(event.target.value);if(book)readInApp(book);};
function openDetails(book){
 const token=++detailToken;detailAbort?.abort();detailAbort=new AbortController();
 const type=kindOf(book),isBook=type==='book',manga=type==='manga';
 const source=externalURL(book.sourceUrl)||(!isBook?`https://myanimelist.net/${type}/${String(book.id).split('-').pop()}`:null);
 const official=externalURL(book.officialUrl)||'https://mangaplus.shueisha.co.jp/';
 const readUrl=externalURL(book.readUrl||source);
 const volumes=isBook?orderVolumes(allBooks(),book):[];
 const stats=[book.volumes?`<span>Published volumes<strong>${escapeHtml(book.volumes)}</strong></span>`:'',book.chapters?`<span>Chapters<strong>${escapeHtml(book.chapters)}</strong></span>`:'',book.episodes?`<span>Episodes<strong>${escapeHtml(book.episodes)}</strong></span>`:'',book.year?`<span>First published<strong>${escapeHtml(String(book.year).slice(0,4))}</strong></span>`:''].join('');
 const primary=isBook?(book.reader==='external'?`<a class="primary" href="${escapeHtml(readUrl||source)}" target="_blank" rel="noopener noreferrer">Read free at ${escapeHtml(book.source||'source')} ↗</a>`:'<button class="primary" id="detail-read">Read this volume →</button>'):`<a class="primary" href="${escapeHtml(manga?official:source)}" target="_blank" rel="noopener noreferrer">${manga?'Find official chapters':'Explore series guide'} ↗</a>`;
 $('#detail-content').innerHTML=`<div class="detail-layout"><img class="detail-cover" src="${escapeHtml(safeImage(book.cover))}" alt="${escapeHtml(book.title)} cover"><div class="detail-copy"><div class="eyebrow">${isBook?'FREE BOOK COLLECTION':manga?'MANGA COLLECTION':'ANIME DISCOVERY'}</div><h2>${escapeHtml(book.title)}</h2><div class="detail-meta">${escapeHtml(book.author)}${book.score?' · '+escapeHtml(book.score)+'/10':''}</div><div class="detail-stat-grid">${stats}</div><p>${escapeHtml(book.description||(isBook?'Choose an available edition and start reading.':'Explore the story and its place in the series.'))}</p>${primary}<p class="source-note">${isBook?'Free reading is supplied by '+escapeHtml(book.source||'Project Gutenberg')+'.':manga?'Official reading opens on the publisher’s website. Free chapters and availability vary by title and region.':'Episode guides and official streaming links appear below when the source supplies them.'}</p>${source?`<a class="secondary" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Source details ↗</a>`:''}</div></div><div id="detail-extra" class="detail-extra"></div>`;
 if(!$('#details').open)$('#details').showModal();
 const read=$('#detail-read');if(read)read.onclick=()=>{closeDetails();readInApp(book);};
 if(isBook){
  const host=$('#detail-extra');
  host.innerHTML=(book.seriesTitle?`<h3>${escapeHtml(book.seriesTitle)} · Volumes</h3><p class="detail-collection-note">Available volumes from the current results, in numeric order.</p><div class="volume-picker">${volumes.map(b=>`<button data-volume="${escapeHtml(b.id)}" class="${String(b.id)===String(book.id)?'current':''}">Vol. ${b.volume}</button>`).join('')}</div><button id="find-volumes" class="secondary">Find more volumes</button>`:'')+(book.editions?.length?`<h3>Other free editions</h3><div class="detail-sources">${book.editions.filter(e=>externalURL(e.readUrl||e.sourceUrl)).map(e=>`<a href="${escapeHtml(externalURL(e.readUrl||e.sourceUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(e.source||'View edition')} ↗</a>`).join('')}</div>`:'');
  host.querySelectorAll('[data-volume]').forEach(button=>button.onclick=()=>openDetails(findBook(button.dataset.volume)));
  if($('#find-volumes'))$('#find-volumes').onclick=()=>{closeDetails();kind='book';setView('browse');query=book.seriesTitle;$('#search').value=query;resetResults();loadRemote({reset:true});};
 }else loadSeriesDetail(book,token);
}
async function loadSeriesDetail(book,token,page=1){
 const host=$('#detail-extra');host.innerHTML='<p class="detail-status">Finding the series guide…</p>';
 if(!serverMode){host.innerHTML='<p class="detail-status">Start the full library with npm start to load episode and series details.</p>';return;}
 const malId=book.malId||String(book.id).match(/^(?:manga|anime)-(\d+)$/)?.[1];
 const providers=[];if(book.anilistId)providers.push({provider:'anilist',id:book.anilistId});if(book.kitsuId)providers.push({provider:'kitsu',id:book.kitsuId});if(malId)providers.push({provider:'jikan',id:malId});
 let result=null;
 for(const provider of providers){
  try{
   const params=new URLSearchParams({...provider,kind:book.kind,page:String(page)}),key='folio-api-v3:detail:'+params;
   result=getCached(key);
   if(!result){const response=await fetch(`/api/series-details?${params}`,{signal:AbortSignal.any([detailAbort.signal,AbortSignal.timeout(6000)])});if(!response.ok)throw Error();result=await response.json();cacheResult(key,result);}
   break;
  }catch{if(token!==detailToken||detailAbort.signal.aborted)return;}
 }
 if(token!==detailToken)return;
 if(!result){host.innerHTML='<p class="detail-status">The episode guide is temporarily unavailable. The official source link above is still available.</p>';return;}
 const updated=result.book||book;
 if(updated.volumes||updated.chapters||updated.episodes){$('.detail-stat-grid').innerHTML=[['Published volumes',updated.volumes],['Chapters',updated.chapters],['Episodes',updated.episodes]].filter(([,n])=>n!=null).map(([label,n])=>`<span>${label}<strong>${escapeHtml(n)}</strong></span>`).join('');}
 const episodes=orderEpisodes(result.episodes||[]).filter(e=>externalURL(e.url));
 host.innerHTML=(book.kind==='manga'?`<h3>Volumes & chapters</h3><p class="detail-collection-note">${updated.volumes?escapeHtml(updated.volumes)+' published volumes. ':''}${updated.chapters?escapeHtml(updated.chapters)+' chapters. ':''}This source does not supply individual licensed volume files. Use the official publisher’s chapter selector for available reading.</p>`:'')+(episodes.length?`<h3>${result.unit==='chapters'?'Chapters':'Episodes'} · ${page>1?'page '+page:'in order'}</h3><ol class="episode-list">${episodes.map(e=>`<li><a href="${escapeHtml(externalURL(e.url))}" target="_blank" rel="noopener noreferrer"><span class="episode-number">${escapeHtml(e.number)}</span><span>${escapeHtml(e.title)}${e.filler?' · Filler':e.recap?' · Recap':''}</span><small>${escapeHtml(e.site||'Guide')} ↗</small></a></li>`).join('')}</ol>`:book.kind==='anime'?'<p class="detail-collection-note">This source has no episode list available. Use the series guide for more information.</p>':'')+(result.hasMore?`<button id="more-episodes" class="secondary detail-more">Next ${result.unit==='chapters'?'chapters':'episodes'} →</button>`:'')+(result.relations?.length?`<h3 style="margin-top:24px">Related stories</h3><p class="detail-collection-note">Source-provided prequels, sequels, and side stories.${result.relations.some(r=>r.date?.year)?' Listed by release date.':''}</p><div class="relation-list">${result.relations.filter(r=>externalURL(r.url)).map(r=>`<a href="${escapeHtml(externalURL(r.url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(r.title)} <span>${escapeHtml(String(r.relation).replaceAll('_',' '))}${r.date?.year?' · '+r.date.year:''} ↗</span></a>`).join('')}</div>`:'');
 if($('#more-episodes'))$('#more-episodes').onclick=()=>loadSeriesDetail(book,token,page+1);
}
$('#close-details').onclick=closeDetails;
$('#details').addEventListener('cancel',()=>{detailToken++;detailAbort?.abort();});
$('#details').addEventListener('click', event => { if (event.target === $('#details')) { const r = $('#details').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDetails(); } });

// Render local content first. Remote catalogs and server detection never block it.
try {
  const response = await fetch('/catalog.json'); if (!response.ok) throw Error(); catalog = (await response.json()).map(b=>({...b,provider:'gutenberg',source:'Project Gutenberg',reader:'text',access:'full'})); render();
} catch { $('#notice').textContent = 'Could not load the downloaded collection. Refresh the page to try again.'; }
fetch('/series.json').then(r => r.json()).then(data => { seeds = data; if (kind !== 'book') render(); }).catch(() => {});
try { const response = await fetch('/api/health', {signal:AbortSignal.timeout(1500)}); const health=response.ok?await response.json():{};serverMode=health.service==='folio'&&health.version>=3; } catch {}
loadRemote({reset:true, silent:true});
