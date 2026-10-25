const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {transformSync}=require('esbuild');
const text=fs.readFileSync('hook.ts','utf8');
const a=text.indexOf('  function resourceLanguage()'),b=text.indexOf('  // ---------------------------------------------------------------------',a+40);
const code=transformSync(text.slice(a,b),{loader:'ts',target:'es2020'}).code;
function fixture(type,choice){
 const hooks={}, opened=[];let freed=0;
 const method={virtualAddress:'SetLanguage',isStatic:false,parameters:[{type}]};
 const c={section:(_,f)=>f(),img:{classes:[{name:'SettingsWin',methods:[{name:'OnLanguageChanged',isStatic:false,virtualAddress:{isNull:()=>false,toString:()=>"LanguageUI"}}]}]},cls:()=>({method:n=>n==='SetLanguage'?method:{virtualAddress:n}}),
  Interceptor:{attach:(name,callbacks)=>hooks[name]=callbacks},persistentPath:()=>'/files',readTextFile:()=>JSON.stringify(choice),
  rawStr:x=>x?.value||'',Il2Cpp:{string:value=>({object:{ref:()=>({target:{handle:{value}},free:()=>freed++})}}),Object:function(){return {field:()=>({value:{}})}}},
  ucls:n=>n.endsWith('PlayerPrefs')?{methods:[]}:{tryMethod:()=>null,method:()=>({invoke:x=>opened.push(x)})},
  ptr:x=>x,enumVal:x=>x,log:()=>{},call:()=>({content:choice?.language?.slice(0,2)||'en'}),countOf:()=>100,restoreLocalization:()=>0,TRANSLATIONS:{},schedule:(_,f)=>f()};
 vm.createContext(c);vm.runInContext(code,c);
 function enter(old){const args=[{}, {value:old,toInt32:()=>-1}],self={};hooks.SetLanguage.onEnter.call(self,args);hooks.SetLanguage.onLeave.call(self);return args[1];}
 return {enter,get freed(){return freed},hooks,opened};
}
let f=fixture({name:'System.String'},{language:'ru_ru'});
assert.equal(f.enter('en').value,'ru');assert.equal(f.enter('en_US').value,'ru_RU');assert.equal(f.freed,2);
f.hooks.UpdateObjects.onEnter([{}]);
assert.equal(f.enter('en').value,'ru');assert.equal(f.opened.length,0); // Background account locale must never restart login.
f.hooks.LanguageUI.onEnter();
assert.equal(f.enter('en').value,'ru');assert.equal(f.opened.length,1); // Explicit live switch uses native setup + clean process.
f.hooks.LanguageUI.onLeave();
f.enter('en');assert.equal(f.opened.length,1); // no repeated activity launches
f=fixture({name:'Game.Language',class:{isEnum:true,fields:[{isStatic:true,name:'Russian',value:8}]}},{language:'ru_ru'});assert.equal(f.enter('en'),8);
f=fixture({name:'System.String'},{language:'../escape'});assert.equal(f.enter('en').value,'en');assert.equal(f.freed,0);
assert.ok(!/clearSavedLogin\(\);/.test(text.slice(text.indexOf('  section("auto login"'),text.indexOf('  // CreditsLoaderPatch'))));
console.log('PASS: consistent startup language, safe live switch, invalid-choice fallback and credentials preserved on login-screen reentry');
