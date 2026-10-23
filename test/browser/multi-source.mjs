import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'});let errors=[];page.on('pageerror',e=>errors.push(e.message));
const volume=(number)=>({id:900000+number,provider:'gutenberg',source:'Project Gutenberg',kind:'book',title:`The Test Saga, Volume ${number}`,author:'Test Author',genre:'fantasy',cover:'/covers/1342.jpg',reader:'text',access:'full',textUrl:'https://example.invalid'});
await page.route('**/api/discover?*',async route=>{
 const u=new URL(route.request().url()),p=u.searchParams.get('provider'),kind=u.searchParams.get('kind'),q=u.searchParams.get('q');
 if(p==='googlebooks'){await new Promise(resolve=>setTimeout(resolve,1000));await route.fulfill({status:503,body:'Unavailable'});return;}
 let books=[];
 if(kind==='book'&&p==='gutenberg')books=[volume(10),volume(2),volume(1)];
 if(kind==='book'&&p==='openlibrary')books=[{id:'ol-OL100W',provider:p,source:'Open Library',kind:'book',title:'An API-Only Free Book',author:'Some Writer',genre:'romance',reader:'external',access:'full',cover:'/covers/11.jpg',sourceUrl:'https://openlibrary.org/works/OL100W',readUrl:'https://openlibrary.org/works/OL100W'}];
 if(kind!=='book')books=[{id:`${kind}-1`,provider:p,malId:1,anilistId:1,source:p==='anilist'?'AniList':'Jikan',kind,title:'API Series',author:'Studio',genre:kind,volumes:12,episodes:10,cover:'/covers/11.jpg',sourceUrl:`https://anilist.co/${kind}/1`}];
 await route.fulfill({json:{provider:p,books,hasMore:false,total:books.length}});
});
await page.route('**/api/series-details?*',route=>route.fulfill({json:{episodes:[{number:10,title:'Ten',url:'https://myanimelist.net/anime/1/episode/10',site:'Episode guide'},{number:2,title:'Two',url:'https://myanimelist.net/anime/1/episode/2',site:'Episode guide'},{number:1,title:'One',url:'https://myanimelist.net/anime/1/episode/1',site:'Episode guide'}],relations:[],hasMore:false}}));
await page.route('**/api/read?id=90000*',route=>route.fulfill({body:'Chapter 1\n\n'+('This is a test volume with readable text. '.repeat(500)),contentType:'text/plain'}));
await page.goto(process.env.FOLIO_URL||'http://127.0.0.1:5210');await page.waitForSelector('.book-card');
await page.waitForFunction(()=>document.querySelectorAll('.source-pill:not(.loading)').length>=2);
assert.ok(await page.locator('.source-pill.loading').count()>=1,'A slow provider should not block successful results');
await page.selectOption('#provider-filter','openlibrary');await page.waitForSelector('[data-read="ol-OL100W"]');assert.equal(await page.locator('.book-card').count(),1);
await page.locator('[data-read="ol-OL100W"]').first().click();assert.equal(await page.locator('#details .primary').getAttribute('href'),'https://openlibrary.org/works/OL100W');await page.locator('#close-details').click();
await page.selectOption('#provider-filter','all');await page.locator('#search').fill('Test Saga');await page.waitForSelector('[data-read="900002"]');await page.locator('[data-read="900002"]').first().click();
assert.deepEqual(await page.locator('[data-volume]').allTextContents(),['Vol. 1','Vol. 2','Vol. 10']);
await page.locator('#detail-read').click();await page.waitForFunction(()=>document.querySelector('#left-page').textContent.length>100);assert.equal(await page.locator('#reader-volume').isVisible(),true);assert.equal(await page.locator('#reader-volume').inputValue(),'900002');await page.selectOption('#reader-volume','900010');await page.waitForFunction(()=>document.querySelector('#reader-title').textContent.includes('10'));await page.locator('#close-reader').click();
await page.locator('[data-kind="anime"]').click();await page.waitForSelector('[data-read="anime-1"]');assert.equal(await page.locator('[data-read="anime-1"].cover').count(),1,'AniList and Jikan duplicates should merge');await page.locator('[data-read="anime-1"]').first().click();await page.waitForSelector('.episode-list li');assert.deepEqual(await page.locator('.episode-number').allTextContents(),['1','2','10']);
await page.locator('#close-details').click();await page.setViewportSize({width:390,height:844});await page.screenshot({path:'folio-multi-source-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);console.log('Partial results, failed-source isolation, external reading, ordered volumes, volume switching, deduplicated anime, and ordered episodes passed');await browser.close();
