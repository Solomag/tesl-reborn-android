const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {transformSync}=require('esbuild');const text=fs.readFileSync('hook.ts','utf8');
const a=text.indexOf('  section("mobile debug shortcut"'),b=text.indexOf('// END android-ui: chat-window',a);
const code=transformSync(text.slice(a,b),{loader:'ts',target:'es2020'}).code;
const hooks={};let frame=0;
const address=name=>({toString:()=>name,isNull:()=>false});
const input={method:name=>name==='GetKey'||name==='GetKeyDown'?{overload:()=>({virtualAddress:name})}:{invoke:()=>name==='get_touchCount'?1:{method:n=>({invoke:()=>n==='get_phase'?3:{x:10,y:95}})}}};
const c={section:(_,f)=>f(),img:{classes:[{name:'DebugWindow',methods:[{name:'Update',parameterCount:0,isStatic:false,virtualAddress:address('DebugUpdate')}]}]},
 Interceptor:{attach:(name,callbacks)=>hooks[name]=callbacks},ucls:name=>name.endsWith('Input')?input:{method:()=>name.endsWith('Time')?{invoke:()=>++frame}:{virtualAddress:'Render'}},
 enumVal:x=>x,uiXY:x=>x,chatScreen:()=>({width:100,height:100}),ptr:x=>x,log:()=>{},Date};
vm.createContext(c);vm.runInContext(code,c);
function key(name,code){const self={},result={value:0,replace(v){this.value=v}};hooks[name].onEnter.call(self,[{toInt32:()=>code}]);hooks[name].onLeave.call(self,result);return result.value;}
assert.equal(key('GetKeyDown',100),0);
for(let i=0;i<3;i++) hooks.Render.onLeave();
assert.equal(key('GetKeyDown',100),0); // Original debug poller must actually run.
hooks.DebugUpdate.onEnter();
assert.equal(key('GetKeyDown',100),1); // D may be queried before Ctrl.
assert.equal(key('GetKey',306),1);
hooks.DebugUpdate.onLeave();
hooks.DebugUpdate.onEnter();assert.equal(key('GetKeyDown',100),0);hooks.DebugUpdate.onLeave();
assert.ok(!/Toast|set_isDebug|set_Debug|DebugEnabled/.test(code));
console.log('PASS: hidden gesture only simulates one native Ctrl+D chord inside the original debug poller');
