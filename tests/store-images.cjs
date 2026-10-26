const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
const context={section:()=>{}};vm.createContext(context);
vm.runInContext(transformSync(require('./source.cjs')('store-images'),{loader:'ts'}).code,context);
for(const path of ['AppBase/UI/Textures/Store/img_464553517_2','AppBase/UI/Textures/Store/img_-2137728010_2'])assert(context.rebornStoreImagePath(path));
for(const path of ['https://example/image.png','../foo','AppBase/UI/Textures/Store/img_1_2?token=a',''])assert(!context.rebornStoreImagePath(path));
function fixture({done=false,missing=false,throws=false}={}) {
 let state=0,op=null,current=null,loads=0,deliveries=0,misses=0;
 const operation={},sprite={};
 const io={state:()=>state,setState:x=>state=x,operation:()=>op,setOperation:x=>op=x,setCurrent:x=>current=x,
 load:()=>{loads++;return operation;},isDone:()=>done,asset:()=>missing?null:sprite,
 deliver:x=>{assert.equal(x,sprite);deliveries++;if(throws)throw Error('callback');},missing:()=>misses++};
 return {io,finish:()=>done=true,cancel:()=>state=-1,counts:()=>({loads,deliveries,misses,state,op,current})};
}
let f=fixture();assert(context.advanceStoreImage(f.io));assert(context.advanceStoreImage(f.io));assert.equal(f.counts().loads,1);
f.finish();assert.equal(context.advanceStoreImage(f.io),false);assert.equal(f.counts().deliveries,1);assert.equal(f.counts().op,null);
assert.equal(context.advanceStoreImage(f.io),false);assert.equal(f.counts().deliveries,1);
f=fixture({done:true,missing:true});assert.equal(context.advanceStoreImage(f.io),false);assert.equal(f.counts().misses,1);
f=fixture();context.advanceStoreImage(f.io);f.cancel();assert.equal(context.advanceStoreImage(f.io),false);assert.equal(f.counts().deliveries,0);
f=fixture({done:true,throws:true});assert.throws(()=>context.advanceStoreImage(f.io));assert.equal(context.advanceStoreImage(f.io),false);assert.equal(f.counts().deliveries,1);
console.log('PASS: direct store paths, asynchronous wait, one load/callback, missing assets, disposal and callback re-entry protection');
