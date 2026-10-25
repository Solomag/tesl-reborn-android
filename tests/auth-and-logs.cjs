const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {transformSync}=require('esbuild');const src=fs.readFileSync('hook.ts','utf8');
const extract=(a,b)=>transformSync(src.slice(src.indexOf(a),src.indexOf(b,src.indexOf(a))),{loader:'ts'}).code;
const c={saved:[],pendingLogin:null,log:()=>{},isNull:x=>x==null,
 call:(o,n)=>({get_Uri:o.uri,get_State:o.state,get_Response:o.response,get_StatusCode:o?.status,get_DataAsText:{content:o?.body}}[n]),
 writeSavedLogin:(u,p)=>c.saved.push({username:u,password:p})};
vm.createContext(c);
vm.runInContext(extract('function redactLog(', '\nconst log ='),c);
vm.runInContext(extract('function loginOutcome(', '  section("http trace"'),c);
for(const secret of ['before"SECRET_SUFFIX','back\\slash"SECRET_SUFFIX','new\nlineSECRET_SUFFIX']) {
 assert(!c.redactLog(JSON.stringify({password:secret})).includes('SECRET_SUFFIX'));
}
assert(!c.redactLog('{"encryptedAppTicket":"TRUNCATED_SECRET').includes('TRUNCATED_SECRET'));
assert(!c.redactLog('{"password":"TRUNCATED_SECRET' + String.fromCharCode(92)).includes('TRUNCATED_SECRET'));
assert(!c.redactLog('Authorization: Basic SECRET\nX-Session-Token: SECRET').includes('SECRET'));
function response(status,body){c.pendingLogin={username:'Alice',password:'correct'};c.reportHttpResult({uri:'https://example.test/api/account/bnetUsernameAndPasswordLogin',state:'Finished',response:status?{status,body}:null},false);}
response(200,JSON.stringify({resultCode:0,data:{token:'synthetic-token'}}));assert.equal(c.saved.at(-1).password,'correct');
const before=c.saved.length;
for(const [status,body] of [[0,''],[503,''],[200,'invalid json'],[200,'{"resultCode":50}'],[200,'{"resultCode":0}']])response(status,body);
assert.equal(c.saved.length,before,'network or unknown result must preserve saved credentials');
response(200,'{"resultCode":15}');assert.equal(c.saved.at(-1).username,'Alice');assert.equal(c.saved.at(-1).password,'');
response(200,'{"resultCode":17}');assert.equal(c.saved.at(-1).password,'');
// Execute actual auto-login wrapper with both raw and managed callback representations.
for(const wrapped of [false,true]) {
 let invoked=0,freed=0,shown=0,scheduled=[];const methods={};
 const callback={method:()=>({invoke:()=>invoked++}),ref(){return{target:this,free:()=>freed++}}};
 const cred={field:()=>({set value(v){}}),unbox:()=>({})};
 const x={section:(_,f)=>f(),img:{},readSavedLogin:()=>({username:'Alice',password:'correct'}),prefillLoginUsername:()=>{},log:()=>{},
  schedule:(_,f)=>scheduled.push(f),NativeFunction:function(){return()=>shown++},
  cls:(_,n)=>n==='SparkleServices.UsernameAndPassword'?{alloc:()=>cred}:{method:m=>methods[m]??(methods[m]={virtualAddress:m})},
  Il2Cpp:{Object:function(handle){assert.equal(handle,'callback-pointer');return callback;},string:x=>x}};
 vm.createContext(x);vm.runInContext('let autoLoginTried=false;\n'+extract('  section("auto login",','  // CreditsLoaderPatch'),x);
 methods.OnLogin.implementation.call({handle:'self'},{handle:'title'},{handle:'desc'},wrapped?{handle:'callback-pointer'}:'callback-pointer');
 scheduled.forEach(f=>f());assert.equal(invoked,1);assert.equal(freed,1);assert.equal(shown,0);
 methods.OnLogin.implementation.call({handle:'self'},{handle:'title'},{handle:'desc'},'callback-pointer');assert.equal(shown,1,'one automatic attempt per process');
}
console.log('PASS: escaped/truncated log secrets, explicit auth outcomes, username retention and raw/managed callback invocation');
// Credential commits must replace the file only after a complete successful write.
const disk=new Map([['/files/tesl-login.json','previous']]);let fail=false;
const store={persistentPath:()=>'/files',log:()=>{},atomicRename:(a,b)=>{if(fail)return false;disk.set(b,disk.get(a));disk.delete(a);return true;},writeTextFile:(p,s)=>{disk.set(p,s);return true;}};
vm.createContext(store);vm.runInContext('const LOGIN_FILE="tesl-login.json";\n'+extract('  function writeSavedLogin(', '  function prefillLoginUsername('),store);
fail=true;store.writeSavedLogin('Alice','new');assert.equal(disk.get('/files/tesl-login.json'),'previous');
fail=false;store.writeSavedLogin('Alice','');assert.deepEqual(JSON.parse(disk.get('/files/tesl-login.json')),{username:'Alice',password:''});
const delegate={Il2Cpp:{String:function(p){this.handle=p},Object:function(p){this.handle=p}}};vm.createContext(delegate);
vm.runInContext(extract('function invokeDelegateInt(', '\nfunction nested(')+extract('function invokeDelegatePtr(', '\nconst CREATE_ACCOUNT'),delegate);
let args=[];let boxedValue;
const enumType={isEnum:true,alloc:()=>({field:()=>({set value(v){boxedValue=v}}),unbox:()=>({enumValue:boxedValue})})};
delegate.invokeDelegateInt({method:()=>({parameters:[{type:{class:enumType}}],invoke:v=>args.push(v)})},8);assert.equal(args[0].enumValue,8);
delegate.invokeDelegatePtr({method:()=>({parameters:[{type:{name:'System.String'}}],invoke:v=>args.push(v)})},'managed-string');assert.equal(args[1].handle,'managed-string');
console.log('PASS: credential commit failure preserves the previous file; managed delegate enum/string marshalling');

const raw=Buffer.from(JSON.stringify({username:'Соло',password:'сложный"пароль'}),'utf8');
const captured={escape:undefined,call:()=>({handle:{isNull:()=>false},length:raw.length,get:i=>raw[i]}),log:()=>{}};
vm.createContext(captured);vm.runInContext(extract('  let pendingLogin:', '  // 2) Config redirect:'),captured);
captured.captureLogin({},'https://example.test/bnetUsernameAndPasswordLogin');
assert.equal(vm.runInContext('pendingLogin.username',captured),'Соло');
assert.equal(vm.runInContext('pendingLogin.password',captured),'сложный"пароль');
console.log('PASS: UTF-8 login capture without legacy escape() global');
