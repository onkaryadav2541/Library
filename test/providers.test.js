import {test} from 'node:test';
import assert from 'node:assert/strict';
import {discover,seriesDetails} from '../lib/providers.js';
import {mergeBooks,orderVolumes,volumeInfo,orderEpisodes} from '../public/catalog-utils.js';

test('Gutenberg genre requests preserve full text and numbered-volume metadata',async()=>{
 const result=await discover('gutenberg',{kind:'book',genre:'romance',q:'Austen',page:2},async url=>{
  const u=new URL(url);assert.equal(u.searchParams.get('topic'),'romance');assert.equal(u.searchParams.get('search'),'Austen');assert.equal(u.searchParams.get('page'),'2');
  return {count:4,next:null,results:[{id:10,title:'A Story, Volume II',authors:[{name:'Austen, Jane'}],formats:{'text/plain; charset=utf-8':'https://www.gutenberg.org/test.txt','image/jpeg':'https://www.gutenberg.org/cover.jpg'}}]};
 });
 assert.equal(result.books[0].reader,'text');assert.equal(result.books[0].volume,2);assert.equal(result.books[0].author,'Jane Austen');assert.equal(result.hasMore,false);
});
test('Open Library filters out borrowed and unavailable editions',async()=>{
 const result=await discover('openlibrary',{genre:'thriller'},async url=>{
  assert.match(new URL(url).searchParams.get('q'),/ebook_access:public/);
  return {numFound:3,docs:[{key:'/works/OL1W',title:'Free thriller',author_name:['Writer'],ebook_access:'public',ia:['item']},{key:'/works/OL2W',title:'Borrow only',ebook_access:'borrowable'},{key:'/works/OL3W',title:'No scan',ebook_access:'no_ebook'}]};
 });
 assert.equal(result.books.length,1);assert.equal(result.books[0].access,'external-only');assert.equal(result.books[0].reader,'unavailable');assert.equal(result.books[0].genre,'thriller');
});
test('Google Books only exposes complete free reading, never a partial preview',async()=>{
 const result=await discover('googlebooks',{genre:'romance'},async url=>{
  assert.equal(new URL(url).searchParams.get('filter'),'free-ebooks');
  return {totalItems:2,items:[{id:'full',volumeInfo:{title:'Free',authors:['A']},accessInfo:{viewability:'ALL_PAGES',webReaderLink:'http://books.google.com/books?id=full'}},{id:'sample',volumeInfo:{title:'Sample'},accessInfo:{viewability:'PARTIAL'}}]};
 });
 assert.equal(result.books.length,1);assert.match(result.books[0].readUrl,/^https:/);
});
test('AniList uses safe discovery and shares MAL identity with Jikan',async()=>{
 const a=await discover('anilist',{kind:'manga',q:'Naruto'},async(url,options)=>{
  assert.equal(url,'https://graphql.anilist.co');const payload=JSON.parse(options.body);assert.equal(payload.variables.type,'MANGA');assert.match(payload.query,/isAdult:false/);
  return {data:{Page:{pageInfo:{hasNextPage:false,total:1},media:[{id:30011,idMal:11,title:{english:'Naruto'},volumes:72,chapters:700,siteUrl:'https://anilist.co/manga/30011'}]}}};
 });
 const b=await discover('jikan',{kind:'manga'},async()=>({data:[{mal_id:11,title:'Naruto',volumes:72,chapters:700}],pagination:{has_next_page:false}}));
 const merged=mergeBooks([...a.books,...b.books]);assert.equal(merged.length,1);assert.equal(merged[0].volumes,72);assert.equal(merged[0].anilistId,30011);
});
test('same-edition duplicates merge while different volumes remain separate',()=>{
 const books=mergeBooks([{id:1,title:'A Tale, Volume I',author:'Jane Doe',reader:'text',access:'full',provider:'gutenberg'},{id:'ol-1',title:'A Tale, Volume I',author:'Doe, Jane',reader:'external',access:'full',provider:'openlibrary'},{id:2,title:'A Tale, Volume II',author:'Jane Doe',reader:'text'}]);
 assert.equal(books.length,2);assert.equal(books[0].id,1);assert.equal(books[0].editions[0].provider,'openlibrary');
});
test('volumes sort numerically, including Roman numerals and decimals',()=>{
 const books=[10,2,1].map(n=>({id:n,title:`The Saga, Vol. ${n}`,author:'Writer'}));
 books.push({id:3,title:'The Saga, Volume III',author:'Writer'});
 assert.deepEqual(orderVolumes(books,books[0]).map(b=>b.volume),[1,2,3,10]);
 assert.equal(volumeInfo('The Saga, Book IV','Writer').volume,4);
 assert.equal(volumeInfo('The Saga, Vol. 2.5','Writer').volume,2.5);
});
test('episode lists sort 1, 2, 10 and discard duplicate episode numbers',()=>{
 assert.deepEqual(orderEpisodes([{number:10},{number:2},{number:1},{number:2}]).map(e=>e.number),[1,2,10]);
});
test('AniList details retain official streaming and source-provided sequel relationships',async()=>{
 const result=await seriesDetails({provider:'anilist',kind:'anime',id:'1'},async()=>({data:{Media:{id:1,title:{english:'Series'},streamingEpisodes:[{title:'Episode 10',url:'https://www.crunchyroll.com/watch/10',site:'Crunchyroll'},{title:'Episode 2',url:'https://www.crunchyroll.com/watch/2',site:'Crunchyroll'}],relations:{edges:[{relationType:'SEQUEL',node:{id:2,type:'ANIME',title:{english:'Next'},siteUrl:'https://anilist.co/anime/2',startDate:{year:2020}}}]}}}}));
 assert.deepEqual(result.episodes.map(e=>e.number),[2,10]);assert.equal(result.relations[0].relation,'SEQUEL');
});
test('Jikan episode metadata remains usable when its full-series endpoint fails',async()=>{
 const result=await seriesDetails({provider:'jikan',kind:'anime',id:'1'},async url=>{if(url.endsWith('/full'))throw Error('Rate limited');return {data:[{mal_id:2,title:'Two',url:'https://myanimelist.net/anime/1/episode/2'},{mal_id:1,title:'One',url:'https://myanimelist.net/anime/1/episode/1'}],pagination:{has_next_page:true}};});
 assert.deepEqual(result.episodes.map(e=>e.number),[1,2]);assert.equal(result.hasMore,true);
});
test('featured series and live providers deduplicate using the same MAL identity',()=>{
 assert.equal(mergeBooks([{id:'manga-11',kind:'manga',title:'Naruto'},{id:'manga-11',kind:'manga',title:'Naruto',provider:'jikan',malId:11,volumes:72}]).length,1);
});
test('Kitsu supplies a third anime source without one mapping request per title',async()=>{
 const result=await discover('kitsu',{kind:'anime'},async url=>{
  assert.equal(new URL(url).searchParams.get('include'),'mappings');
  return {data:[{id:'1',attributes:{canonicalTitle:'Cowboy Bebop',ageRating:'R',episodeCount:26,slug:'cowboy-bebop'},relationships:{mappings:{data:[{id:'m1'}]}}},{id:'2',attributes:{canonicalTitle:'Adult',nsfw:true}}],included:[{id:'m1',attributes:{externalSite:'myanimelist/anime',externalId:'1'}}],meta:{count:20},links:{next:'next'}};
 });
 assert.equal(result.books.length,1);assert.equal(result.books[0].malId,1);assert.equal(result.books[0].episodes,26);assert.equal(result.hasMore,true);
});

