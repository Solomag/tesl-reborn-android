const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const manifest=JSON.parse(fs.readFileSync('updates/test/manifest.json','utf8'));
const sha=code=>crypto.createHash('sha256').update(code).digest('hex');
const payload=fs.readFileSync('updates/payloads/'+manifest.sha256+'.js','utf8');
assert.equal(sha(payload),manifest.sha256);assert.equal(Buffer.byteLength(payload),manifest.bytes);
const embeddedCode='// TESL-REBORN-ANDROID-CORE v1\n// Simulated installed APK 31';
const embedded={code:embeddedCode,feedUrl:'https://raw.githubusercontent.com/Solomag/tesl-reborn-android/android-ui-and-update-loader/updates/test/manifest.json',
 meta:{schema:1,format:'tesl-reborn-hook-v1',loaderApi:1,gameVersionCode:11009,abi:'arm64-v8a',revision:manifest.revision-1,version:'older-apk',bytes:Buffer.byteLength(embeddedCode),sha256:sha(embeddedCode)}};
const disk={},cores={};let loaded;
const c={};vm.createContext(c);vm.runInContext(fs.readFileSync('runtime/update-engine.js','utf8'),c);
function boot(){const u=c.createRebornUpdater({readJSON:key=>disk[key]||null,writeJSON:(key,value)=>disk[key]=JSON.parse(JSON.stringify(value)),readCore:key=>cores[key],writeCore:(key,code)=>cores[key]=code,sha256:sha,byteLength:code=>Buffer.byteLength(code),log:()=>{},evaluate:code=>loaded=code},embedded);u.boot();return u;}
let u=boot();u.ready();const requests=[];
u.check((url,cb)=>{requests.push(url);cb(200,url===embedded.feedUrl?JSON.stringify(manifest):payload);});
assert.equal(requests.length,2);assert.equal(requests[1],manifest.url);assert.equal(disk.state.pending.revision,manifest.revision);assert.equal(loaded,embeddedCode,'running hook stays unchanged until restart');
u=boot();assert.equal(loaded,payload);u.ready();assert.equal(disk.state.active.revision,manifest.revision);assert.equal(disk.state.pending,null);
console.log('PASS: actual prepared GitHub payload and manifest download, verify, stage and boot on an older APK loader');
