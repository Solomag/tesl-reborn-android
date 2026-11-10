const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const code = fs.readFileSync('runtime/core.js', 'utf8');
const meta = JSON.parse(fs.readFileSync('runtime/manifest.json', 'utf8'));
assert.equal(Buffer.byteLength(code), meta.bytes);
assert.equal(crypto.createHash('sha256').update(code).digest('hex'), meta.sha256);
assert(code.startsWith('// TESL-REBORN-ANDROID-CORE v1\n'));
new vm.Script(code);
new vm.Script(fs.readFileSync('hook.js', 'utf8'));
// Verify the actual generated loader, not just the templates, embeds this core.
const loader = fs.readFileSync('hook.js', 'utf8');
const matches = loader.match(/const embedded = (.*);\n  const packageName/);
assert(matches);
const embedded = JSON.parse(matches[1]);
assert.equal(embedded.code, code);
assert.deepEqual(embedded.meta, meta);
assert.equal(embedded.feedUrl, JSON.parse(fs.readFileSync('runtime/channel.json', 'utf8')).feedUrl);
console.log('PASS: generated loader embeds the current core, metadata, channel and SHA-256');
// hook.ts edited without npm run build would ship an old core under a new commit.
assert.equal(crypto.createHash('sha256').update(fs.readFileSync('hook.ts')).digest('hex'), meta.sourceSha256,
  'runtime/core.js is stale: run npm run build');
// The APK level the hook expects must be the one the Java side writes.
const javaLevel = fs.readFileSync('android-setup/src/org/teslreborn/setup/ApkLevel.java', 'utf8').match(/LEVEL\s*=\s*(\d+)/);
const hookLevel = fs.readFileSync('hook.ts', 'utf8').match(/const APK_LEVEL\s*=\s*(\d+)/);
assert(javaLevel && hookLevel);
assert.equal(hookLevel[1], javaLevel[1], 'ApkLevel.LEVEL and APK_LEVEL in hook.ts differ');
console.log('PASS: core built from the current hook.ts; APK level matches the Java side');
