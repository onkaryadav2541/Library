import {BookReader} from './reader.js';
const $ = selector => document.querySelector(selector);
const readStored = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const store = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} };
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let saved = readStored('folio-saved', []), history = readStored('folio-history', []), positions = readStored('folio-positions', {});
let catalog = [], seeds = [], remote = [], kind = 'book', genre = 'all', view = 'discover', query = '', sortTitle = false;
let visible = 24, nextPage = 1, hasMore = true, loading = false, serverMode = false, requestId = 0, controller;
let toastTimer, searchTimer, saveTimer;
const keyOf = b => String(b.id);
const kindOf = b => b.kind || 'book';
const titleCase = s => s.charAt(0).toUpperCase() + s.slice(1);
function toast(text) { $('#toast').textContent = text; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3300); }
function allBooks() { return [...new Map([...catalog, ...seeds, ...remote, ...saved, ...history].map(b => [keyOf(b), b])).values()]; }
function findBook(id) { return allBooks().find(b => keyOf(b) === String(id)); }
function selectedBooks() {
  const list = view === 'saved' ? saved : view === 'history' ? history : allBooks();
  return list.filter(b => kindOf(b) === kind && (genre === 'all' || b.genre === genre) && (!query || `${b.title} ${b.author} ${(b.tags || []).join(' ')}`.toLowerCase().includes(query.toLowerCase())))
    .sort((a, b) => sortTitle ? a.title.localeCompare(b.title) : 0);
}
function render() {
  const list = selectedBooks();
  $('#saved-count').textContent = saved.length;
  $('#section-title').textContent = view === 'saved' ? 'Your shelf. Your kind of stories.' : view === 'history' ? 'Welcome back to your next chapter.' : kind === 'manga' ? 'A whole universe in every panel.' : kind === 'anime' ? 'Find your next favorite universe.' : 'What are you in the mood for?';
  $('#catalog-title').textContent = view === 'saved' ? 'Saved for a good moment' : view === 'history' ? 'Pick up where you left off' : query ? `Results for “${query}”` : kind === 'manga' ? 'Stories beyond the ordinary' : kind === 'anime' ? 'Your next watchlist' : genre !== 'all' ? `${titleCase(genre)} to get lost in` : 'Worth staying up for';
  $('#result-count').textContent = `${Math.min(visible, list.length)} of ${list.length} ${kind === 'book' ? 'on this shelf' : 'series'}`;
  $('#books').innerHTML = list.length ? list.slice(0, visible).map(b => {
    const kept = saved.some(s => keyOf(s) === keyOf(b));
    const cover = safeImage(b.cover || `/covers/${b.id}.jpg`);
    const label = kindOf(b) === 'book' ? 'Read book' : 'Explore series';
    return `<article class="book-card"><div class="cover-wrap"><button class="cover" data-read="${escapeHtml(b.id)}" aria-label="${label}: ${escapeHtml(b.title)}"><img src="${escapeHtml(cover)}" alt="${escapeHtml(b.title)} cover" width="200" height="300" loading="lazy" decoding="async"></button><button class="save-book ${kept ? 'saved' : ''}" data-save="${escapeHtml(b.id)}" aria-label="${kept ? 'Remove from' : 'Add to'} bookshelf: ${escapeHtml(b.title)}" aria-pressed="${kept}">${kept ? '♥' : '♡'}</button><button class="read-overlay" data-read="${escapeHtml(b.id)}">${label} ↗</button></div><div class="book-info"><h4 title="${escapeHtml(b.title)}">${escapeHtml(b.title)}</h4><p>${escapeHtml(b.author)}</p><div class="book-meta"><span class="genre-label">${escapeHtml(b.genre || b.kind || 'classics')}</span><span class="availability ${b.local ? 'local' : ''}">${kindOf(b) !== 'book' ? 'Series guide' : b.local ? 'Ready to read' : 'Free full text'}</span></div></div></article>`;
  }).join('') : `<div class="empty-state"><h3>${view === 'saved' ? 'Make a little room for your favorites.' : view === 'history' ? 'Your next chapter starts here.' : loading ? 'Looking through the shelves…' : 'Let’s try another shelf.'}</h3><p>${view === 'saved' ? 'Tap a heart on a book or series to keep it here.' : view === 'history' ? 'Open a book and your reading progress will appear here.' : loading ? 'Searching the online collection.' : 'Try a different title, author, or genre.'}</p></div>`;
  document.querySelectorAll('.cover img').forEach(img => img.addEventListener('error', () => {
    const fallback = document.createElement('span'); fallback.className = 'cover-fallback'; fallback.textContent = img.alt.replace(/ cover$/, ''); img.replaceWith(fallback);
  }, {once:true}));
  const personal = ['saved','history'].includes(view);
  $('#load-more').hidden = personal ? visible >= list.length : !hasMore && visible >= list.length;
  $('#load-more').textContent = loading ? 'Looking through the shelves…' : 'Explore more ↓';
  $('#load-more').disabled = loading;
  $('.genres').hidden = kind !== 'book';
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
function openBook(book) { if (!book) return; if (kindOf(book) === 'book') reader.open(book); else openDetails(book); }

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
async function loadRemote({reset = false, silent = false} = {}) {
  if (['saved','history'].includes(view)) return;
  if (loading && !reset) return;
  if (reset) { controller?.abort(); remote = []; nextPage = 1; hasMore = true; }
  const id = ++requestId; controller = new AbortController(); const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(18000)]);
  loading = true; if (!silent) render();
  const activeKind = kind;
  const params = new URLSearchParams({page: String(nextPage)});
  let url;
  if (kind === 'book') {
    if (query) params.set('search', query);
    if (genre !== 'all') params.set('topic', topicFor(genre));
    url = serverMode ? `/api/books?${params}` : `https://gutendex.com/books/?${params}`;
  } else {
    params.set('kind', kind); if (query) params.set('q', query);
    if (serverMode) url = `/api/series?${params}`;
    else {
      const direct = new URLSearchParams({page:String(nextPage), sfw:'true', limit:'24'});
      if (query) direct.set('q', query);
      else { direct.set('order_by', 'members'); direct.set('sort', 'desc'); }
      url = `https://api.jikan.moe/v4/${kind}?${direct}`;
    }
  }
  try {
    const response = await fetch(url, {signal}); if (!response.ok) throw Error('Catalog unavailable');
    const data = await response.json(); if (id !== requestId) return;
    if (activeKind === 'book') {
      remote.push(...data.results.filter(b => Object.keys(b.formats).some(t => t.startsWith('text/plain'))).map(normalizeBook));
      hasMore = !!data.next;
      if (!query && genre === 'all' && data.count) { $('#catalog-total').textContent = data.count.toLocaleString(); document.querySelector('[data-kind="book"] span').textContent = `${Math.floor(data.count / 1000)}k+`; }
      $('#notice').textContent = query || genre !== 'all' ? `${data.count.toLocaleString()} matches in the online catalog. More results load below.` : '';
    } else {
      remote.push(...data.data.map(normalizeSeries)); hasMore = !!data.pagination?.has_next_page;
      $('#notice').textContent = activeKind === 'manga' ? 'Discover manga and find official chapters. Availability and free chapters depend on the publisher and your region.' : 'Anime is a series-discovery collection. Open a title for its synopsis, rating, and series guide.';
    }
    nextPage++;
  } catch (error) {
    if (id !== requestId || error.name === 'AbortError') return;
    $('#notice').textContent = activeKind === 'book' ? 'The online catalog could not be reached. Downloaded books are still ready to read. Try again with Explore more.' : 'The live series catalog is unavailable right now. You can still explore the featured titles below.';
  } finally { if (id === requestId) { loading = false; render(); } }
}
$('#load-more').onclick = () => {
  if (visible < selectedBooks().length) { visible += 24; render(); }
  else { visible += 24; loadRemote(); }
};
function resetResults() { visible = 24; controller?.abort(); requestId++; loading = false; remote = []; nextPage = 1; hasMore = true; render(); }
$('#search').addEventListener('input', event => { query = event.target.value.trim(); resetResults(); clearTimeout(searchTimer); searchTimer = setTimeout(() => loadRemote({reset:true}), 450); });
$('#search').addEventListener('keydown', event => { if (event.key === 'Enter') { clearTimeout(searchTimer); loadRemote({reset:true}); } });
$('.genres').onclick = event => {
  const button = event.target.closest('[data-genre]'); if (!button) return;
  genre = button.dataset.genre; document.querySelectorAll('[data-genre]').forEach(b => b.classList.toggle('selected', b === button));
  resetResults(); loadRemote({reset:true});
};
document.querySelectorAll('[data-kind]').forEach(button => button.onclick = () => {
  kind = button.dataset.kind; query = ''; genre = 'all'; $('#search').value = '';
  document.querySelectorAll('[data-kind]').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-selected', b === button); });
  document.querySelectorAll('[data-genre]').forEach(b => b.classList.toggle('selected', b.dataset.genre === 'all'));
  $('#notice').textContent = ''; resetResults(); loadRemote({reset:true});
});
function setView(next) {
  view = next; genre = 'all'; query = ''; $('#search').value = ''; visible = 24;
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

function openDetails(book) {
  const manga = book.kind === 'manga';
  const source = /^https:\/\/(myanimelist\.net|www\.viz\.com|mangaplus\.shueisha\.co\.jp)\//.test(book.sourceUrl || '') ? book.sourceUrl : `https://myanimelist.net/${manga ? 'manga' : 'anime'}/${String(book.id).split('-')[1]}`;
  const official = /^https:\/\/(www\.viz\.com|mangaplus\.shueisha\.co\.jp)\//.test(book.officialUrl || '') ? book.officialUrl : 'https://mangaplus.shueisha.co.jp/';
  $('#detail-content').innerHTML = `<div class="detail-layout"><img class="detail-cover" src="${escapeHtml(safeImage(book.cover))}" alt="${escapeHtml(book.title)} cover"><div class="detail-copy"><div class="eyebrow">${manga ? 'MANGA COLLECTION' : 'ANIME DISCOVERY'}</div><h2>${escapeHtml(book.title)}</h2><div class="detail-meta">${escapeHtml(book.author)}${book.score ? ` · ${escapeHtml(book.score)}/10 on MyAnimeList` : ''}</div><p>${escapeHtml(book.description || 'Discover the story, explore the characters, and find out more in the series guide.')}</p><a class="primary" href="${escapeHtml(manga ? official : source)}" target="_blank" rel="noopener noreferrer">${manga ? 'Find official chapters' : 'Explore series guide'} ↗</a><p class="source-note">${manga ? 'Official reading opens on the publisher’s website. Free chapters and availability vary by title and region.' : 'Explore the complete series guide, ratings, and release information on MyAnimeList.'}</p>${manga ? `<a class="secondary" href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">View series details ↗</a>` : ''}</div></div>`;
  $('#details').showModal();
}
$('#close-details').onclick = () => $('#details').close();
$('#details').addEventListener('click', event => { if (event.target === $('#details')) { const r = $('#details').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('#details').close(); } });

// Render local content first. Remote catalogs and server detection never block it.
try {
  const response = await fetch('/catalog.json'); if (!response.ok) throw Error(); catalog = await response.json(); render();
} catch { $('#notice').textContent = 'Could not load the downloaded collection. Refresh the page to try again.'; }
fetch('/series.json').then(r => r.json()).then(data => { seeds = data; if (kind !== 'book') render(); }).catch(() => {});
try { const response = await fetch('/api/health', {signal:AbortSignal.timeout(1500)}); serverMode = response.ok && (await response.json()).service === 'folio'; } catch {}
loadRemote({reset:true, silent:true});
