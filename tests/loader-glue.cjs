const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const engine=fs.readFileSync('runtime/update-engine.js','utf8');
const glue=fs.readFileSync('runtime/loader-glue.js','utf8');
const core='// TESL-REBORN-ANDROID-CORE v1\n// Русский язык 🎮\nglobalThis.testLoaded = true; globalThis.TeslRebornUpdater?.ready();';
const embedded={code:core,meta:{schema:1,format:'tesl-reborn-hook-v1',loaderApi:1,gameVersionCode:11009,abi:'arm64-v8a',revision:5,version:'test-5',bytes:Buffer.byteLength(core),sha256:crypto.createHash('sha256').update(core).digest('hex')}};
for (const readOnly of [false,true]) {
 const disk=new Map(), calls=[];
 const natives={mkdir:()=>0,rename:(a,b)=>{if(readOnly)return -1;disk.set(b,disk.get(a));disk.delete(a);return 0;},
 open:()=>readOnly?-1:3,fsync:()=>0,close:()=>0,getuid:()=>10123,__android_log_write:()=>0};
 const c={escape:undefined,unescape:undefined,console:{log:()=>{}},Process:{getModuleByName:()=>({getExportByName:name=>name})},Memory:{allocUtf8String:x=>x},
 NativeFunction:function(name){return natives[name];},Checksum:{compute:(_,s)=>crypto.createHash('sha256').update(s).digest('hex')},
 File:class{
  constructor(path,mode){this.path=path;this.pos=0;if(mode==='rb'&&!disk.has(path))throw Error('not found');if(mode==='wb'){if(readOnly)throw Error('read-only');disk.set(path,'');}}
  seek(offset,whence){this.pos=whence===2?Buffer.byteLength(disk.get(this.path)):offset;}
  tell(){return this.pos;} readText(){return disk.get(this.path);} write(x){disk.set(this.path,x);} flush(){} close(){}
 },Script:{evaluate:(name,source)=>{calls.push(name);return vm.runInContext(source,c);}}};
 vm.createContext(c);
 vm.runInContext(engine+'\n'+glue.replace('__EMBEDDED_RELEASE__',JSON.stringify(embedded)),c);
 assert(c.testLoaded);assert.equal(calls.length,1);
 if(!readOnly)assert(disk.has('/storage/emulated/0/Android/data/com.bethsoft.theelderscrollslegends/files/tesl-reborn-update-status.json'));
}
console.log('PASS: native loader glue, UTF-8 file IO, atomic renames, core evaluation and read-only embedded startup');
