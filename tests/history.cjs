const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
let id=0;const buttons=[],objects=[],logs=[];let input={down:false,point:{x:0,y:0}};
const ptr=s=>({toString:()=>s}),v=(x,y)=>({x,y,field(n){return {value:this[n]}}});
class Obj {
 constructor(name){this.name=name;this.handle=ptr(name+'-'+id++);this.props={active:true,sizeDelta:v(1000,700),anchoredPosition:v(0,0)};objects.push(this);}
 ref(){return {target:this,free(){}};}weakRef(){return this.ref();}
 tryMethod(n){return n==='get_rootCanvas'?this.method(n):null;}
 method(n){return {invoke:(...a)=>this.invoke(n,a),overload:()=>({invoke:(...a)=>this.invoke(n,a)})};}
 invoke(n,a){
  if(this.destroyed)throw Error('called a destroyed object: '+n);
  if(n==='get_transform'||n==='get_gameObject')return this;
  if(n==='get_parent')return this.parent||null;
  if(n==='GetComponent')return null; // Mobile prefab has no TooltipTrigger.
  if(n==='GetComponentInParent'||n==='get_rootCanvas')return canvas;
  if(n==='get_worldCamera')return null;
  if(n==='get_rect')return {field:k=>({value:({m_Width:this.props.sizeDelta.x,m_Height:this.props.sizeDelta.y,m_XMin:-500,m_YMin:-350})[k]})};
  if(n==='get_position')return v(100,50);if(n==='InverseTransformPoint')return a[0];
  if(n==='GetPreferredValues')return v(a[1],48);
  if(n==='get_name')return {content:this.name};
  if(n==='SetActive'){this.props.active=a[0];return;}
  if(n==='SetAsLastSibling')return;
  if(n==='get_activeInHierarchy')return this.props.active;
  if(n==='get_enabled')return this.props.enabled;
  if(n.startsWith('set_')){this.props[n.slice(4)]=a[0];return;}
  throw Error(n);
 }
}
const canvas=new Obj('Canvas');
const list=items=>({method:n=>({invoke:(...a)=>n==='get_Count'?items.length:n==='get_Item'?items[a[0]]:n==='IndexOf'?items.indexOf(a[0]):undefined})});
const matchA={field:()=>({value:{content:'None'}})},matchB={field:()=>({value:{content:'None'}})};
const history=list([matchA,matchB]),manager={field:()=>({value:{method:()=>({invoke:()=>history})}})};
const makeRow=name=>{const row=new Obj(name);row.fields={};for(const f of ['_userDeckImages','_opponentDeckImages']){
 const image=new Obj(f);image.parent=row;row.fields[f]=list([image]);}row.field=n=>({value:row.fields[n]});return row;};
const data=[{deckId:1,deckName:'Deck A',deckStats:{wins:3,losses:1},opponentDeckName:'Opponent A',opponentDeckStats:{wins:1,losses:1}},
 {deckId:2,deckName:'Deck B',deckStats:{wins:4,losses:1},opponentDeckName:'Opponent B',opponentDeckStats:{wins:5,losses:0}}];
const c={Map,Set,Number,Math,Date,isNull:x=>x==null,unityAlive:x=>x!=null&&!x.destroyed,section:()=>{},log:s=>logs.push(s),img:{},matchEntryData:data,
 cls:(_,n)=>n==='SparkleServices.ServicesManager'?{method:()=>({invoke:()=>manager})}:{type:{object:'tooltip'}},
 call:(o,n,...a)=>o.method(n).invoke(...a),uiPlain:x=>x,winRate:(w,l)=>Math.round(100*w/(w+l)),
 Il2Cpp:{string:s=>s,corlib:{class:()=>({})}},vec2:v,rgba:(...a)=>a,enumVal:x=>x,uiXY:x=>({...x}),
 uiNew:(name,parent)=>{const o=new Obj(name);o.parent=parent;return o;},uiRect:o=>o,uiStretch:()=>{},
 uiPlace:(o,ax,ay,px,py,x,y,w,h)=>{o.props.sizeDelta=v(w,h);o.props.anchoredPosition=v(x,y);},
 uiAdd:()=>new Obj('Component'),uiText:(go,text)=>{const o=new Obj('Text');o.props.text=text;return o;},
 uiButton:(go,img,fn)=>buttons.push({go,fn}),chatContains:(rect,point)=>rect===point.target,
 schedule:()=>{},refreshMatchEntries:()=>{},
 ucls:n=>n==='UnityEngine.Input'?{method:k=>({invoke:()=>k==='get_touchCount'?0:k==='GetMouseButtonDown'?input.down:input.point})}:
 {type:{object:'Canvas'},method:()=>({overload:()=>({invoke:()=>{}})})}};
