const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
const text=fs.readFileSync('hook.ts','utf8');
const a=text.indexOf('  // BEGIN android-ui: settings-data'),b=text.indexOf('  // END android-ui: settings-data',a);
const objects=new Map();let opened=0,created=0;
const root={};const self={};let rootName="SettingsWin_Mobile(Clone)", controls=1;
const window={handle:{equals:()=>true,toString:()=> 'settings'},method:()=>({overload:()=>({invoke:()=>({length:controls,get:()=>({})})})}),ref:()=>({target:window,free:()=>{}})};
const logs=[];
const c={resourceSettingsWindow:null,log:m=>logs.push(m),section:()=>{},resourceLanguage:()=>"en_us",fileExists:()=>true,persistentPath:()=>'/files',isNull:x=>x==null,
 call:(o,n,...args)=>n==='get_transform'?root:n==='get_gameObject'?(o.action?o:window):n==='get_name'?{content:rootName}:n==='Find'?objects.get(args[0])||null:n==='SetActive'?(o.active=args[0]):undefined,
 Il2Cpp:{string:x=>x},uiLabeledButton:(name,parent,label,x,y,width,action)=>{created++;objects.set(name,{action});return{}},uiAdd:()=>({}),
 uiPlace:()=>{},ucls:()=>({type:{object:{}},method:()=>({invoke:()=>opened++})})};
vm.createContext(c);vm.runInContext(transformSync(text.slice(a,b),{loader:'ts'}).code,c);
rootName='SettingsMenuWin';c.installSettingsDataButton(self);assert.equal(created,0);rootName='OptionsWin';controls=0;c.installSettingsDataButton(self);assert.equal(created,0);rootName='OptionsWinMobile(Clone)';controls=1;c.installSettingsDataButton(self);assert.equal(created,0,'observed gear prefab must be excluded even with controls');rootName='SettingsWin_Mobile(Clone)';controls=0;c.installSettingsDataButton(self);c.installSettingsDataButton(self);assert.equal(created,1);objects.get('RebornGameData').action();assert.equal(opened,1);
const chat=text.slice(text.indexOf('  function chatSetup('),text.indexOf('  function chatContains('));
assert(!chat.includes('RebornResources'));assert(!chat.includes('teslreborn://resources'));
console.log('PASS: one Settings Game data button; no resource button or deep link in chat');

c.log=()=>{};c.settingsClosing(self,'Cancel');
assert.notEqual(objects.get('RebornGameData').active,false);
c.installSettingsDataButton(self);assert.equal(created,1);assert.equal(objects.get('RebornGameData').active,true,'polling leaves the existing child alone during Cancel');
vm.runInContext('closingSettings.clear()',c);c.installSettingsDataButton(self);assert.equal(created,1);assert.equal(objects.get('RebornGameData').active,true,'reopening reuses the button');
// Actual Button.Press route: dynamically registered Cancel need not be a SettingsWin method.
const previousCall=c.call,buttonNode={},fakeButton={},event={};
c.call=(o,name,...args)=>{
 if(o===fakeButton&&name==='get_onClick')return event;
 if(o===fakeButton&&name==='get_transform')return buttonNode;
 if(o===event&&name==='GetPersistentEventCount')return 1;
 if(o===event&&name==='GetPersistentMethodName')return {content:'OnClickCancel'};
 if(o===buttonNode&&name==='get_name')return {content:'CancelButton'};
 if(o===buttonNode&&name==='get_parent')return root;
 return previousCall(o,name,...args);
};
c.settingsButtonPressed(fakeButton);
assert(vm.runInContext('closingSettings.has("settings")',c),'real Cancel press blocks reinsertion even when SettingsWin has no Close methods');

// Device APK strips UnityEvent.GetPersistentEventCount: Cancel must still route.
event.tryMethod=()=>null;event.class={hierarchy:function*(){yield {fields:[]};}};
vm.runInContext('closingSettings.clear()',c);c.settingsButtonPressed(fakeButton);
assert(vm.runInContext('closingSettings.has("settings")',c),'stripped event introspection must not disable button-name routing');

