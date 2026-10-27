const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
const hooks={},queue=[],logs=[];let frees=0;const positionWrites=[];
const ptr={toString:()=> 'ptr'},modalParent={id:'modal'},root={id:'seeking-root'},original={id:'original'},buttonParent={id:'buttons'};
const friendGo={handle:{toString:()=> 'friend'},active:true},buttonGo={handle:{toString:()=> 'button'},active:true},go={handle:{toString:()=> 'go1'},active:true};
const friend={go:friendGo},button={go:buttonGo,interactable:false,nativeClick:'original-handler'},seeker={go};
const friendNode={parent:original,sibling:3},buttonNode={parent:buttonParent,sibling:2};
const nodes=new Map([[friendGo,friendNode],[buttonGo,buttonNode],[go,root]]);
for(const obj of [friendGo,buttonGo,original,buttonParent,button,seeker])obj.ref=()=>({target:obj,free:()=>frees++});
for(const node of [friendNode,buttonNode])node.method=()=>({overload:()=>({invoke:(parent,keep)=>{assert.equal(keep,true);node.parent=parent;}})});
const pose={field:key=>({value:key==='x'?1:2})};
const c={section:(_,fn)=>fn(),img:{},cls:(_,name)=>name==='MatchSeekingWin'?{method:()=>({virtualAddress:'Show'}),tryMethod:name=>({virtualAddress:Object.assign({isNull:()=>false},{toString:()=>name})})}:{type:{object:name}},
 Interceptor:{attach:(addr,hook)=>hooks[String(addr)]=hook},Il2Cpp:{Object:function(){return seeker;},string:x=>x},isNull:x=>x==null,schedule:(_,fn)=>queue.push(fn),log:m=>logs.push(m),vec2:(x,y)=>({x,y}),
 uiNew:()=>{const slot={active:true,ref:()=>({target:slot,free:()=>frees++})};nodes.set(slot,{parent:buttonParent,sibling:2});return slot;},uiAdd:()=>({}),
 ucls:name=>({method:()=>({overload:()=>({invoke:type=>(name==='UnityEngine.Object'?undefined:{length:type==='FriendsWin'||type==='MainMenuOverlayView'?1:0,get:()=>type==='FriendsWin'?friend:{field:()=>({value:button})}})})})}),
 call:(obj,name,...args)=>{
  if(name==='get_gameObject')return obj.go||obj;
  if(name==='get_activeInHierarchy'||name==='get_activeSelf')return obj.active;
  if(name==='SetActive'){obj.active=args[0];return;}
  if(name==='get_transform')return nodes.get(obj);
  if(name==='Find')return null;
  if(name==='get_parent')return obj===root?modalParent:obj.parent;
  if(name==='GetSiblingIndex')return obj.sibling;
  if(name==='SetAsLastSibling'){obj.sibling=99;return;}
  if(name==='SetSiblingIndex'){obj.sibling=args[0];return;}
  if(name==='get_rect')return {field:()=>({value:48})};
  if(name==='get_position')return {x:10,y:20,z:0};
  if(name==='set_position'){positionWrites.push(args[0]);return;}
  if(name==='get_interactable')return obj.interactable;
  if(name==='set_interactable'){obj.interactable=args[0];return;}
  if(name.startsWith('get_'))return pose;
  if(name.startsWith('set_'))return;
  throw Error(name);
 }};
vm.createContext(c);vm.runInContext(transformSync(require('./source.cjs')('matching-friends'),{loader:'ts'}).code,c);
assert.ok(logs.some(m=>/^matching friends: close hooks OnDisable, OnDestroy, HandleOnCancelSearch/.test(m)),'the installed close hooks are announced');
const invocation={};hooks.Show.onEnter.call(invocation,[ptr]);hooks.Show.onLeave.call(invocation);for(const task of queue.splice(0))task();
assert.equal(positionWrites.length,1);assert.deepEqual(positionWrites[0],{x:10,y:20,z:0});assert.equal(button.interactable,true);assert.equal(buttonNode.parent,root);assert.equal(friendNode.parent,modalParent);assert.equal(button.nativeClick,'original-handler');
hooks.OnDisable.onEnter([ptr]);for(const task of queue.splice(0))task();assert.equal(buttonNode.parent,buttonParent);assert.equal(friendNode.parent,original);assert.equal(button.interactable,false,'the menu is not interactive yet, so the stale value goes back first');assert.equal(buttonNode.sibling,2);assert.equal(friendNode.sibling,3);assert.equal(frees,8,'the re-assert roots and the window ref are still held');
assert.ok(logs.some(m=>m==='matching friends: restore (OnDisable, returning to menu; 2 items)'),'the close hook names itself as the restore source');
buttonParent.active=true;for(const task of queue.splice(0))task();
assert.equal(buttonGo.active,true,'the button is visible again once the menu is active');assert.equal(button.interactable,true,'the button is clickable again once the menu is active');assert.equal(frees,8);
for(let round=0;round<3;round++)for(const task of queue.splice(0))task();assert.equal(frees,11,'the re-asserts stop and release their roots');
assert.ok(logs.some(m=>m==='matching friends: re-assert applied 4x'),'the completed re-assert is logged');
hooks.HandleOnCancelSearch.onEnter([ptr]);for(const task of queue.splice(0))task();assert.equal(frees,11);

// A close path that fires none of the lifecycle hooks is caught by the
// watchdog: a window that is no longer live ends the search for it.
const seen=logs.length;
const second={};hooks.Show.onEnter.call(second,[ptr]);hooks.Show.onLeave.call(second);for(const task of queue.splice(0))task();
assert.equal(buttonNode.parent,root,'the button is moved for the second search');
go.active=false;
for(let round=0;round<3;round++)for(const task of queue.splice(0))task();
assert.equal(buttonNode.parent,buttonParent,'the watchdog puts the button back when no close hook fires');
assert.equal(button.interactable,true,'the watchdog restores an interactive button');
assert.ok(logs.slice(seen).some(m=>m.startsWith('matching friends: restore (watchdog, returning to menu')),'the watchdog restore is logged');
console.log('PASS: original friends button is moved/enabled without replacing handlers, restores are logged with their source, and the watchdog covers a close path without hooks');