test('modern-title searches return catalog metadata without inventing reading access',async()=>{
 const result=await discover('openlibrary',{q:'The Alchemist'},async url=>{assert.doesNotMatch(new URL(url).searchParams.get('q'),/ebook_access:public/);return {numFound:1,docs:[{key:'/works/OL1W',title:'The Alchemist',author_name:['Paulo Coelho'],ebook_access:'borrowable'}]};});
 assert.equal(result.books.length,1);assert.equal(result.books[0].reader,'unavailable');assert.equal(result.books[0].access,'catalog');
});
test('a private imported copy never merges its text identity with a catalog edition',()=>{
 const books=mergeBooks([{id:1,title:'A Tale',author:'Writer',reader:'text'},{id:'personal-123',title:'A Tale',author:'Writer',personal:true,reader:'text'}]);assert.equal(books.length,2);assert.ok(books.some(b=>b.id==='personal-123'&&b.personal));
});

test('Google modern-title search is metadata-only and does not promise partial samples as full text',async()=>{
 const result=await discover('googlebooks',{q:'Modern title'},async url=>{assert.equal(new URL(url).searchParams.has('filter'),false);return {totalItems:1,items:[{id:'modern',volumeInfo:{title:'Modern title',authors:['Writer']},accessInfo:{viewability:'PARTIAL'}}]};});assert.equal(result.books[0].reader,'unavailable');assert.equal(result.books[0].access,'catalog');
});
