const vm=require('node:vm'),assert=require('node:assert/strict'),{transformSync}=require('esbuild');
const source=require('./source.cjs')('stall-probe');
// The frame bus measures the longest gap between frames natively; the probe
// reads (and clears) it once a second.
let gap=0,tick=null;const logs=[];
const c={section:(_,fn)=>fn(),log:m=>logs.push(m),setInterval:(fn,ms)=>{assert.equal(ms,1000);tick=fn;},
  __teslFrameBus:{takeMaxGap(){const value=gap;gap=0;return value;}}};
c.globalThis=c;
vm.createContext(c);vm.runInContext(transformSync(source,{loader:'ts'}).code,c);
assert(tick,'the probe reads the frame bus once a second');

gap=17;tick();
assert.equal(logs.length,0,'frames of a normal length are not reported');
gap=520;tick();
assert.deepEqual(logs,['main loop stalled 520ms'],'a blocked main thread is reported');
tick();
assert.equal(logs.length,1,'the gap is cleared once read');
gap=70000;tick();
assert.equal(logs.length,1,'the gap after the app was backgrounded is not a stall');
gap=250;tick();
assert.equal(logs[1],'main loop stalled 250ms','a 250ms hitch is reported');
vm.runInContext('__teslRebornStallProbe.loads=9;__teslRebornStallProbe.tasks=2',c);
gap=1500;tick();
assert.equal(logs[2],'main loop stalled 1500ms (asset loads 9, tasks 2)','the report carries what that second executed');
assert.equal(vm.runInContext('__teslRebornStallProbe.loads',c),0,'the asset load counter restarts');
assert.equal(vm.runInContext('__teslRebornStallProbe.tasks',c),0,'the task counter restarts');
gap=150;tick();
assert.equal(logs.length,3,'a 150ms gap stays below the reporting floor');

console.log('PASS: main loop stalls are read from the frame bus with their length and counters; backgrounded gaps are ignored');
