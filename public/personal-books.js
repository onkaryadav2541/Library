const sessionTexts=new Map();
let database;
function openDB(){
 if(database)return database;
 database=new Promise((resolve,reject)=>{
  const request=indexedDB.open('folio-personal-library',1);
  request.onupgradeneeded=()=>{for(const name of ['books','texts'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'id'});};
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Browser storage is unavailable.'));
 });return database;
}
export async function listPersonalBooks(){
 try{const db=await openDB();return await new Promise((resolve,reject)=>{const request=db.transaction('books').objectStore('books').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=reject;});}catch{return [];}
}
export async function personalText(id){
 if(sessionTexts.has(id))return sessionTexts.get(id);
 const db=await openDB();return new Promise((resolve,reject)=>{const request=db.transaction('texts').objectStore('texts').get(id);request.onsuccess=()=>request.result?resolve(request.result.text):reject(Error('This file is no longer in browser storage. Add it again.'));request.onerror=reject;});
}
function xml(text){const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('This EPUB contains invalid XML and cannot be read.');return doc;}
function unpack(buffer){return new Promise((resolve,reject)=>{
 const worker=new Worker(new URL('./import-worker.js',import.meta.url),{type:'module'});
 const timer=setTimeout(()=>{worker.terminate();reject(Error('The EPUB took too long to unpack.'));},15000);
 worker.onmessage=({data})=>{clearTimeout(timer);worker.terminate();data.error?reject(Error(data.error)):resolve(data.entries);};
 worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(Error('This EPUB could not be opened.'));};
 worker.postMessage(buffer,[buffer]);
});}
function element(doc,name){return doc.getElementsByTagNameNS('*',name)[0];}
function chapterText(source){
 const doc=xml(source);
 for(const node of Array.from(doc.getElementsByTagName('*')))if(['script','style','iframe','object','embed','noscript','svg'].includes(node.localName))node.remove();
 const body=element(doc,'body')||doc.documentElement;
 const heading=Array.from(body.getElementsByTagName('*')).find(e=>/^h[12]$/.test(e.localName))?.textContent.trim();
 for(const node of Array.from(body.getElementsByTagName('*')))if(['p','div','li','h1','h2','h3','h4','blockquote','br'].includes(node.localName)){node.prepend(doc.createTextNode('\n\n'));node.append(doc.createTextNode('\n\n'));}
 return {heading,text:body.textContent.replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n\n').trim()};
}
export async function importPersonalBook(file){
 if(!/\.(epub|txt)$/i.test(file.name))throw Error('Choose an EPUB or UTF-8 TXT file.');
 if(file.size>12*1024*1024)throw Error('Choose a file smaller than 12 MB.');
 if(!file.size)throw Error('This file is empty.');
 const buffer=await file.arrayBuffer();
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
 const id='personal-'+hash;
 let title=file.name.replace(/\.(?:epub|txt)$/i,''),author='Your personal copy',text='';
 if(/\.txt$/i.test(file.name))text=new TextDecoder('utf-8',{fatal:true}).decode(buffer);
 else{
  const entries=await unpack(buffer);
  if(entries['META-INF/encryption.xml'])throw Error('Encrypted EPUBs are not supported. Choose a DRM-free EPUB or TXT file.');
  if(!entries['META-INF/container.xml'])throw Error('This file is not a supported EPUB.');
  const container=xml(entries['META-INF/container.xml']);
  const opfPath=element(container,'rootfile')?.getAttribute('full-path');
  if(!opfPath||!entries[opfPath])throw Error('The EPUB package is missing.');
  const opf=xml(entries[opfPath]);title=element(opf,'title')?.textContent.trim()||title;author=element(opf,'creator')?.textContent.trim()||author;
  const manifest=new Map(Array.from(opf.getElementsByTagNameNS('*','item')).map(e=>[e.getAttribute('id'),e]));
  const spine=Array.from(opf.getElementsByTagNameNS('*','itemref')).filter(e=>e.getAttribute('linear')!=='no');
  if(!spine.length||spine.length>500)throw Error('This EPUB has no supported reading order.');
  const chapters=[];
  for(const ref of spine){
   const item=manifest.get(ref.getAttribute('idref'));if(!item)continue;
   if(!['application/xhtml+xml','text/html'].includes(item.getAttribute('media-type')))continue;
   const path=decodeURIComponent(new URL(item.getAttribute('href'),'https://epub.local/'+opfPath).pathname.slice(1));
   if(!entries[path])throw Error('A chapter is missing from this EPUB.');
   const chapter=chapterText(entries[path]);if(chapter.text)chapters.push(`Section ${chapters.length+1}${chapter.heading?': '+chapter.heading:''}\n\n${chapter.text}`);
  }
  text=chapters.join('\n\n');
 }
 if(text.trim().length<10)throw Error('No readable text was found in this file.');
 const book={id,title,author,kind:'book',genre:'personal',provider:'personal',source:'Your personal library',reader:'text',access:'full',personal:true,importedAt:Date.now()};
 sessionTexts.set(id,text);
 let persisted=true;
 try{
  const db=await openDB();await new Promise((resolve,reject)=>{const tx=db.transaction(['books','texts'],'readwrite');tx.objectStore('books').put(book);tx.objectStore('texts').put({id,text});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
 }catch{persisted=false;}
 return {book,persisted};
}
