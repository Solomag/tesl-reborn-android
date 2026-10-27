const vm=require('node:vm'),assert=require('node:assert/strict'),{transformSync}=require('esbuild');
const source=require('./source.cjs')('bundle-hashes');
function manifestOf(names){return {method:name=>name==='GetAllAssetBundles'
  ?{invoke:()=>({length:names.length,get:i=>({content:names[i]})})}
  :{invoke:value=>({method:()=>({invoke:()=>({content:`hash-${value}`})})})}};}
function boot(){
  const session={clock:0,hook:null,state:{value:null},writes:[],logs:[]};
  const c={section:(_,fn)=>fn(),img:{},cls:(_,name)=>name==='AssetBundles.AssetBundleManager'?{field:()=>({value:session.state.value})}:{method:()=>({virtualAddress:'SetCacheExpiration'})},
    Interceptor:{attach:(_,handlers)=>{session.hook=handlers;}},isNull:x=>x==null,
    Date:class extends Date{static now(){return session.clock;}},
    Il2Cpp:{string:x=>x,corlib:{class:()=>({method:()=>({invoke:(path,text)=>session.writes.push({path,text})})})}},
    log:message=>session.logs.push(message)};
  vm.createContext(c);vm.runInContext(transformSync(source,{loader:'ts'}).code,c);
  assert(session.hook&&session.hook.onEnter,'the report observes SetCacheExpiration');
  session.attempt=()=>session.hook.onEnter();
  session.missing=()=>session.logs.filter(m=>m.includes('not loaded yet')).length;
  return session;
}

// The manifest is available: the report is written once.
let s=boot();s.state.value=manifestOf(['a.bundle','b.bundle']);s.attempt();
assert.equal(s.writes.length,1,'the hashes are written');
assert.equal(s.writes[0].path,'/sdcard/Android/data/com.bethsoft.theelderscrollslegends/files/tesl-bundle-hashes.txt');
assert.equal(s.writes[0].text,'a.bundle hash-a.bundle\nb.bundle hash-b.bundle');
assert(s.logs.some(m=>/^bundle hashes: wrote 2 entries to .* in \d+ms$/.test(m)),'the cost of the report is visible in the log');

// Repeated cache expiration updates (the normal asset path) must not repeat it.
for(const delay of [1000,30000,120000]){s.clock+=delay;s.attempt();}
assert.equal(s.writes.length,1,'a per-asset diagnostic must not run for every asset');

// A missing manifest is retried, but not on every call: the retry is spread
// over a minute and gives up after three attempts.
s=boot();s.attempt();
assert.equal(s.writes.length,0);
assert.equal(s.missing(),1);
s.clock+=1000;s.attempt();
assert.equal(s.missing(),1,'the retry is throttled');
for(const delay of [60000,60000]){s.clock+=delay;s.attempt();}
assert.equal(s.missing(),3,'three attempts are enough for a manifest that never appears');
s.clock+=120000;s.state.value=manifestOf(['a.bundle']);s.attempt();
assert.equal(s.writes.length,0,'the attempts are exhausted, the hook stays silent');

// Once written, the report stays written.
s=boot();s.state.value=manifestOf(['a.bundle']);s.attempt();
assert.equal(s.writes.length,1);
s.clock+=120000;s.attempt();
assert.equal(s.writes.length,1);

console.log('PASS: bundle hash report is written once, throttled while the manifest is missing and never repeated on the asset path');
