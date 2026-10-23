import {unzipSync,strFromU8} from './vendor/fflate.js';
self.onmessage=({data})=>{
 try{
  let bytes=0,count=0;
  const files=unzipSync(new Uint8Array(data),{filter:file=>{
   if(!/\.(?:xml|opf|xhtml|html|htm)$/i.test(file.name))return false;
   if(++count>600||file.originalSize>3*1024*1024||(bytes+=file.originalSize)>30*1024*1024)throw Error('This EPUB is too large. Choose a text-based EPUB under 30 MB unpacked.');
   return true;
  }});
  const entries={};let actual=0;
  for(const [name,content]of Object.entries(files)){
   if((actual+=content.byteLength)>30*1024*1024)throw Error('This EPUB is too large to import.');
   entries[name]=strFromU8(content);
  }
  self.postMessage({entries});
 }catch(error){self.postMessage({error:error.message||'This EPUB could not be opened.'});}
};
