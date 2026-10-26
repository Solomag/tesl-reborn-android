const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const text=fs.readFileSync('hook.ts','utf8');
const redact=text.slice(text.indexOf('function redactLog('),text.indexOf('\nlet portLog ='));
const context={};vm.createContext(context);vm.runInContext(fs.readFileSync('runtime/port-log.js','utf8')+'\n'+redact,context);
const files={current:'previous-session'},sizes=[];let rotations=0;
const write=context.createPortLog({rotate(){rotations++;files.older=files.previous;files.previous=files.current;files.current='';},append(line){files.current+=line;sizes.push(Buffer.byteLength(files.current));}},context.redactLog);
write('-> https://example.test/login body: {"username":"name","password":"PRIVATE"}');
write('exception {"token":"SECRET","password":"OTHER"}');write('Authorization: Bearer PRIVATE');
assert(!files.current.includes('PRIVATE'));assert(!files.current.includes('SECRET'));assert(!files.current.includes('OTHER'));
assert(!files.current.includes('username'));assert.equal(files.previous,'previous-session');
for(let i=0;i<100;i++)write('Русский 😀'.repeat(1000));
assert(rotations>2);assert(Math.max(...sizes)<=128*1024,'UTF-8 byte limits, not UTF-16 string length');
const fail=context.createPortLog({rotate(){throw Error('full');},append(){throw Error('full');}},context.redactLog);
assert.doesNotThrow(()=>fail('error'));
const {transformSync}=require('esbuild');let handler,subscribed=0;const errors=[];
const unity={section:(_,fn)=>fn(),log:value=>errors.push(value),enumVal:value=>value,
 ucls:()=>({tryMethod:name=>name==='add_logMessageReceivedThreaded'?{virtualAddress:{isNull:()=>false},parameters:[{type:{class:{}}}],invoke:()=>subscribed++}:null}),
 Il2Cpp:{delegate:(_,callback)=>{handler=callback;return{ref:()=>({})};}}};
vm.createContext(unity);vm.runInContext(transformSync(require('./source.cjs')('unity-error-log'),{loader:'ts'}).code,unity);
assert.equal(subscribed,1);handler({content:'normal log'},{content:'stack'},3);assert.equal(errors.length,0);
handler({content:'load error'},{content:'asset stack'},0);handler({content:'warning'},{content:''},2);
assert.equal(errors.length,2);assert(errors[0].includes('asset stack'));
console.log('PASS: private rolling diagnostics, UTF-8 byte cap, previous sessions, omitted request bodies, redaction and storage-failure isolation');

// Actual native adapter rotation preserves a ten-start language test sweep.
const nativeFiles=new Map();let user=100000;
function pointer(value){return {value};}
const adapter={Date,Process:{getModuleByName:()=>({getExportByName:n=>n})},Memory:{allocUtf8String:pointer},
 NativeFunction:function(name){return name==='getuid'?()=>user:name==='mkdir'?()=>0:(from,to)=>{if(!nativeFiles.has(from.value))return -1;nativeFiles.set(to.value,nativeFiles.get(from.value));nativeFiles.delete(from.value);return 0;};},
 File:function(path){return{write:value=>nativeFiles.set(path,(nativeFiles.get(path)||'')+value),flush(){},close(){}};}};
vm.createContext(adapter);vm.runInContext(fs.readFileSync('runtime/port-log.js','utf8'),adapter);
for(let i=0;i<12;i++)adapter.createNativePortLog(x=>x)('session-'+i);
const directory='/data/user/1/com.bethsoft.theelderscrollslegends/files/tesl-reborn-logs/';
assert(nativeFiles.get(directory+'current.log').includes('session-11'));
assert(nativeFiles.get(directory+'previous-9.log').includes('session-2'));
assert.equal(nativeFiles.size,10);assert(![...nativeFiles.values()].some(v=>v.includes('session-0\n')));
