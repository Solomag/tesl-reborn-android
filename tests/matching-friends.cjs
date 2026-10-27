const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
// Unity objects: a game object with components, and the components that
// the friends section raises over the search window.
const hooks={},queue=[],logs=[];let frees=0;
const handle=id=>({toString:()=>id,isNull:()=>false});
function gameObject(id,{canvas=null,ray=null}={}) {
  const go={handle:handle(id),active:true,components:new Map(),destroyed:false};
  if(canvas)go.components.set('UnityEngine.Canvas',canvas);
  if(ray)go.components.set('UnityEngine.UI.GraphicRaycaster',ray);
  go.method=name=>({overload:()=>({invoke:type=>{
    if(name==='GetComponent')return go.components.get(type)||null;
    if(name==='GetComponentInParent')return searchCanvas;
    throw Error(name);
  }})});
  return go;
}
let ids=0;
const canvasOf=(order=0,override=false)=>({handle:handle('canvas'+(ids++)),overrideSorting:override,sortingOrder:order,sortingLayerID:0});
const searchCanvas=canvasOf(30),rootCanvas=canvasOf(5);
const buttonGo=gameObject('button'),friendsGo=gameObject('friends',{canvas:canvasOf(2,false)});
const button={handle:handle('btn'),go:buttonGo,interactable:true},friendsWin={handle:handle('fw'),go:friendsGo};
const seekerGo=gameObject('seeker'),seeker={handle:handle('seek'),go:seekerGo,method:name=>seekerGo.method(name)};
const view={handle:handle('view'),field:()=>({value:button})};
const controller={handle:handle('ctl'),go:gameObject('ctl')},mainMenu={handle:handle('mm'),go:gameObject('mm'),field:()=>({value:friendsWin})};
const withRef=obj=>{obj.ref=()=>({target:obj,free:()=>frees++});return obj;};
for(const obj of [seeker,button,friendsWin,searchCanvas,friendsGo.components.get('UnityEngine.Canvas'),buttonGo,friendsGo])withRef(obj);
const typeObject=name=>({type:{object:name}});
const added=[];
const c={section:(_,fn)=>fn(),img:{},NULL:null,isNull:x=>x==null,
 cls:(_,name)=>name==='MatchSeekingWin'?{method:()=>({virtualAddress:'Show'}),tryMethod:n=>({virtualAddress:{isNull:()=>false,toString:()=>n}})}:typeObject(name),
 Interceptor:{attach:(addr,hook)=>hooks[String(addr)]=hook},Il2Cpp:{Object:function(){return seeker;}},
 schedule:(_,fn)=>queue.push(fn),log:m=>logs.push(m),
 uiAdd:(go,type)=>{const value=withRef(type==='UnityEngine.Canvas'?canvasOf():{handle:handle('ray'+(ids++)),enabled:false});go.components.set(type,value);added.push(type);return value;},
 ucls:name=>name==='UnityEngine.Resources'?{method:()=>({overload:()=>({invoke:type=>{
    const list=type==='MainMenuOverlayController'?[controller]:type==='SPTESL.MainMenu'?[mainMenu]:[];return {length:list.length,get:i=>list[i]};}})})}
  :name==='UnityEngine.Object'?{method:()=>({invoke:value=>Boolean(value.destroyed||value.go?.destroyed)})}:typeObject(name),
 call:(obj,name,...args)=>{
  if(obj.destroyed)throw Error(`${name} called on a destroyed object`);
  if(name==='get_gameObject')return obj.go||obj;
  if(name==='get_activeInHierarchy')return obj.active;
  if(name==='get__overlayView')return view;
  if(name==='get_rootCanvas')return rootCanvas;
  const prop=name.slice(4);
  if(name.startsWith('get_'))return obj[prop];
  if(name.startsWith('set_')){obj[prop]=args[0];return;}
  throw Error(name);
 }};
vm.createContext(c);vm.runInContext(transformSync(require('./source.cjs')('matching-friends'),{loader:'ts'}).code,c);
const run=()=>{for(const task of queue.splice(0))task();};
assert.ok(logs.includes('matching friends: close hooks OnDisable, OnDestroy, HandleOnCancelSearch'));

// Show: the button and the friends window sort above the search window and
// receive taps; nothing is reparented and the button keeps its own state.
const show=()=>{const self={};hooks.Show.onEnter.call(self,[{}]);hooks.Show.onLeave.call(self);run();};
show();
const buttonCanvas=buttonGo.components.get('UnityEngine.Canvas'),buttonRay=buttonGo.components.get('UnityEngine.UI.GraphicRaycaster');
const friendsCanvas=friendsGo.components.get('UnityEngine.Canvas');
assert.equal(buttonCanvas.overrideSorting,true);assert.equal(buttonCanvas.sortingOrder,40,'above the search window');
assert.equal(buttonRay.enabled,true,'the raised button receives taps');
assert.equal(friendsCanvas.sortingOrder,41,'the friends panel opens above the button');
assert.equal(button.interactable,true,'the button state is left to the game');
assert.ok(logs.includes('matching friends: raised above the search window (order 40)'));
console.log('PASS: the friends button and window are raised over the search window without being moved');

// Cancel: the sorting goes back to the values it had. Our Canvas stays
// without the override, and our raycaster stays on: graphics under a nested
// Canvas are only hit by that Canvas's own raycaster (report 23: switching it
// off left a button that no longer took taps).
hooks.HandleOnCancelSearch.onEnter([{}]);run();
assert.equal(buttonCanvas.overrideSorting,false);assert.equal(buttonCanvas.sortingOrder,0);
assert.equal(buttonRay.enabled,true,'the button keeps receiving taps after the search');
assert.equal(friendsGo.components.get('UnityEngine.UI.GraphicRaycaster').enabled,true,'the friends panel keeps receiving taps');
assert.equal(friendsCanvas.overrideSorting,false);assert.equal(friendsCanvas.sortingOrder,2,'an existing Canvas gets its own sorting back');
assert.ok(logs.includes('matching friends: lowered (HandleOnCancelSearch; 2 items)'));
hooks.OnDisable.onEnter([{}]);run();
assert.equal(logs.filter(m=>m.startsWith('matching friends: lowered')).length,1,'a second close hook does nothing');
console.log('PASS: closing the search restores the original sorting and raycasting');

// A second search reuses the components instead of adding more of them.
const before=added.length;show();assert.equal(added.length,before,'no duplicate components');
// Match found while the battle scene destroys the menu: destroyed objects
// are skipped by Unity's null check, never called.
buttonCanvas.destroyed=true;buttonRay.destroyed=true;
hooks.OnDisable.onEnter([{}]);run();
assert.equal(buttonCanvas.sortingOrder,40,'a destroyed canvas is not touched');
assert.equal(friendsCanvas.sortingOrder,2);
assert.ok(!logs.some(m=>m.includes('failed')),'no call on destroyed objects');
console.log('PASS: a match found skips destroyed menu objects instead of calling them');

// Watchdog: a search window that went inactive without a close hook.
buttonCanvas.destroyed=false;buttonRay.destroyed=false;
show();seekerGo.active=false;for(let i=0;i<3;i++)run();
assert.equal(buttonCanvas.overrideSorting,false,'the watchdog lowers the button');
assert.ok(logs.some(m=>m.startsWith('matching friends: lowered (watchdog;')));
assert.ok(frees>0);
console.log('PASS: the watchdog lowers the button when no close hook fires');
