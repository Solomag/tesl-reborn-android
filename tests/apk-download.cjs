const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const c={Uint8Array,Uint32Array,DataView,Map,Blob,URL,AbortController,setTimeout,clearTimeout,console};vm.createContext(c);vm.runInContext(fs.readFileSync('builder/apk-download.js','utf8'),c);
for(const size of [0,1,55,56,63,64,65,1000,1048583]){const bytes=crypto.randomBytes(size),sha=c.apkSha256();for(let i=0;i<bytes.length;i+=37)sha.update(bytes.subarray(i,i+37));assert.equal(sha.hex(),crypto.createHash('sha256').update(bytes).digest('hex'));}
(async()=>{
 const bytes=crypto.randomBytes(700000),hash=crypto.createHash('sha256').update(bytes).digest('hex');
 const meta={bytes:bytes.length,sha256:hash,url:'token/tesl-reborn.apk'};
 let fail=true,requests=0;const elements={};for(const n of ['apk-start','apk-cancel','apk-save','apk-status'])elements[n]={hidden:true};
 c.document={getElementById:n=>elements[n]};
 c.fetch=async(url,options)=>{requests++;if(fail){fail=false;throw Error('reset');}const [start,end]=options.headers.Range.match(/\d+/g).map(Number);return {status:206,headers:{get:n=>n==='ETag'?'"'+hash+'"':`bytes ${start}-${end}/${bytes.length}`},arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset+start,bytes.byteOffset+end+1)};};
 c.installApkDownload(meta);await elements['apk-start'].onclick();assert.equal(elements['apk-save'].hidden,false);assert(elements['apk-status'].textContent.includes('verified'));assert.equal(requests,4);
 const downloaded=Buffer.from(await (await fetch(elements['apk-save'].href)).arrayBuffer());assert.deepEqual(downloaded,bytes);
 requests=0;await elements['apk-start'].onclick();assert.equal(requests,0,'second attempt uses locally saved complete chunks');
 const bad=async()=>({status:200,headers:{get:()=>null}});await assert.rejects(()=>c.apkRange(bad,'url',0,1,2,hash),/Wrong APK/);
 // A full-size but corrupt response must never enable saving an APK.
 const e={};for(const n of Object.keys(elements))e[n]={hidden:true};c.document={getElementById:n=>e[n]};
 c.fetch=async()=>({status:206,headers:{get:n=>n==='ETag'?'"'+hash+'"':'bytes 0-3/4'},arrayBuffer:async()=>new Uint8Array(4).buffer});
 c.installApkDownload({...meta,bytes:4});await e['apk-start'].onclick();assert.equal(e['apk-save'].hidden,true);assert(e['apk-status'].textContent.includes('checksum mismatch'));
 console.log('PASS: LAN HTTP SHA-256 vectors, range validation, retry, saved chunks, exact final Blob and corrupt-file rejection');
})().catch(e=>{console.error(e);process.exit(1);});
