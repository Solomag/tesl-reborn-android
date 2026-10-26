const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto'), { transformSync } = require('esbuild');
const noticeSource = transformSync(require('./source.cjs')('update-notices'), {loader:'ts'}).code;
const engine = fs.readFileSync('runtime/update-engine.js','utf8');
const sha = value => createHash('sha256').update(value).digest('hex');
const code = revision => '// TESL-REBORN-ANDROID-CORE v1\n// test ' + revision;
const meta = revision => ({schema:1,format:'tesl-reborn-hook-v1',loaderApi:1,gameVersionCode:11009,
  abi:'arm64-v8a',revision,version:'test-'+revision,bytes:Buffer.byteLength(code(revision)),sha256:sha(code(revision))});

// Exercise the notifications against the unchanged API 1 loader, including
// actual verification/staging. A completed HTTP request alone is not success.
function fixture() {
  const disk={config:{feedUrl:'https://example.com/manifest.json'},state:null,status:null}, cores={}, events=[], loaded=[];
  let journal=null;
  const context={};vm.createContext(context);vm.runInContext(engine+'\n'+noticeSource,context);
  function boot() {
    const updater=context.createRebornUpdater({readJSON:key=>disk[key],writeJSON:(key,value)=>disk[key]=structuredClone(value),
      readCore:hash=>cores[hash],writeCore:(hash,value)=>cores[hash]=value,sha256:sha,byteLength:value=>Buffer.byteLength(value),
      log:()=>{},evaluate:value=>loaded.push(value)}, {meta:meta(35),code:code(35)});
    updater.boot();updater.ready();
    const notices=context.createUpdateNotices(updater,{readNotice:()=>journal,readStatus:()=>disk.status,
      writeNotice:value=>journal=structuredClone(value),emit:(kind,revision,onShown)=>{events.push({kind,revision});onShown?.();}});
    return {updater,notices};
  }
  return {disk,cores,events,loaded,boot};
}
let f=fixture(), live=f.boot(), requests=[];
assert.deepEqual(f.events,[],'first install is not announced as a newly applied OTA');
live.notices.check((url,callback)=>requests.push({url,callback}));
assert.deepEqual(f.events,[],'checking silently must not disturb login or offline play');
requests[0].callback(200,JSON.stringify({...meta(36),url:'https://example.com/core.js'}));
assert.equal(f.events.at(-1).kind,'downloading');assert.equal(f.disk.state,null);
requests[1].callback(200,code(36));assert.equal(f.events.at(-1).kind,'restart');
assert.equal(f.loaded.length,1,'never replace running hooks or restart the game');
live.notices.poll();live.notices.poll();assert.equal(f.events.filter(e=>e.kind==='restart').length,1);
live=f.boot();assert.equal(f.events.at(-1).kind,'applied');assert.equal(f.events.at(-1).revision,36);
const count=f.events.length;f.boot();assert.equal(f.events.length,count,'applied notice appears once per revision');

f=fixture();live=f.boot();requests=[];
live.notices.check((url,callback)=>requests.push({url,callback}));
requests[0].callback(200,JSON.stringify({...meta(36),url:'https://example.com/core.js'}));
requests[1].callback(200,'corrupt payload');
assert.deepEqual(f.events.map(e=>e.kind),['downloading','error']);assert.equal(f.disk.state,null);
assert.equal(f.loaded.length,1,'verification failure keeps the current game code');

for(const outcome of ['offline','current']) {
 f=fixture();live=f.boot();
 live.notices.check((url,callback)=>callback(outcome==='offline'?-1:200,outcome==='offline'?'offline':JSON.stringify({...meta(35),url:'https://example.com/core.js'})));
 assert.deepEqual(f.events,[],outcome+' checks must not create recurring notifications');
}
f=fixture();live=f.boot();requests=[];
live.notices.check((url,callback)=>requests.push({url,callback}));
requests[0].callback(200,JSON.stringify({...meta(36),url:'https://example.com/core.js'}));
requests[1].callback(-1,'offline');assert.equal(f.events.at(-1).kind,'error');

// When this UI itself first arrives over OTA, no notice journal exists yet.
const context={};vm.createContext(context);vm.runInContext(noticeSource,context);
const first=[];
context.createUpdateNotices({current:()=>meta(36)}, {readNotice:()=>null,readStatus:()=>({previous:meta(35)}),writeNotice:()=>{},emit:kind=>first.push(kind)});
assert.deepEqual(first,['applied']);
let acknowledged=null,persisted=null;
context.createUpdateNotices({current:()=>meta(36)}, {readNotice:()=>({revision:36}),readStatus:()=>({previous:meta(35)}),writeNotice:value=>persisted=value,emit:(kind,revision,onShown)=>acknowledged=onShown});
assert.equal(persisted,null,'an old attempted notice must not count as displayed');
acknowledged();assert.equal(persisted.shownRevision,36);
for(const language of ['en_us','ru_ru','de_de','es_es','es_mx','fr_fr','it_it','pl_pl','pt_br','tr_tr'])
 for(const kind of ['downloading','restart','applied','error']) assert(context.updateNoticeText(kind,36,language).length>10);
assert(context.updateNoticeText('applied',36,'ru_ru').includes('36'));
assert(context.updateNoticeText('restart',36,'unknown').startsWith('Reborn'));

