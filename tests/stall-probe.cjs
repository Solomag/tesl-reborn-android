const vm=require('node:vm'),assert=require('node:assert/strict'),{transformSync}=require('esbuild');
const source=require('./source.cjs')('stall-probe');
let clock=0,hook=null;const logs=[];
const c={section:(_,fn)=>fn(),img:{},cls:()=>({method:()=>({virtualAddress:'ServicesManager.Update'})}),
  Interceptor:{attach:(_,handlers)=>{hook=handlers;}},Date:class extends Date{static now(){return clock;}},log:m=>logs.push(m)};
vm.createContext(c);vm.runInContext(transformSync(source,{loader:'ts'}).code,c);
assert(hook&&hook.onEnter,'the probe observes the service update');

hook.onEnter();clock=16;hook.onEnter();clock=17;hook.onEnter();
assert.equal(logs.length,0,'frames of a normal length are not reported');

clock=537;hook.onEnter();                                  // gap 520ms
assert.deepEqual(logs,['main loop stalled 520ms'],'a blocked main thread is reported');

clock=937;hook.onEnter();                                  // gap 400ms, still inside the quiet window
assert.equal(logs.length,1,'the probe is rate limited');

clock=1937;hook.onEnter();                                 // gap 1000ms after the quiet window
assert.deepEqual(logs,['main loop stalled 520ms','main loop stalled 1000ms'],'the next stall is reported');

clock+=70000;hook.onEnter();
assert.equal(logs.length,2,'the gap after the app was backgrounded is not a stall');

clock+=500;hook.onEnter();
assert.equal(logs.length,3,'reporting resumes after the ignored gap');

// Match hitches are shorter than loading stalls: after an ignored gap a
// 250ms hitch crosses the 200ms floor, and the counters of the blocked
// window ride along with the message.
clock+=70000;hook.onEnter();
assert.equal(logs.length,3,'the second backgrounded gap is ignored too');
clock+=250;hook.onEnter();
assert.equal(logs[3],'main loop stalled 250ms','a 250ms hitch below the old floor is reported');
vm.runInContext('__teslRebornStallProbe.loads=9;__teslRebornStallProbe.tasks=2',c);
clock+=1500;hook.onEnter();
assert.equal(logs[4],'main loop stalled 1500ms (asset loads 9, tasks 2)','the report carries what the blocked window executed');
assert.equal(vm.runInContext('__teslRebornStallProbe.loads',c),0,'the asset load counter restarts with the next window');
assert.equal(vm.runInContext('__teslRebornStallProbe.tasks',c),0,'the task counter restarts with the next window');
clock+=150;hook.onEnter();
assert.equal(logs.length,5,'a 150ms gap stays below the reporting floor and inside the quiet window');

console.log('PASS: main loop stalls are reported with their length and window counters, rate limited and backgrounded gaps are ignored');
