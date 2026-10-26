const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
let now=0,done=false,missing=false,loads=0,delivered=0,freed=0,inside=false,factoryHook;
const tasks=[],logs=[];
const op={method:()=>({inflate:()=>({invoke:()=>missing?null:{handle:'sprite'}})})};
const fields=['$PC','$current','imageUrl','callback','operation'].map(name=>({name,type:{name:name==='operation'?'AssetBundles.AssetBundleLoadAssetOperation':'unused'}}));
const iterator={declaringClass:{name:'StoreImageUtils'},name:'<LoadStoreImageCoroutine>c__Iterator3',fields,method:()=>({virtualAddress:{isNull:()=>false}})};
const instance={method:()=>({overload:()=>({invoke:(path,type,ext)=>{assert(!inside,'asset load must leave the native hook');assert.equal(ext,'png');loads++;return op;}})})};
const catalog={method:name=>name==='get_Instance'?{invoke:()=>instance}:{name:'LoadAssetFromPathAsync',overload:()=>({name:'LoadAssetFromPathAsync'})}};
const c={Date:class extends Date{static now(){return now;}},img:{classes:[iterator]},section:(_,fn)=>fn(),cls:(_,name)=>name==='StoreImageUtils'?{name,methods:[{name:'LoadStoreImageCoroutine',isStatic:true,parameterCount:4,virtualAddress:{isNull:()=>false}}]}:catalog,
 ucls:()=>({type:{object:{}}}),isNull:x=>x==null,Il2Cpp:{string:x=>x,Object:function(x){return x;}},schedule:(delay,fn)=>tasks.push({at:now+delay,fn}),
 call:(_,name)=>{assert(!inside);assert.equal(name,'IsDone');return done;},recordResourceEvent:kind=>logs.push(kind),log:()=>{},
 invokeDelegatePtr:()=>{assert(!inside);delivered++;},Interceptor:{attach:(_,hooks)=>factoryHook=hooks.onLeave}};
vm.createContext(c);vm.runInContext(transformSync(require('./source.cjs')('store-images'),{loader:'ts'}).code,c);
function fixture(key='1',path='AppBase/UI/Textures/Store/img_-2137728010_2'){
 const data={'$PC':{value:0},'$current':{value:null},operation:{value:null},imageUrl:{value:{content:path}},callback:{value:{}}};
 const self={isNull:()=>false,handle:{toString:()=>key},field:k=>data[k],ref:()=>({target:self,free:()=>freed++})};
 return {self,data,start(){inside=true;try{factoryHook.call({},self);}finally{inside=false;}}};
}
function run(){const batch=tasks.splice(0);for(const task of batch){now=Math.max(now,task.at);task.fn();}}
let f=fixture();f.start();assert.equal(loads,0);assert.equal(f.data.$PC.value,-1,'native IEnumerator is valid but completes without CDN');assert(logs.includes('store-queued'));
run();assert.equal(loads,1);run();assert.equal(loads,1);
done=true;run();assert.equal(delivered,1);assert.equal(freed,1);assert.equal(f.data.operation.value,null);run();assert.equal(delivered,1);
f=fixture('2');done=false;f.start();run();now+=21000;run();assert(logs.includes('store-timeout'));assert.equal(freed,2);
f=fixture('3');done=true;missing=true;f.start();run();assert(logs.includes('store-missing'));assert.equal(freed,3);
f=fixture('4','https://example/image.png');f.start();assert.equal(f.data.$PC.value,0,'other URLs keep native coroutine unchanged');
console.log('PASS: actual factory adapter queues without MoveNext dispatch, loads outside native hooks, waits, releases roots, times out and preserves other URLs');
