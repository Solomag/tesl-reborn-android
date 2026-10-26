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
