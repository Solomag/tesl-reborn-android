const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
const source=transformSync(require('./source.cjs')('deck-search'),{loader:'ts'}).code;

// Exercise the actual Update callback and UI construction with transient native
// failures. Helpers for rendering/assets are replaced; scheduling and cleanup
// remain the production code.
function fixture(){
  let tick=1000,update,updateUi,open=true,failures=0,scanError=false,refs=0,id=0;
  const bars=[],messages=[];
  const value=(x,y)=>({field:n=>({value:n==='x'?x:y})});
  function object(name){
    const o={name,handle:{toString:()=>name+'-'+(++id)},active:false,offset:{x:9,y:12},
      ref(){refs++;let freed=false;return{target:o,free(){assert(!freed,'double free');freed=true;refs--;}};},
      method(n){return{parameters:[{type:{class:{}}}],overload(){return this;},invoke(){
        if(n==='GetComponentsInChildren')return array([]);
        if(n==='GetComponentInParent')return null;
        throw Error('Unexpected method '+n);
      }};}};
    const key=name+'-'+(++id);o.handle={toString:()=>key};return o;
  }
  // The bundled bridge's Array is a NativeStruct, not an Il2Cpp.Object.
  // Retain .object and keep the Array wrapper for .length/.get.
  function array(items){return{object:object('array'),length:items.length,get:i=>items[i]};}
  const parent=object('parent'),go=object('picker-go'),grid=object('grid'),rect=object('grid-rect'),self=object('picker');
  self.field=()=>({value:grid});
  function call(o,n,v){
    assert(o,'null receiver: '+n);
    if(n==='get_gameObject')return o===self?go:o;
    if(n==='get_transform')return o===go?parent:o===grid?rect:o;
    if(n==='get_activeInHierarchy')return open;
    if(n==='get_offsetMax')return value(o.offset.x,o.offset.y);
    if(n==='set_offsetMax'){o.offset={x:v.x,y:v.y};return;}
    if(n==='Find')return null;
    if(n==='SetActive'){o.active=v;return;}
    if(n==='get_text')return{content:''};
    if(n.startsWith('set_'))return;
    throw Error('Unexpected call '+n);
  }
  const c={Date:{now:()=>tick},section:(_,fn)=>fn(),img:{},
    cls:()=>({type:{object:{}},method:()=>({virtualAddress:1}),tryMethod:n=>n==='UpdateUi'?{virtualAddress:{isNull:()=>false,tag:'UpdateUi'}}:null}),
    Interceptor:{attach:(address,callbacks)=>{if(address?.tag==='UpdateUi')updateUi=callbacks;else update=callbacks.onLeave;}},
    schedule:(_,fn)=>fn(),call,isNull:x=>x==null,Il2Cpp:{string:x=>x,Object:function(p){return p;}},
    uiEnum:()=>0,enumBox:(_,v)=>v,rgba:()=>({}),vec2:(x,y)=>({x,y}),
    resourceLanguage:()=> 'en_us',uiRect:o=>o,uiStretch:()=>{},uiPlace:()=>{},
    loadNativeUiSprite:()=>{},uiComponent:()=>object('component'),
    uiLabeledButton:()=>object('button'),log:m=>messages.push(m),
    uiNew(name){const o=object(name);if(name==='RebornDeckSearch')bars.push(o);return o;},
    uiAdd(_,type){if(type==='UnityEngine.UI.InputField'&&failures>0){failures--;throw Error('native cold-start failure');}return object(type);},
    ucls:()=>({type:{object:{}},method(n){return{overload(){return this;},invoke(o){
      if(n==='FindObjectsOfTypeAll'){if(scanError)throw Error('scan unavailable');return array([self]);}
      if(n==='GetBuiltinResource')return object('font');
      if(n==='Destroy'){o.destroyed=true;o.active=false;return;}
      throw Error('Unexpected static method '+n);
    }};}})
  };
  vm.createContext(c);vm.runInContext(source,c);
  return{bars,messages,rect,refs:()=>refs,openList(){const t={};updateUi.onEnter.call(t,[self]);updateUi.onLeave.call(t);},fail:n=>{failures=n;},open:v=>{open=v;},scanError:v=>{scanError=v;},step(ms=250){tick+=ms;update();}};
}

const a=fixture();a.fail(1);a.step(0);a.step();assert.equal(a.bars.length,0,'wait for UI to settle');
a.step();assert.equal(a.bars.length,1);assert(a.bars[0].destroyed);assert(!a.bars[0].active);
assert.deepEqual(a.rect.offset,{x:9,y:12},'failed creation restores viewport');assert.equal(a.refs(),0,'failed creation releases all roots');
a.step();assert.equal(a.bars.length,1,'no per-frame recreate loop');
a.step(750);assert.equal(a.bars.length,2);assert(a.bars[1].active);assert.equal(a.refs(),4,'only committed roots survive');
assert.deepEqual(a.rect.offset,{x:9,y:-70});
a.scanError(true);a.step();assert(a.bars[1].active,'transient enumeration failure preserves installed UI');assert.equal(a.refs(),4);
a.scanError(false);a.open(false);a.step();assert(a.bars[1].destroyed);assert.equal(a.refs(),0);assert.deepEqual(a.rect.offset,{x:9,y:12});
console.log('PASS: cold creation rolls back, backs off, installs once and releases roots on close; failed scans preserve working UI');

const b=fixture();b.fail(99);b.step(0);b.step(500);b.step(1000);b.step(2000);b.step(10000);
assert.equal(b.bars.length,3,'bounded initialization failures');assert(b.bars.every(o=>o.destroyed&&!o.active));assert.equal(b.refs(),0);
b.open(false);b.step();b.fail(0);b.open(true);b.step();b.step(500);assert.equal(b.bars.length,4);assert(b.bars[3].active);
assert.equal(b.messages.filter(m=>m.includes('initialization attempt')).length,3);
console.log('PASS: persistent failures stop after three attempts; reopening retries without restarting the client');

// The game's UpdateUi fills the grid: the bar is installed right then, not
// after the 500 ms polling gate (report 29: Search appeared late).
const d=fixture();d.openList();
assert.equal(d.bars.length,1,'installed with the deck list');assert(d.bars[0].active);
assert(d.messages.includes('deck search: installed with the deck list'));
d.step(0);d.step();assert.equal(d.bars.length,1,'the poll does not install a second bar');
console.log('PASS: the search bar is installed with the deck list from UpdateUi, without the polling delay');
