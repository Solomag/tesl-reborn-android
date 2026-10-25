const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {transformSync}=require('esbuild');const text=fs.readFileSync('hook.ts','utf8');
const a=text.indexOf('  // BEGIN android-ui: global-shortcuts'),b=text.indexOf('  // END android-ui: global-shortcuts',a);
const code=transformSync(text.slice(a,b),{loader:'ts',target:'es2020'}).code;
const hooks={}, logs=[];let frame=1,phase=0,point={x:10,y:990},now=1000,count=1;
const names=['GetKey','GetKeyDown','GetKeyInt','GetKeyDownInt','GetKeyString','GetKeyDownString','get_anyKey','get_anyKeyDown'];
const input={methods:names.map(name=>({name,virtualAddress:name,parameters:name.startsWith('get_')?[]:[{type:{name:name.endsWith('String')?'System.String':'UnityEngine.KeyCode'}}]})),
 method:name=>({invoke:()=>name==='get_touchCount'?count:{method:n=>({invoke:()=>n==='get_phase'?phase:point})}})};
const c={section:(_,f)=>f(),img:{},cls:()=>({method:()=>({virtualAddress:'GlobalUpdate'})}),
 Interceptor:{attach:(name,callbacks)=>hooks[name]=callbacks},ucls:name=>name.endsWith('Input')?input:{method:()=>({invoke:()=>frame})},
 Il2Cpp:{module:{getExportByName:()=>"resolve"}}, NativeFunction:function(){return name=>'native:'+name},Memory:{allocUtf8String:x=>x},
 rawStr:x=>x?.value||'',enumVal:x=>x,uiXY:x=>x,chatScreen:()=>({width:2000,height:1000}),ptr:x=>x,log:x=>logs.push(x),Date:{now:()=>now},Math};
vm.createContext(c);vm.runInContext(code,c);
function key(name,code){const self={},result={value:0,replace(v){this.value=v}};hooks[name].onEnter.call(self,[typeof code==='string'?{value:code}:{toInt32:()=>code}]);hooks[name].onLeave.call(self,result);return result.value;}
function update(p){frame++;phase=p;now+=50;hooks.GlobalUpdate.onEnter();}
function tap(){update(0);update(3);}
assert.equal(key('GetKeyDown',100),0);
for(const screen of ['menu','battle']) {
 tap();tap();tap();assert.equal(key('GetKeyDown',100),0);
 update(1);assert.equal(key('get_anyKeyDown',0),1);
 assert.equal(key('GetKeyDownInt',100),1);assert.equal(key('GetKey',306),1);assert.equal(key('GetKeyString','d'),1);
 assert.equal(key('GetKeyDownString','d'),1);assert.equal(key('GetKeyString','left ctrl'),1);
 assert.equal(key('GetKeyDown',65),0);update(1);assert.equal(key('GetKeyDownInt',100),0);
}
// A native caller can bypass all managed overloads and query D later in the frame order.
tap();tap();tap();update(1);assert.equal(key('native:UnityEngine.Input::get_anyKeyDown',0),1);
update(1);assert.equal(key('native:UnityEngine.Input::GetKeyDownInt',100),1);
update(1);assert.equal(key('native:UnityEngine.Input::GetKeyDownInt',100),0);
point={x:500,y:500};tap();tap();tap();update(1);assert.equal(key('GetKeyDown',100),0);
point={x:10,y:990};update(0);point={x:90,y:920};update(3);tap();tap();update(1);assert.equal(key('GetKeyDown',100),0,'swipe is not a tap');
count=2;update(0);count=1;tap();tap();update(1);assert.equal(key('GetKeyDown',100),0);
assert.ok(logs.some(x=>x.includes('gesture-detected')));assert.ok(logs.some(x=>x.includes('ctrl-d-forwarded')));
assert.ok(!/Canvas|DebugWindow|Toast|set_isDebug|set_Debug/.test(code));
console.log('PASS: corner gesture, native/inlined Unity input, string/enum overloads, anyKey guards, single-frame chord, scene independence and diagnostics');

const android={...c,readTextFile:()=>JSON.stringify({debugInput:'android-key-events'}),persistentPath:()=>'/files',Interceptor:{attach:()=>{throw Error('legacy key synthesis must be disabled for Android key events')}}};
vm.createContext(android);vm.runInContext(code,android);
