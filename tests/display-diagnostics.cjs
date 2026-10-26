const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
const reports=[];const c={section:()=>{},globalThis:null,Date};c.globalThis=c;c.TeslRebornUpdater={current:()=>({revision:49})};
vm.createContext(c);vm.runInContext(transformSync(require('./source.cjs')('display-diagnostics'),{loader:'ts'}).code,c);
const trace=c.createDisplayTrace(report=>reports.push(structuredClone(report)));
trace('sample',{width:1920,height:1080,canvasScale:1});trace('sample',{width:1920,height:1080,canvasScale:1});assert.equal(reports.length,1);
trace('SetResolution',{width:1280,height:720});trace('sample',{width:1280,height:720,canvasScale:.667});trace('sample',{width:1920,height:1080,canvasScale:1});
assert.equal(reports[3].events.length,4);assert.equal(reports[3].events[2].width,1280);assert.equal(reports[3].events[3].width,1920);
for(let i=0;i<100;i++)trace('sample',{width:i,height:1080});assert.equal(reports.at(-1).events.length,60);
console.log('PASS: resolution/Canvas changes are preserved across transient samples, identical frames deduplicate and trace stays bounded');

const current={width:2848,height:1440,fullscreen:true};
assert(c.redundantSettingsResolution([2848,1440,true],current,true));
assert(c.redundantSettingsResolution([2848,1440,true,0],current,true));
for(const [values,settings] of [[[1920,1080,true],true],[[2848,1440,true,60],true],[[2848,1440,true],false]])
 assert.equal(c.redundantSettingsResolution(values,current,settings),false);
console.log('PASS: only redundant Settings resolution requests are skipped; real size/refresh changes pass through; mobile fullscreen restoration is ignored');

assert(c.redundantSettingsResolution([2848,1440,false],current,true),"Android Settings false fullscreen must not recreate an identical-size surface");
