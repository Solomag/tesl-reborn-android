const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const engine = fs.readFileSync('runtime/update-engine.js', 'utf8');
const sha = code => crypto.createHash('sha256').update(code).digest('hex');
const header = '// TESL-REBORN-ANDROID-CORE v1\n';
const code = revision => header + `globalThis.loadedRevision = ${revision};`;
function meta(revision, text = code(revision)) {
 return { schema:1, format:'tesl-reborn-hook-v1', loaderApi:1, gameVersionCode:11009, abi:'arm64-v8a',
 revision, version:`test-${revision}`, bytes:Buffer.byteLength(text), sha256:sha(text) };
}
const embedded = {meta:meta(5), code:code(5)};
function fixture(options = {}) {
 const disk={cores:{},state:null,config:options.config||{},inboxManifest:null,inbox:null};
 const events=[]; let loaded=[], shouldFail=false;
 function launch() {
  const io={
   readJSON:k=>disk[k] ? structuredClone(disk[k]) : null,
   writeJSON:(k,v)=>{ disk[k]=structuredClone(v); },
   readCore:h=>{ if(!disk.cores[h])throw Error('not found');return disk.cores[h]; },
   writeCore:(h,c)=>{disk.cores[h]=c;}, readInbox:()=>disk.inbox,
   sha256:sha,byteLength:x=>Buffer.byteLength(x),log:x=>events.push(x),
   evaluate:source=>{ loaded.push(source);if(shouldFail)throw Error('simulated partial hook installation'); }
  };
  const c={};vm.createContext(c);vm.runInContext(engine,c);
  const updater=c.createRebornUpdater(io,embedded);updater.boot();
  return updater;
 }
 return {disk,events,launch,get loaded(){return loaded;},set fail(v){shouldFail=v;}};
}
let scenarios=0;
{
 const f=fixture();const u=f.launch();assert.equal(f.loaded[0],code(5));u.ready();
 let network=0;u.check(()=>network++);assert.equal(network,0);assert.equal(u.status(),'no-feed');scenarios++;
}
{
 const f=fixture();const u=f.launch();u.ready();assert.equal(u.stage(meta(6),code(6)),true);
 assert.equal(f.loaded.length,1,'must not hot-swap live hooks');
 const next=f.launch();assert.equal(f.loaded.at(-1),code(6));assert.equal(f.disk.state.booting,meta(6).sha256);
 next.ready();assert.equal(f.disk.state.active.revision,6);assert.equal(f.disk.state.previous.revision,5);
 assert.equal(f.disk.state.pending,null);assert.equal(f.disk.state.booting,null);scenarios++;
}
{
 const f=fixture();f.launch().stage(meta(6),code(6));f.fail=true;
 const trial=f.launch();assert.equal(trial.status(),'load-failed-restart');
 assert.equal(f.loaded.length,2,'never evaluate a fallback after a partial hook installation');
 f.fail=false;const fallback=f.launch();assert.equal(f.loaded.at(-1),code(5));
 assert(f.disk.state.rejected.includes(meta(6).sha256));assert.equal(fallback.stage(meta(6),code(6)),false);scenarios++;
}
{
 const f=fixture();const u=f.launch();u.stage(meta(6),code(6));
 f.disk.cores[meta(6).sha256]='tampered';f.launch();assert.equal(f.loaded.at(-1),code(5));scenarios++;
}
{
 const f=fixture({config:{safeMode:true,allowLocalUpdates:true}});
 f.disk.inboxManifest=meta(6);f.disk.inbox=code(6);const u=f.launch();assert.equal(f.loaded.at(-1),code(5));
 assert.equal(f.disk.state,null);let calls=0;u.check(()=>calls++);assert.equal(calls,0);scenarios++;
}
{
 const f=fixture({config:{allowLocalUpdates:true}});f.disk.inboxManifest=meta(6);f.disk.inbox=code(6);
 const u=f.launch();assert.equal(f.loaded[0],code(6));u.ready();assert.equal(f.disk.state.active.revision,6);scenarios++;
}
{
 const f=fixture({config:{enabled:true,feedUrl:'https://updates.example/manifest.json'}});const u=f.launch();u.ready();
 const release={...meta(6),url:'https://updates.example/6/hook.js'};let paths=[];
 u.check((url,cb)=>{paths.push(url);cb(200,url.endsWith('manifest.json')?JSON.stringify(release):code(6));});
 assert.equal(paths.length,2);assert.equal(f.disk.state.pending.revision,6);assert.equal(f.loaded.length,1);
 u.check(()=>{throw Error('must check once per session');});scenarios++;
}
for (const kind of ['offline','bad-hash','other-origin','http','incompatible','old','bad-json']) {
 const f=fixture({config:{feedUrl:'https://updates.example/manifest.json'}});const u=f.launch();u.ready();
 const release={...meta(6),url:'https://updates.example/6/hook.js'};
 if(kind==='bad-hash')release.sha256='f'.repeat(64);
 if(kind==='other-origin')release.url='https://evil.example/hook.js';
 if(kind==='http')release.url='http://updates.example/hook.js';
 if(kind==='incompatible')release.gameVersionCode=12000;
 if(kind==='old')Object.assign(release,meta(4));
 u.check((url,cb)=>{if(kind==='offline')throw Error('network offline');
 cb(200,url.endsWith('manifest.json')?(kind==='bad-json'?'no json':JSON.stringify(release)):code(6));});
 assert.equal(f.disk.state?.pending || null,null,kind);assert.equal(f.loaded.length,1);scenarios++;
}
{
 const f=fixture();const u=f.launch();for(const url of ['http://x.test/a','https://u:p@x.test/a','https://x.test/a?token=secret','https://x.test/a#x','file:///x'])
 assert.throws(()=>u.httpsOrigin(url));
 assert.equal(u.httpsOrigin('https://UPDATES.example/hook.js'),'https://updates.example:443');
 assert.throws(()=>u.stage(meta(6),'wrong body'));assert.throws(()=>u.stage({...meta(6),bytes:9e6},code(6)));
 assert.throws(()=>u.stage({...meta(6),sha256:'../escape'},code(6)));scenarios++;
}
{
 // Interruption after publishing a hook but before publishing its state is harmless.
 const f=fixture();f.disk.cores[meta(6).sha256]=code(6);f.launch();assert.equal(f.loaded[0],code(5));scenarios++;
}
console.log(`PASS: ${scenarios} update lifecycle, rollback, integrity, offline and compatibility scenarios`);
{
 const f=fixture();f.disk.state={schema:1,active:meta(4),previous:null,pending:null,booting:null,rejected:[]};
 f.disk.cores[meta(4).sha256]=code(4);f.launch();
 assert.equal(f.loaded.at(-1),code(5),'a new APK must not select a cached core older than its embedded core');
}
{
 const disk={};const context={};vm.createContext(context);vm.runInContext(engine,context);
 const u=context.createRebornUpdater({readJSON:()=>null,writeJSON:()=>{},log:()=>{},byteLength:s=>Buffer.byteLength(s),
  sha256:sha,evaluate:()=>{},writeCore:(h,c)=>disk[h]=c,readCore:h=>disk[h]},
  {...embedded,feedUrl:'https://updates.example/manifest.json'});
 u.boot();u.ready();let requests=0;
 u.check((url,cb)=>{requests++;cb(200,JSON.stringify({...meta(6),url:'https://updates.example/6/hook.js'}));});
 assert.equal(requests,2,'embedded update channel works without external configuration');
}
console.log('PASS: APK upgrade revision floor and embedded HTTPS feed');
{
 const f=fixture();let u=f.launch();u.stage(meta(6),code(6));u=f.launch();u.ready();
 const newer={...meta(6),revision:7,version:'test-7-identical-core'};
 assert(u.stage(newer,code(6)));u=f.launch();u.ready();
 assert.equal(f.disk.state.active.revision,7,'a manifest-only release must commit its new revision');
 assert.equal(f.disk.state.pending,null);
}
console.log('PASS: higher revision with unchanged payload commits and clears pending');
