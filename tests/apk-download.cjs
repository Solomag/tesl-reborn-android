const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const c={Uint8Array,Uint32Array,DataView,Map,Blob,URL,AbortController,setTimeout,clearTimeout,console};vm.createContext(c);vm.runInContext(fs.readFileSync('builder/apk-download.js','utf8'),c);
for(const size of [0,1,55,56,63,64,65,1000,1048583]){const bytes=crypto.randomBytes(size),sha=c.apkSha256();for(let i=0;i<bytes.length;i+=37)sha.update(bytes.subarray(i,i+37));assert.equal(sha.hex(),crypto.createHash('sha256').update(bytes).digest('hex'));}
(async()=>{
 const bytes=crypto.randomBytes(700000),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 const meta={bytes:bytes.length,sha256:hash,url:'token/tesl-reborn.apk',verifiedUrl:'token/apk-verified'};
 let fail=true,requests=0;const reports=[];const elements={};for(const n of ['apk-start','apk-cancel','apk-save','apk-status'])elements[n]={hidden:true};
 c.document={getElementById:n=>elements[n]};
 c.fetch=async(url,options)=>{if(options.method==='POST'){reports.push([url,JSON.parse(options.body)]);return {status:204};}requests++;if(fail){fail=false;throw Error('reset');}const [start,end]=options.headers.Range.match(/\d+/g).map(Number);return {status:206,headers:{get:n=>n==='ETag'?'"'+hash+'"':`bytes ${start}-${end}/${bytes.length}`},arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset+start,bytes.byteOffset+end+1)};};
 c.installApkDownload(meta);await elements['apk-start'].onclick();assert.equal(elements['apk-save'].hidden,false);assert(elements['apk-status'].textContent.includes('verified'));assert.equal(requests,4);assert.deepEqual(reports,[['token/apk-verified',{sha256:hash}]],'the verified APK is reported to the PC');
 const downloaded=Buffer.from(await (await fetch(elements['apk-save'].href)).arrayBuffer());assert.deepEqual(downloaded,bytes);
 requests=0;await elements['apk-start'].onclick();assert.equal(requests,0,'a second tap after verification downloads nothing');assert.equal(elements['apk-save'].hidden,false);
 const bad=async()=>({status:200,headers:{get:()=>null}});await assert.rejects(()=>c.apkRange(bad,'url',0,1,2,hash),/Wrong APK/);
 // A full-size but corrupt response must never enable saving an APK.
 const e={};for(const n of Object.keys(elements))e[n]={hidden:true};c.document={getElementById:n=>e[n]};
 c.fetch=async()=>({status:206,headers:{get:n=>n==='ETag'?'"'+hash+'"':'bytes 0-3/4'},arrayBuffer:async()=>new Uint8Array(4).buffer});
 c.installApkDownload({...meta,bytes:4});await e['apk-start'].onclick();assert.equal(e['apk-save'].hidden,true);assert(e['apk-status'].textContent.includes('checksum mismatch'));

 // Pause, then resume: the download continues from the paused offset; the
 // already verified part is neither fetched nor replayed from 0%.
 {
  const p={};for(const n of Object.keys(elements))p[n]={hidden:true};c.document={getElementById:n=>p[n]};
  const seen=[],statuses=[];let pauseAfter=2;
  c.fetch=async(url,options)=>{if(options.method==='POST')return {status:204};const [start,end]=options.headers.Range.match(/\d+/g).map(Number);seen.push(start);
   if(seen.length===pauseAfter)p['apk-cancel'].onclick();
   return {status:206,headers:{get:n=>n==='ETag'?'"'+hash+'"':`bytes ${start}-${end}/${bytes.length}`},arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset+start,bytes.byteOffset+end+1)};};
  const status=p['apk-status'];let text='';Object.defineProperty(status,'textContent',{get:()=>text,set:v=>{text=v;statuses.push(v);}});
  c.installApkDownload({...meta,sha256:hash});
  // A fresh database name per run is not available here; the memory store is used.
  await p['apk-start'].onclick();
  assert(text.startsWith('Paused at '),text);
  const pausedSeen=seen.length;pauseAfter=-1;statuses.length=0;
  await p['apk-start'].onclick();
  assert(statuses[0].startsWith('Resuming from '),statuses[0]);
  assert(!statuses.some(v=>/^APK: [01]% /.test(v)),'no replay from 0% after a pause');
  assert.equal(p['apk-save'].hidden,false);assert(text.includes('verified'));
  assert.equal(new Set(seen).size,seen.length,'no chunk is fetched twice across the pause');
 }
 console.log('PASS: LAN HTTP SHA-256 vectors, range validation, retry, verified-APK report, pause/resume from the paused offset, exact final Blob and corrupt-file rejection');
})().catch(e=>{console.error(e);process.exit(1);});
