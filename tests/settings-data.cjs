const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
const text=fs.readFileSync('hook.ts','utf8');
const a=text.indexOf('  // BEGIN android-ui: settings-data'),b=text.indexOf('  // END android-ui: settings-data',a);
const objects=new Map();let opened=0,created=0;
const root={};const self={};let rootName="SettingsWin_Mobile(Clone)", controls=1;
const window={handle:{equals:()=>true,toString:()=> 'settings'},method:()=>({overload:()=>({invoke:()=>({length:controls})})}),ref:()=>({target:window,free:()=>{}})};
const c={resourceSettingsWindow:null,section:()=>{},resourceLanguage:()=>"en_us",fileExists:()=>true,persistentPath:()=>'/files',isNull:x=>x==null,
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
