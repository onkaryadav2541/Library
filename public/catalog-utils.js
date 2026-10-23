// Shared by the provider adapters and UI. Keep distinct volumes distinct when
// deduplicating editions; a series key is only for the volume picker.
export function romanNumber(value) {
  if (/^\d+(?:\.\d+)?$/.test(value)) return Number(value);
  if (!value || !/^(?=[ivxlcdm]+$)m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i.test(value)) return null;
  const map={i:1,v:5,x:10,l:50,c:100,d:500,m:1000}; let sum=0;
  const letters=value.toLowerCase();
  for(let i=0;i<letters.length;i++) sum += map[letters[i]] < (map[letters[i+1]]||0) ? -map[letters[i]] : map[letters[i]];
  return sum;
}
export function volumeInfo(title, author='') {
  const match=title.match(/(?:\b(?:vol(?:ume)?\.?|book|part)\s*[:.#-]?\s*)(\d+(?:\.\d+)?|[ivxlcdm]+)\b/i);
  if(!match) return {};
  const number=romanNumber(match[1]); if(number===null) return {};
  const base=title.slice(0,match.index).replace(/[\s,;:—–\-(]+$/g,'').trim();
  if(base.length<3) return {volume:number};
  return {volume:number,seriesTitle:base,seriesKey:normalize(base)+'|'+normalizeAuthor(author)};
}
const normalize=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const normalizeAuthor=value=>normalize(value).split(' ').sort().join(' ');
export function identity(book){
  if(book.kind && book.kind!=='book'){const malId=book.malId||String(book.id).match(/^(?:anime|manga)-(\d+)$/)?.[1];return malId?`${book.kind}-mal-${malId}`:String(book.id);}
  if(!book.author || book.author==='Unknown author') return String(book.id);
  return normalize(book.title)+'|'+normalizeAuthor(book.author);
}
export function mergeBooks(books) {
  const seen=new Map();
  for(const item of books){
    const book={...item,...volumeInfo(item.title,item.author)}, key=identity(book);
    const existing=seen.get(key);
    if(!existing){seen.set(key,{...book,editions:book.editions||[]});continue;}
    // Prefer full in-app text, then free external reading. Never let a preview
    // replace an edition that can actually be read.
    const score=b=>(b.reader==='text'||b.local?4:b.access==='full'?3:b.provider?2:1);
    const primary=score(book)>score(existing)?book:existing, other=primary===book?existing:book;
    const editions=[...(existing.editions||[]),...(book.editions||[]),{id:other.id,provider:other.provider,source:other.source,readUrl:other.readUrl,sourceUrl:other.sourceUrl,access:other.access}];
    seen.set(key,{...other,...primary,editions:[...new Map(editions.filter(e=>e.id!==primary.id).map(e=>[String(e.id),e])).values()]});
  }
  return [...seen.values()];
}
export function orderVolumes(books, target) {
  const info={...target,...volumeInfo(target.title,target.author)};
  if(!info.seriesKey) return [];
  return mergeBooks(books).filter(b=>b.seriesKey===info.seriesKey&&Number.isFinite(b.volume)).sort((a,b)=>a.volume-b.volume||a.title.localeCompare(b.title));
}
export function orderEpisodes(episodes) {
  return [...new Map(episodes.map(e=>[String(e.number),e])).values()].sort((a,b)=>Number(a.number)-Number(b.number));
}