// Report 30/31: Game data becomes a third tab with the tab look and size.
// Without a row layout it goes one tab step past the last tab and the row
// moves back half a step; with a HorizontalLayoutGroup the layout places it.
function tabFixture(flow){
 const v=(x,y)=>({field:f=>({value:f==='x'?x:y})});
 const tabArt={class:{type:{name:'UnityEngine.UI.Image'}}},tabLabel={},row={pos:{x:0,y:-40}};
 const audio={go:{},node:{pos:{x:-150,y:0}}},prefs={go:{},node:{pos:{x:150,y:0}}};
 const ourImage={},ourLabel={},ourNode={},layout={},writes=[];
 const button={method:()=>({overload:()=>({invoke:()=>ourLabel})})};
 const toggles={length:2,get:i=>i?prefs:audio};
 const tabSelf={field:n=>({value:n==='_tabNavigation'?{field:()=>({value:toggles})}:null})};
 audio.go.method=()=>({overload:()=>({invoke:()=>tabLabel})});
 row.method=()=>({overload:()=>({invoke:()=>flow?{}:null})});
 ourNode.method=()=>({overload:()=>({invoke:(parent,keep)=>writes.push(['SetParent',parent,keep])})});
 const prev=c.call,prevComponent=c.uiComponent,prevVec=c.vec2;
 c.uiComponent=(o,type)=>type==='UnityEngine.UI.Image'?ourImage:null;c.vec2=(x,y)=>({x,y});
 c.call=(o,n,...a)=>{
  for(const t of [audio,prefs]){if(o===t&&n==='get_gameObject')return t.go;if(o===t.go&&n==='get_transform')return t.node;if(o===t.node&&n==='get_anchoredPosition')return v(t.node.pos.x,t.node.pos.y);}
  if(o===prefs.node&&n==='get_parent')return row;if(o===audio&&n==='get_targetGraphic')return tabArt;
  if(o===tabArt)return n==='get_sprite'?'frame':n==='get_type'?'sliced':'white';
  if(o===tabLabel)return n==='get_font'?'game-font':n==='get_enableAutoSizing'?true:n==='get_fontSizeMin'?18:n==='get_fontSizeMax'?36:n==='get_fontSize'?36:'gold';
  if(o===prefs.node&&n==='get_rect')return {field:f=>({value:f==='m_Width'?280:64})};
  if(o===prefs.node&&n.startsWith('get_'))return n;
  if(o===row&&n==='get_anchoredPosition')return v(row.pos.x,row.pos.y);
  if(o===row&&n==='set_anchoredPosition'){row.pos=a[0];return;}
  if(o===button&&n==='get_transform')return ourNode;
  if(n.startsWith('set_')||n==='SetAsLastSibling'){writes.push([o,n,...a]);return;}
  return prev(o,n,...a);
 };
 const style=vm.runInContext('styleAsSettingsTab',c);
 return {style,tabSelf,button,layout,writes,ourImage,ourLabel,ourNode,row,restore(){c.call=prev;c.uiComponent=prevComponent;c.vec2=prevVec;}};
}
{
 const f=tabFixture(false);f.style(f.tabSelf,f.button,f.layout);
 const has=(o,n,v)=>f.writes.some(w=>w[0]===o&&w[1]===n&&(v===undefined||JSON.stringify(w[2])===JSON.stringify(v)));
 assert(has(f.ourImage,'set_sprite','frame')&&has(f.ourImage,'set_type','sliced'),'the tab frame sprite is used');
 assert(has(f.ourLabel,'set_font','game-font')&&has(f.ourLabel,'set_enableAutoSizing',true)&&has(f.ourLabel,'set_fontSizeMax',36),'the tab font and sizing are used');
 assert(f.writes.some(w=>w[0]==='SetParent'&&w[1]===f.row&&w[2]===false),'it joins the tab row');
 assert(has(f.ourNode,'set_sizeDelta','get_sizeDelta')&&has(f.ourNode,'set_anchorMin','get_anchorMin'),'same size and anchors as the tabs');
 assert(has(f.ourNode,'set_anchoredPosition',{x:450,y:0}),'one tab step past Preferences');
 assert.deepEqual(f.row.pos,{x:-150,y:-40},'the row moves back half a step: -150/150/450 centre on 0');
 f.restore();
}
{
 const f=tabFixture(true);f.style(f.tabSelf,f.button,f.layout);
 assert(f.writes.some(w=>w[0]===f.layout&&w[1]==='set_ignoreLayout'&&w[2]===false),'the row layout places the third tab');
 assert.deepEqual(f.row.pos,{x:0,y:-40},'a laid-out row is not moved');
 f.restore();
}
{
 const style=vm.runInContext('styleAsSettingsTab',c);
 assert.throws(()=>style({field:()=>({value:null})},{},{}),/tab group: Error: no _tabNavigation/,'the failing step is named');
}
console.log('PASS: Game data becomes a third settings tab of the same size, centred with the other two; the failing step is named');
