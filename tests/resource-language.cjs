const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {transformSync}=require('esbuild');
const text=fs.readFileSync('hook.ts','utf8');
const a=text.indexOf('  section("translation fixes",'),b=text.indexOf('  // ---------------------------------------------------------------------',a+40);
const code=transformSync(text.slice(a,b),{loader:'ts',target:'es2020'}).code;
function fixture(type,choice,old='en'){
 const hooks={};let freed=0;
 const method={virtualAddress:'SetLanguage',isStatic:false,parameters:[{type}]};
 const c={section:(_,f)=>f(),img:{},cls:()=>({method:n=>n==='SetLanguage'?method:{virtualAddress:n}}),
  Interceptor:{attach:(name,callbacks)=>hooks[name]=callbacks},persistentPath:()=>'/files',readTextFile:()=>JSON.stringify(choice),
  rawStr:x=>x.value,Il2Cpp:{string:value=>({object:{ref:()=>({target:{handle:{value}},free:()=>freed++})}})},
  ptr:x=>x,enumVal:x=>x,log:()=>{}};
 vm.createContext(c);vm.runInContext(code,c);const args=[{}, {value:old}],self={};
 hooks.SetLanguage.onEnter.call(self,args);hooks.SetLanguage.onLeave.call(self);
 return {args,freed,hooks};
}
let result=fixture({name:'System.String'}, {language:'ru_ru'});assert.equal(result.args[1].value,'ru');assert.equal(result.freed,1);
result=fixture({name:'System.String'}, {language:'ru_ru'},'en_US');assert.equal(result.args[1].value,'ru_RU');
result=fixture({name:'Game.Language',class:{isEnum:true,fields:[{isStatic:true,name:'Russian',value:8}]}},{language:'ru_ru'});assert.equal(result.args[1],8);
result=fixture({name:'System.String'},{language:'../escape'});assert.equal(result.args[1].value,'en');assert.equal(result.freed,0);
console.log('PASS: locale override validates language, preserves string shape, pins managed strings and resolves enum names');