// Replay the actual renderer with strict fake managed objects. Startup fonts
// may be unavailable, scenes may change and the latest result must win.
let clock=1000, fontReady=false, screen={width:3120,height:1440};
const objects=[],calls=[],placements=[],logs=[];
function object(name) {
 const value={name,active:true,dead:false};
 value.ref=()=>({target:value,free:()=>calls.push([value,'free'])});
 objects.push(value);return value;
}
const r={Date:class extends Date {static now(){return clock;}},PLUGIN_VERSION:'1.3.1-beta',
 globalThis:null,persistentPath:()=>'/files',readTextFile:()=>'{"androidBuild":38}',writeTextFile:()=>true,
 ucls:name=>({name,type:{object:name},nested:n=>{assert.equal(name,'UnityEngine.UI.CanvasScaler');assert.equal(n,'ScaleMode');return {field:()=>({value:1})};},method:method=>({overload:()=>({invoke:value=>{calls.push([value,method]);if(method==='Destroy')value.dead=true;}})})}),
 newWith:(type,name)=>object(name),Il2Cpp:{string:value=>value,array:()=>[],corlib:{class:()=>({})}},
 uiAdd:(go,type)=>{assert(!/GraphicRaycaster|Button|EventTrigger/.test(type));return object(type);},
 uiEnum:(type,field)=>field,enumBox:(_,v)=>v,enumVal:v=>v,vec2:(x,y)=>({x,y}),rgba:(...values)=>values,
 uiNew:name=>object(name),uiRect:value=>value,uiStretch:()=>{},uiText:(go,text)=>object('label'),
 uiPlace:(...args)=>placements.push(args),chatScreen:()=>screen,resourceLanguage:()=> 'ru_ru',log:value=>logs.push(value),
 call:(value,method,...args)=>{
  if(value.dead)throw Error('destroyed native object');
  calls.push([value,method,...args]);
  if(method==='get_activeSelf')return value.active;
  if(method==='SetActive'){value.active=args[0];return;}
  if(method==='get_scaleFactor')return 2;
  if(method==='get_transform')return value;
  if(method==='get_yMax')return screen.height-40;
 }};
// Screen.safeArea is optional in older Unity builds: emulate its absence.
r.globalThis=r;r.TeslRebornUpdater={current:()=>({revision:37})};
vm.createContext(r);vm.runInContext(noticeSource,r);
r.uiSystemText=(go,text)=>{if(!fontReady)throw Error('font not loaded');return object('label');};
const banner=r.createUpdateBanner();banner.show('downloading',0);banner.tick();
assert(objects.filter(o=>o.name==='RebornUpdateNotice').every(o=>o.dead),'partial UI is discarded if the built-in font is not available yet');
banner.show('restart',0);fontReady=true;clock=9000;banner.tick();
const root=objects.find(o=>o.name==='RebornUpdateNotice'&&!o.dead);assert(root.active);
assert(calls.some(([o,m,v])=>m==='set_text'&&String(v).includes('APK 38 · patch 37')),'loaded version is persistently visible');
assert(calls.some(([o,m,v])=>m==='set_blocksRaycasts'&&v===false));
assert(calls.some(([o,m,v])=>m==='set_interactable'&&v===false));
assert(calls.some(([o,m,v])=>m==='set_raycastTarget'&&v===false));
assert(calls.some(([o,m])=>o===root&&m==='DontDestroyOnLoad'));
assert(calls.some(([o,m,v])=>m==='set_text'&&v.includes('скачано и проверено')));
assert(!calls.some(([o,m,v])=>m==='set_text'&&String(v).includes('Скачивается')),'completion replaces a queued stale download notice');
clock=18000;screen={width:1440,height:3120};banner.tick();assert(root.active,'timeout starts when the UI is actually drawn');
assert(placements.at(-1)[7]<=screen.width/2-32,'banner follows resolution changes');
clock=19000;banner.tick();assert.equal(root.active,true,'version footer remains visible after the notification disappears');
assert.equal(objects.filter(o=>o.name==='Banner').at(-1).active,false);
let displayed=0;banner.show('applied',36,()=>displayed++);banner.tick();assert.equal(displayed,0);
clock+=250;banner.tick();assert.equal(displayed,1,'acknowledge only after a successful subsequent display tick');
assert.equal(objects.filter(o=>o.name==='RebornUpdateNotice'&&!o.dead).length,1,'reuse the persistent canvas');
root.dead=true;banner.show('downloading',0);banner.tick();
assert.equal(objects.filter(o=>o.name==='RebornUpdateNotice'&&!o.dead).length,1,'unexpectedly destroyed UI can be rebuilt safely');
assert(!calls.some(([o,m])=>/Quit|Pause|SetSelectedGameObject/.test(m)));

// The installed-core adapter initiates the request during bootstrap, without
// any login/token callback and without depending on native APK changes.
const scheduled=[],transport=[];
r.persistentPath=()=>'/files';r.readTextFile=()=>'';r.writeTextFile=()=>true;r.atomicRename=()=>true;
r.img={};r.cls=()=>({method:()=>({virtualAddress:'ServicesManager.Update'})});
r.Interceptor={attach:()=>{}};r.schedule=(delay,fn)=>scheduled.push({delay,fn});
r.httpGet=(url,auth,callback,update)=>transport.push({url,auth,update});
f=fixture();r.installUpdateNotices(f.boot().updater);
assert.equal(scheduled.length,1);assert.equal(scheduled[0].delay,1000);
scheduled[0].fn();assert.equal(transport.length,1);
assert.equal(transport[0].auth,false);assert.equal(transport[0].update,true);
console.log('PASS: API 1 update notices, verified-only completion, once-only activation, offline silence, font retry, noninteractive scene-persistent UI and automatic expiry');
