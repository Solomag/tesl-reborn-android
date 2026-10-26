const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {transformSync}=require('esbuild');
const text=fs.readFileSync('hook.ts','utf8');
const a=text.indexOf('  function resourceLanguage()'),b=text.indexOf('  // ---------------------------------------------------------------------',a+40);
const code=transformSync(text.slice(a,b),{loader:'ts',target:'es2020'}).code;
function fixture(type,choice){
 let clock=Date.now();
 const controls={}, nativeCalls=[], hooks={}, opened=[], restored=[];
 function control(name,parameters=[]) {return controls[name]={name,parameterCount:parameters.length,parameters,returnType:{name:'System.Void'},isStatic:false,virtualAddress:{isNull:()=>false,toString:()=>name},invokeRaw:(...args)=>nativeCalls.push([name,...args])};}
 const show=control('Show'),press=control('Press'),custom=control('OnLanguageSelected',[{type:{name:'System.Int32',class:{isEnum:false}}}]);let freed=0, touched=false, settingsOpen=true, dropdownIndex=0, dictionaryId='original', labels=['English','Русский','Deutsch'];
 const method={virtualAddress:'SetLanguage',isStatic:false,parameters:[{type}]};
 const c={Date:class extends Date {static now(){return clock;}},settingsButtonPressed:()=>{},resourceSettingsWindow:{target:{}},section:(_,f)=>f(),img:{classes:[{name:'LanguageSettings',hierarchy:function*(){yield {type:{name:'UnityEngine.Component'}}},methods:[custom]},{name:'SettingsWin',methods:[{name:'OnLanguageChanged',isStatic:false,virtualAddress:{isNull:()=>false,toString:()=>"LanguageUI"}}]},{name:'PlayerProfile',methods:[{name:'set_Language',parameterCount:1,parameters:[{type}],isStatic:false,virtualAddress:{isNull:()=>false,toString:()=>"ProfileLanguage"}}]}]},cls:()=>({method:n=>n==='SetLanguage'?method:{virtualAddress:n}}),
  Interceptor:{attach:(name,callbacks)=>hooks[name]=callbacks},persistentPath:()=>'/files',readTextFile:()=>JSON.stringify(choice),
  rawStr:x=>x?.value||'',Il2Cpp:{string:value=>({value,object:{ref:()=>({target:{handle:{value}},free:()=>freed++})}}),Object:function(){return {field:()=>({value:{handle:dictionaryId}}),ref:()=>({target:{},free:()=>{}})}}},
  ucls:n=>n.endsWith('PlayerPrefs')?{methods:[{name:'SetString',parameterCount:2,virtualAddress:'SavedLanguage'}]}:n.endsWith('Input')?{method:name=>({invoke:()=>name==='get_touchCount'&&touched?1:0})}:n==='UnityEngine.UI.Dropdown'?{tryMethod:name=>name==='Show'?show:name==='OnSelectItem'?{name:'OnSelectItem',parameterCount:1,virtualAddress:{isNull:()=>false,toString:()=>"DropdownSet"}}:null}:n==='UnityEngine.UI.Button'?{tryMethod:name=>name==='Press'?press:null}:{tryMethod:()=>null,method:()=>({invoke:x=>opened.push(x)})},
  isNull:x=>x==null,ptr:x=>x,enumVal:x=>x,log:()=>{},call:(o,name,...args)=>name==='get_activeInHierarchy'?(o?.active??settingsOpen):name==='get_gameObject'?o:name==='get_transform'?o:name==='get_parent'?null:name==='get_name'?{content:o?.name||'Play'}:name==='get_onClick'?{}:name==='GetPersistentEventCount'?0:name==='get_value'?dropdownIndex:name==='get_options'?{}:name==='get_Count'?labels.length:name==='get_Item'?{text:labels[args[0]]}:name==='get_text'?{content:o.text}:{content:'en'},countOf:()=>100,restoreLocalization:()=>{restored.push(choice.language);dictionaryId='restored-'+restored.length;return 100;},TRANSLATIONS:{},schedule:(_,f)=>f()};
 vm.createContext(c);vm.runInContext(code,c);
 function enter(old){const args=[{}, {value:old,toInt32:()=>-1}],self={};hooks.SetLanguage.onEnter.call(self,args);hooks.SetLanguage.onLeave.call(self);return args[1];}
 return {enableNativeCallback(){c.__teslNativeLanguageCallback=true;},advanceTime(ms){clock+=ms;},enter,controls,nativeCalls,showDropdown(){show.implementation.call({handle:'dropdown'});},pressButton(name){press.implementation.call({handle:'button',name});},customLanguage(index){custom.implementation.call({handle:'settings',active:true},index);},get freed(){return freed},hooks,opened,restored,choice,replaceDictionary(){dictionaryId='late-English';},setLabels(value){labels=value;},selectDropdown(index,notify=true){dropdownIndex=index;if(!notify)return;const self={};hooks.DropdownSet.onEnter.call(self,[{}, {toInt32:()=>index},{toInt32:()=>notify?1:0}]);hooks.DropdownSet.onLeave.call(self);},closeSettings(){settingsOpen=false;},tap(){touched=true;hooks.Update.onEnter();touched=false;}};
}
let f=fixture({name:'System.String'},{language:'ru_ru'});
assert.equal(f.enter('en').value,'ru');assert.equal(f.enter('en_US').value,'ru_RU');assert.equal(f.freed,2);
f.hooks.UpdateObjects.onEnter([{}]);
assert.equal(f.enter('en').value,'ru');assert.equal(f.opened.length,0); // Background account locale must never restart login.
f.tap();f.hooks.LanguageUI.onEnter();
assert.equal(f.enter('en').value,'ru');assert.equal(f.opened.length,1); // Explicit live switch uses native setup + clean process.
f.hooks.LanguageUI.onLeave();
f.enter('en');assert.equal(f.opened.length,1); // no repeated activity launches
f=fixture({name:'System.String'},{language:'en_us'});
f.hooks.UpdateObjects.onEnter([{}]); f.tap(); // The async continuation is outside the settings stack.
f.closeSettings();f.enter('ru_RU');assert.equal(f.opened.length,1);assert.ok(f.opened[0].value.includes('language=ru_ru&apply=1'));
f=fixture({name:'System.String'},{language:'en_us'});f.hooks.UpdateObjects.onEnter([{}]);f.closeSettings();f.tap();f.enter('ru_RU');assert.equal(f.opened.length,0,'ordinary gameplay touches must not turn a background locale change into a settings request');
f=fixture({name:'System.String'},{language:'en_us'});f.hooks.UpdateObjects.onEnter([{}]);f.tap();
f.hooks.SavedLanguage.onEnter([{value:'Language'},{value:'ru_RU'}]);assert.equal(f.opened.length,1);
f=fixture({name:'System.String'},{language:'en_us'});f.hooks.UpdateObjects.onEnter([{}]);
f.choice.language='ru_ru';f.hooks.UpdateObjects.onEnter([{}]);assert.deepEqual(f.restored,['en_us','ru_ru']);
f.hooks.UpdateObjects.onEnter([{}]);assert.equal(f.restored.length,2,'do not reparse the localization table every update');
f=fixture({name:'Game.Language',class:{isEnum:true,fields:[{isStatic:true,name:'Russian',value:8}]}},{language:'ru_ru'});assert.equal(f.enter('en'),8);
f=fixture({name:'System.String'},{language:'../escape'});assert.equal(f.enter('en').value,'en');assert.equal(f.freed,0);
assert.ok(!/clearSavedLogin\(\);/.test(text.slice(text.indexOf('  section("auto login"'),text.indexOf('  // CreditsLoaderPatch'))));
console.log('PASS: startup language, async in-game Settings switch, saved preference changes, unchanged-locale dictionary reload, no background switch, credentials preserved');

