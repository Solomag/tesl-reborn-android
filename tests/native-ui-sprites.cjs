const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
let done=false,freed=0,assigned=null,loaded=0;const tasks=[];
const sprite={},operation={ref:()=>({target:operation,free:()=>freed++}),method:()=>({inflate:()=>({invoke:()=>sprite})})};
const image={ref:()=>({target:image,free:()=>freed++})};
const c={Date,section:()=>{},schedule:(_,fn)=>tasks.push(fn),img:{},isNull:x=>x==null,Il2Cpp:{string:x=>x},log:()=>{},rgba:()=>({}),
 cls:()=>({method:()=>({invoke:()=>({method:()=>({overload:()=>({invoke:path=>{assert(path.endsWith('input-frame'));return operation;}})})})})}),
 ucls:()=>({type:{object:'Sprite'}}),call:(obj,name,value)=>{if(name==='IsDone')return done;if(name==='set_sprite')assigned=value;}};
vm.createContext(c);vm.runInContext(transformSync(require('./source.cjs')('native-ui-sprites'),{loader:'ts'}).code,c);
c.loadNativeUiSprite('AppBase/UI/Sprites/Core/UtilityAssets/input-frame',image,()=>loaded++);
assert.equal(assigned,null);tasks.shift()();assert.equal(assigned,null);done=true;tasks.shift()();assert.equal(assigned,sprite);assert.equal(loaded,1);assert.equal(freed,2);
console.log('PASS: native input sprite loads asynchronously, applies to existing UI and releases operation/image roots');
