const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
const hooks={},queue=[];let frees=0;
const ptr={toString:()=> 'ptr'},modalParent={id:'modal'},root={id:'seeking-root'},original={id:'original'},buttonParent={id:'buttons'};
const friendGo={handle:{toString:()=> 'friend'},active:true},buttonGo={handle:{toString:()=> 'button'},active:true},go={handle:{toString:()=> 'go1'},active:true};
const friend={go:friendGo},button={go:buttonGo,interactable:false,nativeClick:'original-handler'},seeker={go};
const friendNode={parent:original,sibling:3},buttonNode={parent:buttonParent,sibling:2};
const nodes=new Map([[friendGo,friendNode],[buttonGo,buttonNode],[go,root]]);
for(const obj of [friendGo,buttonGo,original,buttonParent,button,seeker])obj.ref=()=>({target:obj,free:()=>frees++});
for(const node of [friendNode,buttonNode])node.method=()=>({overload:()=>({invoke:(parent,keep)=>{assert.equal(keep,true);node.parent=parent;}})});
const pose={field:key=>({value:key==='x'?1:2})};
const c={section:(_,fn)=>fn(),img:{},cls:(_,name)=>name==='MatchSeekingWin'?{method:()=>({virtualAddress:'Show'}),tryMethod:name=>({virtualAddress:Object.assign({isNull:()=>false},{toString:()=>name})})}:{type:{object:name}},
 Interceptor:{attach:(addr,hook)=>hooks[String(addr)]=hook},Il2Cpp:{Object:function(){return seeker;},string:x=>x},isNull:x=>x==null,schedule:(_,fn)=>queue.push(fn),log:()=>{},vec2:(x,y)=>({x,y}),
 ucls:()=>({method:()=>({overload:()=>({invoke:type=>({length:type==='FriendsWin'||type==='MainMenuOverlayView'?1:0,get:()=>type==='FriendsWin'?friend:{field:()=>({value:button})}})})})}),
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
  if(name==='get_interactable')return obj.interactable;
  if(name==='set_interactable'){obj.interactable=args[0];return;}
  if(name.startsWith('get_'))return pose;
  if(name.startsWith('set_'))return;
  throw Error(name);
 }};
vm.createContext(c);vm.runInContext(transformSync(require('./source.cjs')('matching-friends'),{loader:'ts'}).code,c);
const invocation={};hooks.Show.onEnter.call(invocation,[ptr]);hooks.Show.onLeave.call(invocation);while(queue.length)queue.shift()();
assert.equal(button.interactable,true);assert.equal(buttonNode.parent,root);assert.equal(friendNode.parent,modalParent);assert.equal(button.nativeClick,'original-handler');
hooks.OnDisable.onEnter([ptr]);while(queue.length)queue.shift()();assert.equal(buttonNode.parent,buttonParent);assert.equal(friendNode.parent,original);assert.equal(button.interactable,false);assert.equal(buttonNode.sibling,2);assert.equal(friendNode.sibling,3);assert.equal(frees,6);
hooks.HandleOnCancelSearch.onEnter([ptr]);while(queue.length)queue.shift()();assert.equal(frees,6);
console.log('PASS: original friends button is moved/enabled without replacing handlers, original panel/order/interactivity are restored exactly once');