let test=fixture({name:'System.String'},{language:'ru_ru'});
assert.equal(test.enter('en_US').value,'ru_RU');
// The game keeps card/config language separately from the localized menu dictionary.
const tools={};vm.createContext(tools);vm.runInContext(transformSync(text.slice(text.indexOf('  function shortLanguage('),text.indexOf('  section("translation fixes"')),{loader:'ts'}).code,tools);
assert.equal(tools.localizedGameUri('https://tesl-reborn.com/api/config?language=en&x=1','ru_ru'),'https://tesl-reborn.com/api/config?language=ru&x=1');
assert.equal(tools.localizedGameUri('https://unrelated.example/api?language=en','ru_ru'),'https://unrelated.example/api?language=en');
assert.equal(tools.localizedAssetPath('AppBase/Localization/Text/en_US/data','ru_ru'),'AppBase/Localization/Text/ru_RU/data');

f=fixture({name:'System.String'},{language:'en_us'});f.hooks.UpdateObjects.onEnter([{}]);f.tap();
f.hooks.ProfileLanguage.onEnter([{}, {value:'ru_RU'}]);assert.equal(f.opened.length,1,'native profile setter must use the same language application path');
f=fixture({name:'System.String'},{language:'ru_ru'});f.hooks.UpdateObjects.onEnter([{}]);f.replaceDictionary();f.hooks.UpdateObjects.onEnter([{}]);assert.equal(f.restored.length,2,'late native dictionary replacement must be localized again');

