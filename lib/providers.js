import {volumeInfo,orderEpisodes} from '../public/catalog-utils.js';
export const PROVIDERS={
 gutenberg:{name:'Project Gutenberg',kinds:['book'],docs:'https://gutendex.com/'},
 openlibrary:{name:'Open Library',kinds:['book'],docs:'https://openlibrary.org/dev/docs/api/search'},
 googlebooks:{name:'Google Books',kinds:['book'],docs:'https://developers.google.com/books/docs/v1/using'},
 anilist:{name:'AniList',kinds:['anime','manga'],docs:'https://docs.anilist.co/'},
 kitsu:{name:'Kitsu',kinds:['anime','manga'],docs:'https://kitsu.docs.apiary.io/'},
 jikan:{name:'Jikan',kinds:['anime','manga'],docs:'https://docs.api.jikan.moe/'}
};
export async function fetchJson(url,options={}){
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(4500),headers:{Accept:'application/json','User-Agent':'Folio/3.0 (open-source personal library)',...options.headers}});
 if(!response.ok)throw Error(response.status===429?'Source rate limit reached':`Source returned ${response.status}`);
 const value=await response.json();if(value.errors?.length)throw Error(value.errors[0].message);return value;
}
const https=url=>String(url||'').replace(/^http:\/\//,'https://');
const pageOf=p=>Math.max(1,Math.min(1000,Number.parseInt(p,10)||1));
const subject=g=>({'sci-fi':'science fiction',thriller:'thrillers',children:'children',nonfiction:'nonfiction',encyclopedia:'encyclopedias'}[g]||g);
function classify(subjects=[]){
 const text=subjects.join(' ').toLowerCase();
 for(const [a,b] of [['thriller','thriller'],['love stories','romance'],['romance','romance'],['detective','mystery'],['mystery','mystery'],['science fiction','sci-fi'],['fantasy','fantasy'],['fairy','fantasy'],['children','children'],['philosophy','philosophy'],['encyclop','encyclopedia'],['science','science'],['poetry','poetry'],['adventure','adventure'],['history','history'],['horror','horror']])if(text.includes(a))return b;
 return 'classics';
}
function complete(book){return {...book,...volumeInfo(book.title,book.author)};}
export async function discover(provider,{kind='book',q='',genre='all',page=1}={},json=fetchJson){
 if(!PROVIDERS[provider]?.kinds.includes(kind))throw Error('Invalid provider or collection');
 page=pageOf(page);q=q.slice(0,180);let data,books=[],hasMore=false,total=null;
 if(provider==='gutenberg'){
  const url=new URL('https://gutendex.com/books/');url.searchParams.set('page',page);
  if(q)url.searchParams.set('search',q);if(genre!=='all')url.searchParams.set('topic',subject(genre));
  data=await json(url.href);
  books=(data.results||[]).filter(b=>Object.keys(b.formats||{}).some(k=>k.startsWith('text/plain'))).map(b=>complete({
   id:b.id,provider,source:PROVIDERS[provider].name,kind:'book',title:b.title,author:(b.authors||[]).map(a=>a.name.split(', ').reverse().join(' ')).join(', ')||'Unknown author',genre:genre==='all'?classify([...(b.subjects||[]),...(b.bookshelves||[])]):genre,tags:b.subjects||[],cover:b.formats['image/jpeg'],reader:'text',access:'full',sourceUrl:`https://www.gutenberg.org/ebooks/${b.id}`,readUrl:`/api/read?id=${b.id}`,textUrl:`https://www.gutenberg.org/cache/epub/${b.id}/pg${b.id}.txt`}));
  hasMore=!!data.next;total=data.count;
 }else if(provider==='openlibrary'){
  const url=new URL('https://openlibrary.org/search.json');
  const terms=q?`(${q.replace(/[{}\[\]\\]/g,' ')})`:genre==='all'?'subject:fiction':`subject:${subject(genre).replace(/\s+/g,'_')}`;
  url.searchParams.set('q',q?terms:`ebook_access:public AND ${terms}`);url.searchParams.set('page',page);url.searchParams.set('limit','24');
  url.searchParams.set('fields','key,title,author_name,cover_i,ebook_access,ia,first_publish_year,edition_count,subject');
  data=await json(url.href);
  books=(data.docs||[]).filter(b=>(q||b.ebook_access==='public')&&/^\/works\/OL\d+W$/.test(b.key)).map(b=>complete({
   id:'ol-'+b.key.split('/').pop(),provider,source:PROVIDERS[provider].name,kind:'book',title:b.title,author:(b.author_name||[]).join(', ')||'Unknown author',genre:genre==='all'?classify(b.subject||[]):genre,tags:(b.subject||[]).slice(0,15),cover:b.cover_i?`https://covers.openlibrary.org/b/id/${b.cover_i}-M.jpg`:null,reader:'unavailable',access:b.ebook_access==='public'?'external-only':'catalog',year:b.first_publish_year,editionCount:b.edition_count,sourceUrl:`https://openlibrary.org${b.key}`,readUrl:`https://openlibrary.org${b.key}`}));
  total=data.numFound??data.num_found;hasMore=page*24<(total||0);
 }else if(provider==='googlebooks'){
  const url=new URL('https://www.googleapis.com/books/v1/volumes');
  url.searchParams.set('q',q||`subject:${genre==='all'?'fiction':subject(genre)}`);if(!q)url.searchParams.set('filter','free-ebooks');url.searchParams.set('maxResults','24');url.searchParams.set('startIndex',String((page-1)*24));url.searchParams.set('printType','books');
  data=await json(url.href);
  books=(data.items||[]).filter(b=>q||b.accessInfo?.viewability==='ALL_PAGES'||b.accessInfo?.publicDomain===true).map(b=>{
   const v=b.volumeInfo||{},a=b.accessInfo||{};const series=v.seriesInfo?.volumeSeries?.[0];
   const result=complete({id:'gb-'+b.id,provider,source:PROVIDERS[provider].name,kind:'book',title:[v.title,v.subtitle].filter(Boolean).join(': '),author:(v.authors||[]).join(', ')||'Unknown author',genre:genre==='all'?classify(v.categories||[]):genre,tags:v.categories||[],cover:https(v.imageLinks?.thumbnail||v.imageLinks?.smallThumbnail),reader:'unavailable',access:a.viewability==='ALL_PAGES'||a.publicDomain?'external-only':'catalog',sourceUrl:https(v.infoLink||`https://books.google.com/books?id=${b.id}`),readUrl:https(a.webReaderLink||v.infoLink||`https://books.google.com/books?id=${b.id}`),description:v.description||'',year:v.publishedDate});
   if(series?.bookDisplayNumber&&Number.isFinite(Number(series.bookDisplayNumber)))result.volume=Number(series.bookDisplayNumber);
   return result;
  });
  total=data.totalItems;hasMore=(data.items||[]).length===24&&page*24<(total||0);
 }else if(provider==='jikan'){
  const url=new URL(`https://api.jikan.moe/v4/${kind}`);url.searchParams.set('page',page);url.searchParams.set('limit','24');url.searchParams.set('sfw','true');
  if(q)url.searchParams.set('q',q);else{url.searchParams.set('order_by','members');url.searchParams.set('sort','desc');}
  data=await json(url.href);books=(data.data||[]).filter(b=>!b.genres?.some(g=>['Hentai','Erotica'].includes(g.name))).map(b=>seriesJikan(b,kind));
  hasMore=!!data.pagination?.has_next_page;total=data.pagination?.items?.total;
 }else if(provider==='kitsu'){
  const url=new URL(`https://kitsu.io/api/edge/${kind}`);url.searchParams.set('page[limit]','24');url.searchParams.set('page[offset]',String((page-1)*24));url.searchParams.set('include','mappings');
  if(q)url.searchParams.set('filter[text]',q);else url.searchParams.set('sort','-userCount');
  data=await json(url.href);const mappings=new Map((data.included||[]).map(m=>[m.id,m]));
  books=(data.data||[]).filter(b=>!b.attributes?.nsfw&&b.attributes?.ageRating!=='R18').map(b=>{
   const a=b.attributes||{},mapping=(b.relationships?.mappings?.data||[]).map(m=>mappings.get(m.id)).find(m=>m?.attributes?.externalSite===`myanimelist/${kind}`);
   const malId=Number(mapping?.attributes?.externalId)||undefined;
   return {id:malId?`${kind}-${malId}`:`${kind}-kitsu-${b.id}`,malId,kitsuId:b.id,provider,source:'Kitsu',kind,title:a.canonicalTitle||a.titles?.en||a.titles?.en_jp||'Untitled',author:kind==='anime'?'Anime series':'Manga series',genre:kind,tags:[],cover:a.posterImage?.medium||a.posterImage?.original,description:a.synopsis||'',score:a.averageRating?Number(a.averageRating)/10:undefined,status:a.status,episodes:a.episodeCount,volumes:a.volumeCount,chapters:a.chapterCount,sourceUrl:`https://kitsu.app/${kind}/${a.slug||b.id}`,officialUrl:'https://mangaplus.shueisha.co.jp/'};
  });
  total=data.meta?.count;hasMore=!!data.links?.next;
 }else{
  const query=`query($page:Int,$type:MediaType,$search:String){Page(page:$page,perPage:24){pageInfo{hasNextPage total}media(type:$type,search:$search,isAdult:false,sort:POPULARITY_DESC){id idMal type title{romaji english}coverImage{large}description(asHtml:false)genres episodes volumes chapters status siteUrl}}}`;
  data=await json('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,variables:{page,type:kind.toUpperCase(),search:q||undefined}})});
  books=(data.data?.Page?.media||[]).map(b=>seriesAniList(b,kind));hasMore=!!data.data?.Page?.pageInfo?.hasNextPage;total=data.data?.Page?.pageInfo?.total;
 }
 return {provider,name:PROVIDERS[provider].name,books,hasMore,total:total??null,page};
}
export function seriesJikan(b,kind){return {id:`${kind}-${b.mal_id}`,malId:b.mal_id,provider:'jikan',source:'Jikan / MyAnimeList',kind,title:b.title_english||b.title,author:b.authors?.map(a=>a.name).join(', ')||b.studios?.map(a=>a.name).join(', ')||`${kind==='manga'?'Manga':'Anime'} series`,genre:kind,tags:b.genres?.map(g=>g.name)||[],cover:b.images?.jpg?.large_image_url||b.images?.jpg?.image_url,description:b.synopsis||'',score:b.score,status:b.status,volumes:b.volumes,chapters:b.chapters,episodes:b.episodes,sourceUrl:b.url||`https://myanimelist.net/${kind}/${b.mal_id}`,officialUrl:'https://mangaplus.shueisha.co.jp/'};}
export function seriesAniList(b,kind){return {id:b.idMal?`${kind}-${b.idMal}`:`${kind}-al-${b.id}`,malId:b.idMal,anilistId:b.id,provider:'anilist',source:'AniList',kind,title:b.title?.english||b.title?.romaji||'Untitled',author:kind==='anime'?'Anime series':'Manga series',genre:kind,tags:b.genres||[],cover:b.coverImage?.large,description:(b.description||'').replace(/<[^>]+>/g,''),score:b.averageScore?b.averageScore/10:undefined,status:b.status,volumes:b.volumes,chapters:b.chapters,episodes:b.episodes,sourceUrl:b.siteUrl||`https://anilist.co/${kind}/${b.id}`,officialUrl:'https://mangaplus.shueisha.co.jp/'};}

export async function seriesDetails({provider,kind,id,page=1},json=fetchJson){
 if(!['manga','anime'].includes(kind)||!/^\d{1,9}$/.test(String(id)))throw Error('Invalid series');
 if(provider==='anilist'){
  const query=`query($id:Int){Media(id:$id){id idMal type title{romaji english}coverImage{large}description(asHtml:false)genres episodes volumes chapters status siteUrl averageScore streamingEpisodes{title url site}relations{edges{relationType node{id idMal type format title{romaji english}siteUrl startDate{year month day}}}}}}`;
  const result=await json('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query,variables:{id:Number(id)}})}),b=result.data?.Media;
  if(!b)throw Error('Series unavailable');
  return {book:seriesAniList(b,kind),episodes:orderEpisodes((b.streamingEpisodes||[]).map((e,i)=>({number:Number(e.title.match(/(?:episode\s*|^)(\d+)/i)?.[1]||i+1),title:e.title,url:e.url,site:e.site}))),relations:(b.relations?.edges||[]).filter(e=>['PREQUEL','SEQUEL','PARENT','SIDE_STORY'].includes(e.relationType)).map(e=>({id:`${e.node.type.toLowerCase()}-al-${e.node.id}`,title:e.node.title.english||e.node.title.romaji,relation:e.relationType,url:e.node.siteUrl,date:e.node.startDate})).sort((a,b)=>(a.date?.year||9999)-(b.date?.year||9999)||(a.date?.month||0)-(b.date?.month||0)),hasMore:false};
 }
 if(provider==='kitsu'){
  const unit=kind==='anime'?'episodes':'chapters',url=new URL(`https://kitsu.io/api/edge/${kind}/${id}/${unit}`);
  url.searchParams.set('page[limit]','24');url.searchParams.set('page[offset]',String((pageOf(page)-1)*24));url.searchParams.set('sort','number');
  const data=await json(url.href);
  return {unit,episodes:orderEpisodes((data.data||[]).map(e=>({number:e.attributes?.number,title:e.attributes?.canonicalTitle||e.attributes?.titles?.en||`${kind==='anime'?'Episode':'Chapter'} ${e.attributes?.number}`,volume:e.attributes?.volumeNumber,url:`https://kitsu.app/${kind}/${id}`,site:kind==='anime'?'Episode guide':'Chapter guide'})).filter(e=>Number.isFinite(Number(e.number)))),hasMore:!!data.links?.next,page:pageOf(page)};
 }
 if(provider!=='jikan')throw Error('Invalid series provider');
 if(kind==='anime'){
  const [episodeResult,fullResult]=await Promise.allSettled([json(`https://api.jikan.moe/v4/anime/${id}/episodes?page=${pageOf(page)}`),json(`https://api.jikan.moe/v4/anime/${id}/full`)]);
  if(episodeResult.status==='rejected'&&fullResult.status==='rejected')throw Error('Series guide unavailable');
  const data=episodeResult.status==='fulfilled'?episodeResult.value:{},full=fullResult.status==='fulfilled'?fullResult.value.data:null;
  return {book:full?seriesJikan(full,kind):undefined,episodes:orderEpisodes((data.data||[]).map(e=>({number:e.mal_id,title:e.title,url:e.url,site:'Episode guide',aired:e.aired,filler:e.filler,recap:e.recap}))),relations:(full?.relations||[]).flatMap(r=>(r.entry||[]).map(e=>({title:e.name,url:e.url,relation:r.relation}))),hasMore:!!data.pagination?.has_next_page,page:pageOf(page)};
 }
 const data=await json(`https://api.jikan.moe/v4/manga/${id}/full`);
 return {book:seriesJikan(data.data,kind),episodes:[],relations:(data.data?.relations||[]).flatMap(r=>(r.entry||[]).map(e=>({title:e.name,url:e.url,relation:r.relation}))),hasMore:false};
}
