const vm=require('node:vm'),assert=require('node:assert/strict'),{transformSync}=require('esbuild');
const source=require('./source.cjs');
const code=transformSync(source('localized-language-state'),{loader:'ts'}).code;
function fixture(selected='en_us', fields=[['EN_US',71],['RU_RU',12],['DE_DE',43]]) {
 let now=1000,actual='ru';const hooks={},calls=[],reports=[];
 const klass={isEnum:true,fields:fields.map(([name,value])=>({isStatic:true,name,value:{number:value}}))};
 const type={name:'LocalizedLanguage',class:klass};
 const method=(name,params=[],ret='System.Void')=>({name,parameters:params,returnType:{name:ret},virtualAddress:{isNull:()=>false,toString:()=>name},isStatic:false});
 const set=method('SetLanguage',[{type},{type:{name:'System.Boolean'}}]);
 const current=method('GetCurrentLanguage',[],type.name),defaults=method('GetSystemDefaultLanguage',[],type.name),setter=method('SetCurrentLanguage',[{type}]);
 const manager={class:{fields:[]},handle:'manager',ref:()=>({target:manager,free:()=>{}}),method:name=>({invoke:(value,flag)=>{
  calls.push([name,value,flag]); if(name==='SetLanguage') actual=value.number===71?'en':value.number===12?'ru':'de';
 }})};
 const settingsInstance={method:name=>({invoke:value=>calls.push([name,value])})};
 const localization={method:name=>name==='SetLanguage'?set:{invoke:()=>manager},tryMethod:name=>name==='GetSystemDefaultLanguage'?defaults:null};
 const settings={method:()=>({invoke:()=>settingsInstance}),tryMethod:name=>name==='GetCurrentLanguage'?current:name==='SetCurrentLanguage'?setter:null};
 const c={section:(_,f)=>f(),img:{},Date:{now:()=>now},globalThis:null,
 cls:(img,name)=>name==='LocalizationManager'?localization:name==='SettingsManager'?settings:{method:()=>({virtualAddress:'Update'})},
 Interceptor:{attach:(address,hook)=>hooks[address]=hook},resourceLanguage:()=>selected,languageLabel:()=>undefined,enumVal:x=>x.number,
 ptr:x=>x,isNull:x=>x==null,Il2Cpp:{Object:function(){return manager;}},schedule:(_,f)=>f(),log:()=>{},
 persistentPath:()=>'/files',writeTextFile:(path,text)=>reports.push(JSON.parse(text)),restoreLocalization:(m,choice)=>calls.push(['restore',choice]),
 call:(o,name)=>name==='get_CurrentLanguageCode'?{content:actual}:null};
 c.globalThis=c;vm.createContext(c);vm.runInContext(code,c);
 return {c,hooks,calls,reports,get actual(){return actual;},select(value){selected=value;now+=2000;hooks.Update.onLeave();}};
}
let f=fixture();assert.equal(f.actual,'en','reconcile the reported en_us selection / native ru mismatch');
assert.equal(f.calls[0][0],'SetLanguage');assert.equal(f.calls[0][1].number,71,'use the actual game enum, not LocCode 0');
assert(f.calls.some(x=>x[0]==='restore'&&x[1]==='en_us'));assert(f.calls.some(x=>x[0]==='UpdateObjects'));
assert.equal(f.reports[0].before,'ru');assert.equal(f.reports[0].after,'en');
let args=[{}, {toInt32:()=>12}];f.hooks.SetLanguage.onEnter(args);assert.equal(args[1],71);
const result={replace(value){this.value=value;}};f.hooks.GetSystemDefaultLanguage.onLeave(result);assert.equal(result.value,71);
f.hooks.GetCurrentLanguage.onLeave(result);assert.equal(result.value,71);
f.select('ru_ru');assert.equal(f.actual,'ru');assert.equal(f.reports.at(-1).selected,'ru_ru');
f=fixture('en_us',[['UNKNOWN',99]]);assert.equal(f.calls.length,0,'unresolved languages do not receive an invented enum value');

