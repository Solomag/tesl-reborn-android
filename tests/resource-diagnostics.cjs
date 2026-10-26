const vm=require('node:vm'),assert=require('node:assert/strict'),{transformSync}=require('esbuild');
const source=require('./source.cjs');
let now=1000,index=0,hook;const reports=[];
const c={Date:class extends Date{static now(){return now;}},section:(_,fn)=>fn(),img:{},
 globalThis:null,resourceLanguage:()=> 'pl_pl',persistentPath:()=>'/files',schedule:(_,fn)=>fn(),
 Interceptor:{attach:(_,value)=>hook=value},writeTextFile:(path,value)=>reports.push(JSON.parse(value)),
 cls:(img,name)=>name==='AssetBundles.AssetBundleManager'?{fields:[
  {isStatic:true,name:'m_DownloadingBundles',type:{name:'Dictionary<System.String,Operation>'},value:{}},
  {isStatic:false,name:'unrelated',type:{name:'Dictionary'},value:{}}]}:{method:()=>({virtualAddress:'Update'})},
 call:(object,name)=>{
  if(name==='get_Count')return 20;
  if(name==='get_Keys'){index=0;return{};}
  if(name==='GetEnumerator')return{};
  if(name==='MoveNext')return ++index<=20;
  if(name==='get_Current')return {content:'bundle-'+index+'?token=do-not-copy'};
 }};
c.globalThis=c;c.TeslRebornUpdater={current:()=>({revision:37})};
vm.createContext(c);vm.runInContext(transformSync(source('resource-events')+source('resource-diagnostics'),{loader:'ts'}).code,c);
for(let i=0;i<150;i++)c.recordResourceEvent('http-Finished','https://example.test/asset?token=do-not-copy',200);
hook.onLeave();assert.equal(reports[0].events.length,128);assert.equal(reports[0].language,'pl_pl');
assert.equal(reports[0].bundles.length,1);assert.equal(reports[0].bundles[0].count,20);
assert.equal(reports[0].bundles[0].keys.length,12);
assert(!JSON.stringify(reports).includes('do-not-copy'));
hook.onLeave();assert.equal(reports.length,1,'snapshots are throttled');
now+=5001;hook.onLeave();assert.equal(reports.length,2);
now+=900001;c.recordResourceEvent('asset-request','too-late');hook.onLeave();
assert.equal(reports.length,2,'startup diagnostics stop after three minutes');
console.log('PASS: bounded startup trace and bundle keys, throttled snapshots, locale/patch identification and URL secret omission');

const shop={at:'shop-time',shopImages:[{path:'ShopWin/Product/Image/',sprite:null}],events:[{path:'Shop/image'},{path:'profile/fetch'}]};
const saved=c.rememberShopSnapshot(null,shop);
assert.equal(saved.images[0].sprite,null);assert.equal(saved.events.length,1);
assert.equal(c.rememberShopSnapshot(saved,{at:'later',shopImages:[{path:'MainMenuLandingWin/Left_Store_BTN/'}],events:[]}),saved);
assert.equal(c.rememberShopSnapshot(saved,{shopImages:[],events:[]}),saved);
console.log('PASS: missing shop images remain in the report after leaving the shop for Settings/Game Data');
