const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
const hooks={},queue=[];let action,installs=0,toggles=0,frees=0;
const originalParent={id:'original'},modalParent={id:'modal'},root={id:'seeking-root'},node={parent:originalParent,sibling:3};
node.method=()=>({overload:()=>({invoke:(parent,keep)=>{assert.equal(keep,true);node.parent=parent;}})});
const go={handle:{toString:()=> 'go1'}},seeker={};const friend={id:'friend'};
const ptr={toString:()=> 'ptr'};
for(const obj of [friend,originalParent,seeker])obj.ref=()=>({target:obj,free:()=>frees++});
let active=true;
const c={section:(_,fn)=>fn(),img:{},cls:(_,name)=>name==='MatchSeekingWin'?{method:()=>({virtualAddress:'Show'}),tryMethod:name=>({virtualAddress:Object.assign({isNull:()=>false},{toString:()=>name})})}:{type:{object:'friends-type'}},
 Interceptor:{attach:(addr,hook)=>hooks[String(addr)]=hook},Il2Cpp:{Object:function(){return seeker;},string:x=>x},isNull:x=>x==null,schedule:(_,fn)=>queue.push(fn),log:()=>{},resourceLanguage:()=> 'en_us',uiPlace:()=>{},
 uiLabeledButton:(name,parent,text,x,y,width,fn)=>{action=fn;installs++;return{};},
 ucls:()=>({method:()=>({overload:()=>({invoke:()=>({length:active?1:0,get:()=>friend})})})}),
 call:(obj,name,...args)=>{
  if(name==='get_gameObject')return obj===friend?friend:go;
  if(name==='get_activeInHierarchy')return true;
  if(name==='get_transform')return obj===friend?node:root;
  if(name==='Find')return null;
  if(name==='get_parent')return obj===node?node.parent:modalParent;
  if(name==='GetSiblingIndex')return node.sibling;
  if(name==='SetAsLastSibling'){node.sibling=99;return;}
  if(name==='SetSiblingIndex'){node.sibling=args[0];return;}
  if(name==='ToggleFriendsPanel'){toggles++;return;}
  throw Error(name);
 }};
vm.createContext(c);vm.runInContext(transformSync(require('./source.cjs')('matching-friends'),{loader:'ts'}).code,c);
const invocation={};hooks.Show.onEnter.call(invocation,[ptr]);hooks.Show.onLeave.call(invocation);while(queue.length)queue.shift()();assert.equal(installs,1);
active=false;action();assert.equal(toggles,0);active=true;action();assert.equal(toggles,1);assert.equal(node.parent,modalParent);action();assert.equal(toggles,2);
hooks.OnDisable.onEnter([ptr]);while(queue.length)queue.shift()();assert.equal(node.parent,originalParent);assert.equal(node.sibling,3);assert.equal(frees,3);
hooks.HandleOnCancelSearch.onEnter([ptr]);while(queue.length)queue.shift()();assert.equal(frees,3);
console.log('PASS: matchmaking button opens original friend panel, keeps world geometry, restores parent/order once on close and handles absent panel');