const hook=require('node:fs').readFileSync('hook.ts','utf8');
const labelSource=hook.slice(hook.indexOf('  function languageLabel('),hook.indexOf('  section("translation fixes"'));
const labelCode=transformSync(labelSource,{loader:'ts'}).code;
const native=transformSync(source('native-language-dropdown'),{loader:'ts'}).code;
let selected='ru_ru',labels=['English','Русский язык'];
const hooks={},opened=[],original=[],logs=[];const handler={virtualAddress:{isNull:()=>false},invokeRaw:(...args)=>original.push(args)};
const dropdown={options:true},self={handle:'language-component',class:{fields:[{isStatic:false,name:'selector',type:{name:'UnityEngine.UI.Dropdown'}}]},field:()=>({value:dropdown})};
const c={section:(_,f)=>f(),img:{classes:[{name:'LanguageSelectDropdown',tryMethod:()=>handler}]},
 Interceptor:{attach:(address,h)=>hooks[address]=h},ucls:name=>name==='UnityEngine.UI.Dropdown'?{tryMethod:()=>({virtualAddress:{isNull:()=>false,toString:()=>"select"}})}:name==='UnityEngine.Application'?{method:()=>({invoke:value=>opened.push(value)})}:{tryMethod:()=>null},
 call:(o,name,...args)=>{if(name==='get_options'){if(!o.options)throw Error('component');return{};}if(name==='get_Count')return labels.length;if(name==='get_Item')return {text:labels[args[0]]};if(name==='get_text')return {content:o.text};},
 isNull:x=>x==null,resourceLanguage:()=>selected,schedule:(_,f)=>f(),Il2Cpp:{string:x=>x},log:value=>logs.push(value)};
vm.createContext(c);vm.runInContext(labelCode,c);vm.runInContext(native,c);handler.implementation.call(self,0);assert.equal(original.length,1,'programmatic initialization is preserved');
hooks.select.onEnter();handler.implementation.call(self,0);hooks.select.onLeave();
assert.equal(original.length,1,'user selection cannot run the logout coroutine');assert.equal(opened.length,1);assert(opened[0].includes('language=en_us&apply=1'));
selected='en_us';hooks.select.onEnter();handler.implementation.call(self,1);hooks.select.onLeave();
assert.equal(opened[1],'teslreborn://resources?language=ru_ru&apply=1','the actual Русский язык label must apply Russian directly, without opening the manual chooser');
assert.equal(original.length,1,'Russian selection must also suppress the logout coroutine');
assert.equal(c.languageLabel('<b>Русский\u00a0язык</b>'),'ru_ru');
assert.equal(c.languageLabel('Русский'),'ru_ru');assert.equal(c.languageLabel('Russian'),'ru_ru');
selected='ru_ru';hooks.select.onEnter();handler.implementation.call(self,1);hooks.select.onLeave();
assert.equal(opened.length,2,'selecting the active language must not restart the game');
labels[1]='Unrecognized language';hooks.select.onEnter();handler.implementation.call(self,1);hooks.select.onLeave();
assert.equal(opened[2],'teslreborn://resources?chooseLanguage=1');
assert(logs.some(value=>value.includes('Unknown language label "Unrecognized language"')),'unknown menu labels must be recorded for diagnosis');
console.log('PASS: device locale mismatch, actual enum IDs, settings/default getter, complete dictionary refresh and original language dropdown callback');

const from=hook.indexOf('  function restoreLocalization('),to=hook.indexOf('  // ---------------------------------------------------------------------',from);
const restored=new Map(),slot={value:null};const dictionary={method:()=>({invoke:(key,value)=>restored.set(key,value)})};
const context={isNull:x=>x==null,resourceLanguage:()=> 'en_us',shortLanguage:x=>x.slice(0,2),persistentPath:()=>'/files',readTextFile:()=>JSON.stringify({menu:'Settings'}),
 Il2Cpp:{string:x=>x,corlib:{class:()=>({inflate:()=>({new:()=>dictionary})})}},TRANSLATIONS:{en:{pluginKey:'Plugin label'}},log:()=>{}};
vm.createContext(context);vm.runInContext(transformSync(hook.slice(from,to),{loader:'ts'}).code,context);
assert.equal(context.restoreLocalization({field:()=>slot},'en'),1);assert.equal(restored.get('menu'),'Settings');assert.equal(restored.get('pluginKey'),'Plugin label');assert.equal(slot.value,dictionary);
