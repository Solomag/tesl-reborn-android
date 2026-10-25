const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {transformSync}=require('esbuild');
const code=transformSync(require('./source.cjs')('settings-diagnostics'),{loader:'ts'}).code;
let clock=10000, request=null;const outputs=new Map(),reads=[];let update;
const root={name:'ActualOptionsRoot',parent:null},node={name:'SettingsButton',parent:root};
const button={node,active:true};const strings={ 'en_us':{'menu':'Settings'}, 'ru_ru':{'menu':'Настройки'} };
const c={Date:class extends Date{static now(){return clock;}},section:(_,f)=>f(),schedule:(_,f)=>f(),log:()=>{},isNull:x=>x==null,persistentPath:()=>'/files',
 readTextFile:path=>{reads.push(path);if(path.endsWith('inspect-request.json'))return JSON.stringify(request);
 if(path.endsWith('language.json'))return JSON.stringify({language:'en_us',system:false});
 if(path.endsWith('update-status.json'))return JSON.stringify({current:{revision:31,version:'test-31'}});
 for(const lang of Object.keys(strings))if(path.endsWith('tesl-localization-'+lang+'.json'))return JSON.stringify(strings[lang]);return '';},
 writeTextFile:(path,text)=>outputs.set(path,JSON.parse(text)),img:{classes:[{name:'ActualOptionsController',methods:[{name:'OnLanguageChanged',parameters:[{type:{name:'System.String'}}],returnType:{name:'System.Void'}}]}]},
 cls:(img,name)=>name==='LocalizationManager'?{methods:[],method:()=>({invoke:()=>({manager:true})})}:{method:()=>({virtualAddress:'Update'})},
 Interceptor:{attach:(address,hooks)=>update=hooks.onLeave},ucls:name=>name==='UnityEngine.Resources'?{method:()=>({overload:()=>({invoke:()=>({length:1,get:()=>button})})})}:{type:{object:{}}},
 call:(o,name,...args)=>name==='get_CurrentLanguageCode'?{content:'ru'}:name==='get_gameObject'?o:name==='get_activeInHierarchy'?o.active:name==='get_transform'?o.node:name==='get_name'?{content:o.name}:name==='get_parent'?o.parent:name==='get_onClick'?{}:name==='GetPersistentEventCount'?0:undefined};
vm.createContext(c);vm.runInContext(code,c);
update();assert.equal(outputs.size,0);
request={id:'a',label:'../../outside'};clock+=1001;update();assert.equal(outputs.size,0);
request={id:'b',label:'settings'};clock+=1001;update();
const report=outputs.get('/files/tesl-reborn-settings-report-settings.json');
assert(report);assert.equal(report.choice.language,'en_us');assert.equal(report.managerLanguage,'ru');
assert.equal(report.buttons[0].path,'ActualOptionsRoot/SettingsButton');
assert.equal(report.localizationFiles[0].cyrillicValues,0);assert.equal(report.localizationFiles[1].cyrillicValues,1);
assert.equal(report.classes[0].methods[0].parameters[0],'System.String');
clock+=1001;update();assert.equal(outputs.size,1,'do not repeat the same capture');
assert(reads.every(path=>!path.includes('tesl-login')),'diagnostic must not read credentials');
console.log('PASS: requested Settings snapshots, actual root paths, selected/native locale mismatch, limited metadata and path validation');
