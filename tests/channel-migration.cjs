const vm=require('vm'),assert=require('assert/strict'),{transformSync}=require('esbuild');
// The OTA rewrites only the old fork test feed, keeps every other setting,
// and leaves stable, custom, missing or broken configs untouched.
const c={};vm.createContext(c);vm.runInContext(transformSync(require('./source.cjs')('channel-migration'),{loader:'ts'}).code,c);
const fork='https://raw.githubusercontent.com/Solomag/tesl-reborn-android/android-ui-and-update-loader/updates/test/manifest.json';
const test='https://raw.githubusercontent.com/ssorgatem/tesl-reborn-android/android-ui-and-update-loader/updates/test/manifest.json';
const stable='https://raw.githubusercontent.com/ssorgatem/tesl-reborn-android/main/updates/stable/manifest.json';
const run=(text,ok=true)=>{let written=null;const result=c.migrateUpdateChannel({read:()=>text,write:t=>{written=t;return ok;}});return {result,written};};
let r=run(JSON.stringify({enabled:false,safeMode:false,allowLocalUpdates:false,feedUrl:fork}));
assert.equal(r.result,'migrated');assert.deepEqual(JSON.parse(r.written),{enabled:false,safeMode:false,allowLocalUpdates:false,feedUrl:test},'only the feed changes');
for(const feed of [test,stable,'https://example.test/custom.json'])assert.deepEqual(run(JSON.stringify({feedUrl:feed})),{result:'unchanged',written:null});
assert.deepEqual(run(''),{result:'unchanged',written:null});
assert.deepEqual(run('{broken'),{result:'unreadable',written:null});
assert.equal(run(JSON.stringify({feedUrl:fork}),false).result,'write-failed');
const channels=JSON.parse(require('fs').readFileSync('runtime/channel.json','utf8'));
assert.equal(channels.channels.test,test,'the migration target is the published test channel');
assert.equal(channels.channels.stable,stable);
console.log('PASS: the old fork test feed moves to the main repository test branch once; other settings and feeds stay');
