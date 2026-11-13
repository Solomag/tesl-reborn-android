// The RDT module channel: the vendored ed25519 check against node:crypto,
// then the manifest and payload checks in the contract's order.
const assert = require('node:assert');
const crypto = require('node:crypto');
const verify = new Function(`${require('./source.cjs')('tweetnacl-verify')};return tweetnaclVerify;`)();
const { RDT, rdtCheckManifest, rdtCheckPayload } =
  new Function(`${require('./source.cjs')('rdt-channel')};return { RDT, rdtCheckManifest, rdtCheckPayload };`)();

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const keyHex = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
const payload = Buffer.from(`${RDT.marker}\n(() => { globalThis.teslPort.log("rdt hello"); })();\n`);
const sha256 = crypto.createHash('sha256').update(payload).digest('hex');
const sign = (hash, revision) => crypto.sign(null, Buffer.from(`${hash}:${revision}`), privateKey).toString('hex');
const manifest = { revision: 3, minCore: 290, bytes: payload.length, sha256, sig: sign(sha256, 3), url: 'https://example.invalid/rdt.js' };

assert.equal(rdtCheckManifest(manifest, keyHex, 0, 295, verify), '', 'a signed manifest passes');
assert.equal(rdtCheckManifest(manifest, keyHex, 3, 295, verify), '', 'the same revision may be fetched again');
assert.match(rdtCheckManifest({ ...manifest, revision: 4 }, keyHex, 0, 295, verify), /signature/, 'revision is covered by the signature');
assert.match(rdtCheckManifest({ ...manifest, sha256: '0'.repeat(64) }, keyHex, 0, 295, verify), /signature/, 'hash is covered by the signature');
const other = crypto.generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex');
assert.match(rdtCheckManifest(manifest, other, 0, 295, verify), /signature/, 'another key is refused');
assert.match(rdtCheckManifest(manifest, '', 0, 295, verify), /no release key/, 'no pinned key: nothing passes');
assert.match(rdtCheckManifest(manifest, keyHex, 5, 295, verify), /older/, 'no downgrade');
assert.match(rdtCheckManifest(manifest, keyHex, 0, 280, verify), /needs core/, 'minCore above this core');
assert.match(rdtCheckManifest({ ...manifest, url: 'http://x/rdt.js' }, keyHex, 0, 295, verify), /HTTPS/);
assert.match(rdtCheckManifest(null, keyHex, 0, 295, verify), /object/);

const hash = data => crypto.createHash('sha256').update(Buffer.from(data)).digest('hex');
const buffer = data => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
assert.equal(rdtCheckPayload(buffer(payload), manifest, hash), '');
assert.match(rdtCheckPayload(buffer(payload.subarray(1)), manifest, hash), /size/);
const changed = Buffer.from(payload); changed[changed.length - 2] ^= 1;
assert.match(rdtCheckPayload(buffer(changed), manifest, hash), /sha256/);
const unmarked = Buffer.from('x'.repeat(payload.length));
assert.match(rdtCheckPayload(buffer(unmarked), { ...manifest, sha256: hash(unmarked) }, hash), /not an RDT module/);

console.log('PASS: RDT channel checks the ed25519 signature, revision, core, size, hash and module marker');
