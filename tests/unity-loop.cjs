const vm=require('node:vm'),assert=require('node:assert/strict'),{transformSync}=require('esbuild');
const source=require('./source.cjs')('unity-loop-plan');
// Reports 143-144: what the hang watch sets back in Unity's Java loop, from
// the loop's flags, Unity's own state and Android's.
const c={};vm.createContext(c);vm.runInContext(transformSync(source,{loader:'ts'}).code+';globalThis.plan=unityLoopPlan;',c);
const ok={loopRunning:true,loopSurface:true,unityRunning:true,unityPaused:false,unityFocus:true,windowFocus:true,surfaceValid:true,finishing:false};
const plan=s=>Array.from(c.plan({...ok,...s}));

assert.deepEqual(plan({}),[],'a loop with both flags set is left alone');
assert.deepEqual(plan({loopSurface:false}),['surface'],'a lost surface is attached again when the SurfaceView has one');
assert.deepEqual(plan({loopSurface:false,surfaceValid:false}),[],'without a valid surface there is nothing to attach');
assert.deepEqual(plan({loopRunning:false}),['loop'],'Unity resumed with its loop stopped: the loop is started');
assert.deepEqual(plan({loopRunning:false,unityRunning:false}),['resume'],'a missed resume is sent again');
assert.deepEqual(plan({loopRunning:false,unityRunning:false,unityFocus:false}),['focus','resume'],'a missed window focus comes first: it resumes Unity by itself');
assert.deepEqual(plan({loopRunning:false,unityRunning:false,unityFocus:false,windowFocus:false}),['resume'],'focus Android does not report is not invented');
assert.deepEqual(plan({loopRunning:false,unityRunning:false,unityFocus:false,windowFocus:null}),['resume'],'an unreadable window focus is not invented either');
assert.deepEqual(plan({loopSurface:false,loopRunning:false}),['surface','loop'],'both flags are set back');
assert.deepEqual(plan({loopSurface:false,loopRunning:false,unityPaused:true}),[],'nothing while the activity is paused');
assert.deepEqual(plan({loopSurface:false,finishing:true}),[],'nothing while the activity is finishing');
assert.deepEqual(plan({loopSurface:false,finishing:null}),[],'nothing when finishing could not be read');

console.log('PASS: the hang watch sets back only what Unity\'s loop misses and Android has, never while paused');
