// Incremental SHA-256 also works on plain LAN HTTP, where SubtleCrypto is unavailable.
function apkSha256() {
 const k=new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
 const h=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
 const pending=new Uint8Array(64),w=new Uint32Array(64);let used=0,total=0;
 const rr=(x,n)=>(x>>>n)|(x<<(32-n));
 function block(data){const view=new DataView(data.buffer,data.byteOffset,64);for(let i=0;i<16;i++)w[i]=view.getUint32(i*4);for(let i=16;i<64;i++){const a=w[i-15],b=w[i-2];w[i]=(w[i-16]+(rr(a,7)^rr(a,18)^(a>>>3))+w[i-7]+(rr(b,17)^rr(b,19)^(b>>>10)))>>>0;}let [a,b,c,d,e,f,g,j]=h;for(let i=0;i<64;i++){const t=(j+(rr(e,6)^rr(e,11)^rr(e,25))+((e&f)^(~e&g))+k[i]+w[i])>>>0;const u=((rr(a,2)^rr(a,13)^rr(a,22))+((a&b)^(a&c)^(b&c)))>>>0;j=g;g=f;f=e;e=(d+t)>>>0;d=c;c=b;b=a;a=(t+u)>>>0;}[a,b,c,d,e,f,g,j].forEach((v,i)=>h[i]=(h[i]+v)>>>0);}
 return {update(bytes){total+=bytes.length;let pos=0;while(pos<bytes.length){const n=Math.min(64-used,bytes.length-pos);pending.set(bytes.subarray(pos,pos+n),used);used+=n;pos+=n;if(used===64){block(pending);used=0;}}},hex(){const bits=total*8;pending[used++]=128;if(used>56){pending.fill(0,used);block(pending);used=0;}pending.fill(0,used,56);const v=new DataView(pending.buffer);v.setUint32(56,Math.floor(bits/4294967296));v.setUint32(60,bits>>>0);block(pending);return [...h].map(x=>x.toString(16).padStart(8,'0')).join('');}};
}
async function apkRange(fetcher,url,offset,end,total,hash,signal) {
 const response=await fetcher(url,{headers:{Range:`bytes=${offset}-${end}`,'If-Range':`"${hash}"`},cache:'no-store',signal});
 if(response.status!==206 || response.headers.get('Content-Range')!==`bytes ${offset}-${end}/${total}` || response.headers.get('ETag')!==`"${hash}"`)throw Error('Wrong APK range or file changed. Scan a fresh QR.');
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(bytes.length!==end-offset+1)throw Error('Incomplete APK chunk');
 return bytes;
}
function installApkDownload(meta) {
 const start=document.getElementById('apk-start'),cancel=document.getElementById('apk-cancel'),save=document.getElementById('apk-save'),status=document.getElementById('apk-status');
 if(!start)return;
 let active=false,request=null,blobUrl=null;
 const step=256*1024;let memory=new Map(),db=null;
 async function database(){if(db)return db;if(!globalThis.indexedDB)return null;try{db=await new Promise((resolve,reject)=>{const r=indexedDB.open('tesl-apk-chunks',1);r.onupgradeneeded=()=>r.result.createObjectStore('chunks');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return db;}catch(_){return null;}}
 async function stored(offset,bytes){const d=await database(),key=meta.sha256+':'+offset;if(!d){if(bytes)memory.set(key,bytes);return memory.get(key);}return new Promise((resolve,reject)=>{const tx=d.transaction('chunks',bytes?'readwrite':'readonly'),s=tx.objectStore('chunks');let result;const r=bytes?s.put(bytes,key):s.get(key);r.onsuccess=()=>result=r.result;tx.oncomplete=()=>resolve(bytes||result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
 async function clear(){const d=await database();memory.clear();if(d)await new Promise((resolve,reject)=>{const tx=d.transaction('chunks','readwrite'),store=tx.objectStore('chunks'),r=store.openCursor();r.onsuccess=()=>{const c=r.result;if(c){if(String(c.key).startsWith(meta.sha256+':'))c.delete();c.continue();}};tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
 // Progress survives a pause: the hash state, the verified parts and the next
 // offset stay here, so Download / resume continues where it stopped instead
 // of replaying and rehashing every stored chunk from 0%, which on a phone
 // looked and took as long as a restart.
 let sha=apkSha256(),parts=[],next=0,verified=false;
 const percent=bytes=>Math.floor(bytes*100/meta.bytes);
 const paused=()=>{status.textContent=`Paused at ${percent(next)}%. Download / resume continues from here.`;};
 cancel.onclick=()=>{active=false;request?.abort();paused();};
 start.onclick=async()=>{
  if(active)return;
  if(verified){save.hidden=false;status.textContent='APK already verified. Tap Save verified APK.';return;}
  active=true;start.disabled=true;cancel.hidden=false;save.hidden=true;
  try {
   if(next>0)status.textContent=`Resuming from ${percent(next)}%…`;
   for(let offset=next;offset<meta.bytes;offset+=step){
    if(!active)throw Error('Paused');
    const end=Math.min(offset+step,meta.bytes)-1;let bytes=await stored(offset);
    if(bytes && bytes.length!==end-offset+1)bytes=null;
    if(!bytes){for(let attempt=0;;attempt++){
     if(!active)throw Error('Paused');request=new AbortController();const timer=setTimeout(()=>request.abort(),15000);
     try{bytes=await apkRange(fetch,meta.url,offset,end,meta.bytes,meta.sha256,request.signal);break;}
     catch(error){if(!active||attempt>=7)throw error;status.textContent='Connection interrupted. Retrying chunk…';await new Promise(r=>setTimeout(r,Math.min(5000,500*(attempt+1))));}
     finally{clearTimeout(timer);}
    }await stored(offset,bytes);}
    sha.update(bytes);parts.push(bytes);next=end+1;status.textContent=`APK: ${percent(next)}% — ${next} / ${meta.bytes} bytes`;
   }
   status.textContent='Checking full APK SHA-256…';
   // hex() finalizes the hash: a mismatch starts over from a fresh state.
   if(sha.hex()!==meta.sha256){await clear();sha=apkSha256();parts=[];next=0;throw Error('APK checksum mismatch. Nothing saved. Please retry.');}
   verified=true;
   if(blobUrl)URL.revokeObjectURL(blobUrl);
   blobUrl=URL.createObjectURL(new Blob(parts,{type:'application/vnd.android.package-archive'}));
   save.href=blobUrl;save.download=meta.name||'tesl-reborn.apk';save.hidden=false;
   status.textContent='APK verified. Tap Save verified APK, then open it from Downloads.';
   // Tell the PC: a browser cannot see the installation, but it can say the
   // verified APK reached the phone. Best effort; the page works without it.
   try{await fetch(meta.verifiedUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sha256:meta.sha256}),cache:'no-store'});}catch(_){}
  // A chunk that finished after Pause still counts; the last word is the
  // offset the next Download / resume starts from.
  }catch(error){if(active)status.textContent=String(error.message||error)+' — tap Download / resume to continue.';else paused();}
  finally{active=false;start.disabled=false;cancel.hidden=true;}
 };
}