vm.createContext(c);vm.runInContext(require('./source.cjs')('history-ui'),c);
const rowB=makeRow('RowB'),rowA=makeRow('RowA');c.updateHistoryTooltips(rowB,matchB);c.updateHistoryTooltips(rowA,matchA);
assert.equal(buttons.length,4,'two independent sides per match');
buttons[0].fn();let label=objects.filter(x=>x.name==='Text').at(-1);
assert(label.props.text.includes('Deck B'));assert(label.props.text.includes('4/1 (80%)'));
assert.equal(vm.runInContext('historyActiveKey',c),rowB.handle+':_userDeckImages');
buttons[1].fn();assert(label.props.text.includes('Opponent B'));
buttons[1].fn();assert.equal(vm.runInContext('historyActiveKey',c),null,'same target toggles off');
buttons[2].fn();assert(label.props.text.includes('Deck A'));
input={down:true,point:{x:10,y:10}};c.historyPoll();assert.equal(vm.runInContext('historyActiveKey',c),null,'tap outside closes');
buttons[2].fn();rowA.props.active=false;c.historyPoll();assert.equal(vm.runInContext('historyActiveKey',c),null,'leaving history hides popup');rowA.props.active=true;
const before=buttons.length;c.updateHistoryTooltips(rowB,matchB);assert.equal(buttons.length,before,'row updates must reuse hit buttons');
c.matchEntryData=[];c.updateHistoryTooltips(rowA,matchA);buttons[2].fn();assert(label.props.text.includes('No deck data'));
c.matchEntryData=data;c.updateHistoryTooltips(rowA,matchA);assert(label.props.text.includes('Deck A'),'late data refreshes the open popup');
assert(!c.historyTooltipText('Untracked',null).includes('deleted'),'missing stats do not prove deck deletion');
console.log('PASS: native click targets without TooltipTrigger, object-identity ordering, own/opponent deck, ratios, toggle, switch, outside close, leaving tab, reuse and late data');

{
 let nativeVisible=false,failShow=false,lastSettings=null;
 const nativeManager={method:(n,count)=>{const method={invoke:(...args)=>{
  if(n==='HideTooltip'){nativeVisible=false;return;}
  assert.equal(n,'ShowTooltip');assert.equal(args.length,3);assert.equal(args[2],true);
  lastSettings=args[0];nativeVisible=true;if(failShow)throw Error('simulate late native error');
 }};method.overload=(...types)=>{assert.equal(types.join(','),'TooltipShowSettings,UnityEngine.GameObject,System.Boolean');return method;};return method;}};
 const oldCls=c.cls;
 c.uiList=()=>{const o={items:[],ref:()=>({target:o,free(){}}),method:n=>({invoke:x=>o.items.push(x)})};return o;};
 c.enumBox=(_,x)=>x;
 c.cls=(_,name)=>name==='TooltipManager'?{method:()=>({invoke:()=>nativeManager})}:name==='TooltipShowSettings'?{type:{name:'TooltipShowSettings'},alloc:()=>{
  const fields={},value={fields,method:()=>({invoke:messages=>{fields.messages=messages.items;}})};
  return {ref:()=>({free(){}}),unbox:()=>value,field:n=>({type:{class:{}},get value(){return fields[n]},set value(x){fields[n]=x;}})};
 }}:oldCls(_,name);
 buttons[0].fn();
 assert(nativeVisible);assert.equal(vm.runInContext('historyUsingNative',c),true);
 assert(lastSettings.fields.messages[0].includes('Deck B'));assert.equal(lastSettings.fields.anchorEdge,2);assert.equal(lastSettings.fields.tooltipEdge,3);
 assert.equal(lastSettings.fields.distanceFromAnchor,5);
 const fallback=objects.find(x=>x.name==='RebornHistoryDeckPopup');assert.equal(fallback.props.active,false,'native popup hides the fallback');
 input={down:true,point:{x:10,y:10}};c.historyPoll();assert(!nativeVisible);assert.equal(vm.runInContext('historyActiveKey',c),null);
 const trigger=new Obj('NativeTrigger');trigger.props.enabled=true;
 const oldInvoke=rowA.invoke.bind(rowA);rowA.invoke=(n,a)=>n==='GetComponent'?trigger:oldInvoke(n,a);
 c.updateHistoryTooltips(rowA,matchA);assert.equal(trigger.props.enabled,false,'suppress the automatic hover path');
 assert.equal(vm.runInContext('historyTriggerOwners.size',c),1,'shared trigger has one owner record');
 c.historyDropTarget(rowA.handle+':_userDeckImages');assert.equal(trigger.props.enabled,false,'opponent still owns shared trigger');
 c.historyDropTarget(rowA.handle+':_opponentDeckImages');assert.equal(trigger.props.enabled,true,'restore original enabled state when last target leaves');
 failShow=true;buttons[1].fn();assert(!nativeVisible,'partially shown native tooltip is hidden on failure');assert(fallback.props.active);
 assert.equal(vm.runInContext('historyUsingNative',c),false);assert.equal(objects.filter(x=>x.name==='RebornHistoryDeckPopup').length,1);
 console.log('PASS: one native tooltip with exact PC settings; outside close; shared hover-trigger suppression/restoration; one fallback after partial native failure');
}

// Report 32: match history reloads and rebuilds its rows while a popup is
// open. Destroyed rows and hit targets are skipped, never called, and a
// destroyed active row closes the popup.
{
 const under=(o,root)=>{for(let x=o;x;x=x.parent)if(x===root)return true;return false;};
 input={down:false,point:{x:0,y:0}};
 buttons[2].fn();assert(vm.runInContext('historyActiveKey',c),'popup open on row A');
 for(const o of objects)if(under(o,rowB))o.destroyed=true;
 const failures=()=>logs.filter(m=>m.includes('popup input failed')).length,seen=failures();
 input={down:true,point:{x:10,y:10}};c.historyPoll();
 assert.equal(failures(),seen,'destroyed rows of the old list are skipped, not called');
 buttons[2].fn();for(const o of objects)if(under(o,rowA))o.destroyed=true;
 input={down:false,point:{x:0,y:0}};c.historyPoll();
 assert.equal(vm.runInContext('historyActiveKey',c),null,'a destroyed active row closes the popup');
 assert.equal(failures(),seen,'without calling into it');
 console.log('PASS: rows destroyed by a history reload are skipped and close the popup without native calls');
}
