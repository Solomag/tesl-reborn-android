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

// Report 30: the plain grey button looked foreign. It takes the Audio tab's
// sprite, font, size and colours and joins the tab row; a missing tab group
// keeps the plain button instead of failing.
{
 const tabArt={class:{type:{name:'UnityEngine.UI.Image'}}},tabLabel={},tabNode={},row={},tabGo={};
 const ourImage={},ourLabel={},ourNode={},ourGo={},layout={},writes=[];
 const tab={};const toggles={length:2,get:()=>tab};
 const tabSelf={field:n=>({value:n==='_tabNavigation'?{field:()=>({value:toggles})}:null})};
 const style=vm.runInContext('styleAsSettingsTab',c);
 const prev=c.call,prevComponent=c.uiComponent,prevPlace=c.uiPlace;
 c.uiComponent=(o,type)=>type==='UnityEngine.UI.Image'?ourImage:null;
 c.uiPlace=(o,...a)=>writes.push(['place',...a]);
 c.call=(o,n,...a)=>{
  if(o===tab&&n==='get_gameObject')return tabGo;if(o===tabGo&&n==='get_transform')return tabNode;
  if(o===tabNode&&n==='get_parent')return row;if(o===tab&&n==='get_targetGraphic')return tabArt;
  if(o===tabArt)return n==='get_sprite'?'frame':n==='get_type'?'sliced':'white';
  if(o===tabLabel)return n==='get_font'?'game-font':n==='get_fontSize'?36:'gold';
  if(o===tabNode&&n==='get_rect')return {field:f=>({value:f==='m_Width'?280:64})};
  if(o===tabNode&&n==='get_localScale')return 'scale';
  if(o==='button'&&n==='get_transform')return ourNode;if(o==='button'&&n==='get_gameObject')return ourGo;
  if(n.startsWith('set_')||n==='SetAsLastSibling'){writes.push([o,n,...a]);return;}
  return prev(o,n,...a);
 };
 tabGo.method=()=>({overload:()=>({invoke:()=>tabLabel})});ourGo.method=()=>({overload:()=>({invoke:()=>ourLabel})});
 ourNode.method=()=>({overload:()=>({invoke:(parent,keep)=>writes.push(['SetParent',parent,keep])})});
 style(tabSelf,'button',layout);
 const has=(o,n,v)=>writes.some(w=>w[0]===o&&w[1]===n&&(v===undefined||w[2]===v));
 assert(has(ourImage,'set_sprite','frame')&&has(ourImage,'set_type','sliced'),'the tab frame sprite is used');
 assert(has(ourLabel,'set_font','game-font')&&has(ourLabel,'set_fontSize',36)&&has(ourLabel,'set_color','gold'),'the tab font is used');
 assert(writes.some(w=>w[0]==='SetParent'&&w[1]===row&&w[2]===false),'it joins the tab row');
 assert(has(layout,'set_ignoreLayout',false)&&has(layout,'set_preferredWidth',280)&&has(layout,'set_preferredHeight',64),'laid out like a tab');
 assert.throws(()=>style({field:()=>({value:null})},'button',layout),/_tabNavigation/);
 c.call=prev;c.uiComponent=prevComponent;c.uiPlace=prevPlace;
 console.log('PASS: Game data takes the settings tab look and joins the tab row; without tabs the plain button stays');
}