f=fixture({name:'System.String'},{language:'en_us'});f.hooks.UpdateObjects.onEnter([{}]);f.tap();f.selectDropdown(1,false);assert.equal(f.opened.length,0,'initialization without notification is not a language choice');f.selectDropdown(1);assert.equal(f.opened.length,1,'native numeric dropdown must use its Russian label, not an assumed enum index');
f=fixture({name:'System.String'},{language:'en_us'});f.hooks.UpdateObjects.onEnter([{}]);f.tap();f.setLabels(['low','medium','high']);f.selectDropdown(1);assert.equal(f.opened.length,0,'graphics dropdown must not change game language');

// Reproduce the device failure: neither a recognized Settings root nor a loaded
// localization table is needed for an explicit language control. Suppress its
// original listeners (which could log out) rather than observing them afterwards.
f=fixture({name:'System.String'},{language:'en_us'});f.closeSettings();f.showDropdown();
assert.equal(f.opened.length,1);assert.ok(f.opened[0].value.endsWith('chooseLanguage=1'));
assert.equal(f.nativeCalls.length,0,'language dropdown must not run native listeners');
f.showDropdown();assert.equal(f.opened.length,1,'only one language chooser is opened');
f.advanceTime(2000);f.showDropdown();assert.equal(f.opened.length,2,'cancel and return must allow opening the chooser again');
f=fixture({name:'System.String'},{language:'en_us'});f.setLabels(['Low','Medium','High']);f.showDropdown();
assert.equal(f.nativeCalls.length,1,'graphics dropdown still invokes its original Show');assert.equal(f.opened.length,0);
f=fixture({name:'System.String'},{language:'en_us'});f.closeSettings();f.pressButton('LanguageSelector');
assert.equal(f.opened.length,1);assert.equal(f.nativeCalls.length,0,'dynamic language button is rerouted before Press');
f=fixture({name:'System.String'},{language:'en_us'});f.pressButton('Play');assert.equal(f.nativeCalls.length,1);assert.equal(f.opened.length,0);
f=fixture({name:'System.String'},{language:'en_us'});f.closeSettings();f.tap();f.customLanguage(8);
assert.equal(f.opened.length,1,'custom UI callback works without a recognized Settings root');assert.equal(f.nativeCalls.length,0,'custom callback cannot perform native logout');
f=fixture({name:'System.String'},{language:'en_us'});f.customLanguage(8);assert.equal(f.nativeCalls.length,1,'programmatic initialization without input is preserved');
console.log('PASS: language entry redirects before native listeners, missing Settings metadata, custom buttons, graphics dropdown and background initialization');

f=fixture({name:"System.String"},{language:"en_us"});f.enableNativeCallback();f.showDropdown();assert.equal(f.opened.length,0);assert.equal(f.nativeCalls.length,1,"real LanguageSelectDropdown keeps the original dropdown UI");
