const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const root=process.argv[2];if(!root)throw Error('JVM fixture directory required');
const files=path.join(root,'success/tesl-reborn-updater');const state=JSON.parse(fs.readFileSync(path.join(files,'state.json')));
const embedded={meta:JSON.parse(fs.readFileSync(path.join(root,'embedded.json'))),code:fs.readFileSync(path.join(root,'embedded.js'),'utf8')};
const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('runtime/update-engine.js','utf8'),c);
let boots=0,saved=state;
c.TeslRebornUpdater=c.createRebornUpdater({readJSON:key=>key==='state'?saved:null,writeJSON:(key,value)=>{if(key==='state')saved=structuredClone(value);},readCore:hash=>fs.readFileSync(path.join(files,hash+'.js'),'utf8'),sha256:code=>crypto.createHash('sha256').update(code).digest('hex'),byteLength:code=>Buffer.byteLength(code),evaluate:code=>{boots++;vm.runInContext(code,c);},log:()=>{}},embedded);
c.TeslRebornUpdater.boot();assert.equal(boots,1);assert.equal(c.prelaunchLoaded,true);assert.equal(c.TeslRebornUpdater.current().revision,51);assert.equal(saved.active.revision,51);assert.equal(saved.pending,null);assert.equal(saved.booting,null);
console.log('PASS: actual Java-staged update loads and commits in first Unity boot through unchanged API 1');
