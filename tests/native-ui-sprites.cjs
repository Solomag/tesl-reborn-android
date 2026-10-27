const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
let done=false,freed=0,assigned=null,loaded=0;const tasks=[];
const sprite={ref:()=>({target:sprite,free:()=>{}})},operation={ref:()=>({target:operation,free:()=>freed++}),method:()=>({inflate:()=>({invoke:()=>sprite})})};
const image={ref:()=>({target:image,free:()=>freed++})};
const c={Date,section:()=>{},schedule:(_,fn)=>tasks.push(fn),img:{},isNull:x=>x==null,Il2Cpp:{string:x=>x},log:()=>{},rgba:()=>({}),
 cls:()=>({method:()=>({invoke:()=>({method:()=>({overload:()=>({invoke:path=>{assert(/(input-frame|close-x-icon)$/.test(path));return operation;}})})})})}),
 ucls:()=>({type:{object:'Sprite'}}),call:(obj,name,value)=>{if(name==='IsDone')return done;if(name==='set_sprite')assigned=value;}};
vm.createContext(c);vm.runInContext(transformSync(require('./source.cjs')('native-ui-sprites'),{loader:'ts'}).code,c);
c.loadNativeUiSprite('AppBase/UI/Sprites/Core/UtilityAssets/input-frame',image,()=>loaded++);
assert.equal(assigned,null);tasks.shift()();assert.equal(assigned,null);done=true;tasks.shift()();assert.equal(assigned,sprite);assert.equal(loaded,1);assert.equal(freed,2);
// A second window gets the loaded sprite in the same call, without a load.
const other={ref:()=>({target:other,free:()=>freed++})};assigned=null;let again=0;
c.loadNativeUiSprite('AppBase/UI/Sprites/Core/UtilityAssets/input-frame',other,()=>again++);
assert.equal(assigned,sprite,'cached sprite applied synchronously');assert.equal(again,1);assert.equal(tasks.length,0,'no asset load for a cached sprite');
console.log('PASS: native input sprite loads asynchronously, applies to existing UI, releases operation/image roots and is reused from cache');

// Preloading (image null) fills the cache; the deck list then gets the sprite at once.
{
 tasks.length=0;done=true;let preloaded=0;
 c.loadNativeUiSprite('AppBase/UI/Sprites/Core/UtilityAssets/close-x-icon',null,()=>preloaded++);
 tasks.shift()();assert.equal(preloaded,1,'a preload completes without an image');
 const late={ref:()=>({target:late,free:()=>{}})};assigned=null;
 c.loadNativeUiSprite('AppBase/UI/Sprites/Core/UtilityAssets/close-x-icon',late);
 assert.equal(assigned,sprite);assert.equal(tasks.length,0,'served from the preloaded cache');
 console.log('PASS: a preload without an image fills the cache for the first window that needs the sprite');
}
