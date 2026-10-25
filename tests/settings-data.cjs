const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
const text=fs.readFileSync('hook.ts','utf8');
const a=text.indexOf('  // BEGIN android-ui: settings-data'),b=text.indexOf('  // END android-ui: settings-data',a);
const objects=new Map();let opened=0,created=0;
const root={};const self={};let rootName="SettingsWin", controls=1, languageUI=true;
const window={handle:{equals:()=>true},method:()=>({overload:()=>({invoke:type=>({length:languageUI&&type==='UnityEngine.UI.Dropdown'?controls:0,get:()=>({})})})}),ref:()=>({target:window,free:()=>{}})};
const c={resourceSettingsWindow:null,section:()=>{},resourceLanguage:()=>"en_us",fileExists:()=>true,persistentPath:()=>'/files',isNull:x=>x==null,
 languageLabel:x=>['English','Русский'].includes(x)?x:undefined,
 call:(o,n,...args)=>n==='get_options'?{}:n==='get_Count'?2:n==='get_Item'?{label:args[0]===0?'English':'Русский'}:n==='get_text'?{content:o.label}:n==='get_transform'?root:n==='get_gameObject'?window:n==='get_name'?{content:rootName}:n==='Find'?objects.get(args[0])||null:undefined,
 Il2Cpp:{string:x=>x},uiLabeledButton:(name,parent,label,x,y,width,action)=>{created++;objects.set(name,{action});return{}},uiAdd:()=>({}),
 ucls:name=>({type:{object:name},method:()=>({invoke:()=>opened++})})};
vm.createContext(c);vm.runInContext(transformSync(text.slice(a,b),{loader:'ts'}).code,c);
rootName='SettingsMenuWin';c.installSettingsDataButton(self);assert.equal(created,0);rootName='OptionsWin';controls=0;c.installSettingsDataButton(self);assert.equal(created,0);rootName='SettingsWin';controls=1, languageUI=true;c.installSettingsDataButton(self);c.installSettingsDataButton(self);assert.equal(created,1);objects.get('RebornGameData').action();assert.equal(opened,1);
const chat=text.slice(text.indexOf('  function chatSetup('),text.indexOf('  function chatContains('));
assert(!chat.includes('RebornResources'));assert(!chat.includes('teslreborn://resources'));
console.log('PASS: one Settings Game data button; no resource button or deep link in chat');
