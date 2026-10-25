const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {transformSync}=require('esbuild');const text=fs.readFileSync('hook.ts','utf8');
const a=text.indexOf('  // BEGIN android-ui: global-shortcuts'),b=text.indexOf('  // END android-ui: global-shortcuts',a);
const code=transformSync(text.slice(a,b),{loader:'ts',target:'es2020'}).code;
const hooks={};let frame=1,phase=0,point={x:10,y:990},now=1000;
const input={method:name=>name==='GetKey'||name==='GetKeyDown'?{overload:()=>({virtualAddress:name})}:{invoke:()=>name==='get_touchCount'?1:{method:n=>({invoke:()=>n==='get_phase'?phase:point})}}};
const c={section:(_,f)=>f(),img:{},cls:()=>({method:()=>({virtualAddress:'GlobalUpdate'})}),
 Interceptor:{attach:(name,callbacks)=>hooks[name]=callbacks},ucls:name=>name.endsWith('Input')?input:{method:()=>({invoke:()=>frame})},
 enumVal:x=>x,uiXY:x=>x,chatScreen:()=>({width:2000,height:1000}),ptr:x=>x,log:()=>{},Date:{now:()=>now},Math};
vm.createContext(c);vm.runInContext(code,c);
function key(name,code){const self={},result={value:0,replace(v){this.value=v}};hooks[name].onEnter.call(self,[{toInt32:()=>code}]);hooks[name].onLeave.call(self,result);return result.value;}
function update(p){frame++;phase=p;now+=50;hooks.GlobalUpdate.onEnter();}
function tap(){update(0);update(3);}
assert.equal(key('GetKeyDown',100),0);
for(const screen of ['menu','battle']) {
 tap();tap();tap();assert.equal(key('GetKeyDown',100),0);
 update(1);assert.equal(key('GetKeyDown',100),1);assert.equal(key('GetKey',306),1);assert.equal(key('GetKey',100),1);
 assert.equal(key('GetKeyDown',65),0);update(1);assert.equal(key('GetKeyDown',100),0);
}
point={x:500,y:500};tap();tap();tap();update(1);assert.equal(key('GetKeyDown',100),0);
point={x:10,y:990};update(0);point={x:70,y:940};update(3);tap();tap();update(1);assert.equal(key('GetKeyDown',100),0,'swipe is not a tap');
assert.ok(!/Canvas|DebugWindow|Toast|set_isDebug|set_Debug/.test(code));
console.log('PASS: global corner gesture emits one Ctrl+D frame in menu/battle; outside taps and swipes ignored; permissions untouched');
