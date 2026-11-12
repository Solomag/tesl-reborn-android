// The hook's own DEFLATE and in-memory ZIP reader (hook/04-inflate.ts)
// against Node's zlib: every level and strategy, stored blocks, a real ZIP,
// and damaged input that must fail instead of producing wrong bytes.
const assert = require('node:assert/strict'), vm = require('node:vm'), zlib = require('node:zlib');
const { transformSync } = require('esbuild');
const src = require('../tools/hook-source.cjs')();
const start = src.indexOf('function inflateRaw('), end = src.indexOf('// END inflate');
assert(start >= 0 && end > start, 'inflate source markers');
const context = {}; vm.createContext(context);
vm.runInContext(transformSync(src.slice(start, end), { loader: 'ts' }).code, context);
const { inflateRaw, zipEntry } = context;

let seed = 7;
const random = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32;
const samples = [
  Buffer.alloc(0),
  Buffer.from('a'),
  Buffer.from('hello hello hello hello hello hello'),
  Buffer.alloc(100000, 0x41),                                         // long runs: lengths up to 258
  Buffer.from(Array.from({ length: 70000 }, () => Math.floor(random() * 256))),  // incompressible: stored
  Buffer.from(Array.from({ length: 200000 }, (_, i) => 'abcdefghij'.charCodeAt(Math.floor(random() * 10)) ^ (i % 97 === 0 ? 1 : 0))),
  Buffer.from(JSON.stringify(Array.from({ length: 3000 }, (_, i) => ({ Name: 'emoji_' + i, Row: i % 40, Column: i % 7 })))),
];
for (const sample of samples) {
  for (const level of [0, 1, 6, 9]) {
    for (const strategy of [zlib.constants.Z_DEFAULT_STRATEGY, zlib.constants.Z_FIXED, zlib.constants.Z_HUFFMAN_ONLY, zlib.constants.Z_RLE]) {
      const packed = zlib.deflateRawSync(sample, { level, strategy });
      const out = inflateRaw(new Uint8Array(packed), sample.length);
      assert(Buffer.from(out).equals(sample), `level ${level} strategy ${strategy} size ${sample.length}`);
    }
  }
}
console.log('PASS: inflate matches zlib for every level and strategy, stored, fixed and dynamic blocks');

const sample = samples[6], packed = zlib.deflateRawSync(sample);
assert.throws(() => inflateRaw(new Uint8Array(packed.subarray(0, packed.length - 5)), sample.length), /inflate/, 'truncated');
assert.throws(() => inflateRaw(new Uint8Array(packed), sample.length - 1), /inflate/, 'more output than announced');
assert.throws(() => inflateRaw(new Uint8Array(packed), sample.length + 1), /inflate/, 'less output than announced');
console.log('PASS: damaged or mislabelled DEFLATE data fails');

// A ZIP built by hand: one stored and one deflated file.
function zip(files) {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, data, method] of files) {
    const body = method === 8 ? zlib.deflateRawSync(data) : data, n = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, n, body); centrals.push(central, n); offset += 30 + n.length + body.length;
  }
  const dir = Buffer.concat(centrals), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(dir.length, 12); eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, dir, eocd]));
}
const archive = zip([['a/stored.txt', Buffer.from('plain'), 0], ['a/b/people.json', sample, 8]]);
assert.equal(Buffer.from(zipEntry(archive, 'a/stored.txt')).toString(), 'plain');
assert(Buffer.from(zipEntry(archive, 'a/b/people.json')).equals(sample));
assert.equal(zipEntry(archive, 'missing'), null);
assert.throws(() => zipEntry(archive.subarray(0, 40), 'a/stored.txt'), /zip/);
console.log('PASS: files come out of an in-memory ZIP, stored or deflated');
