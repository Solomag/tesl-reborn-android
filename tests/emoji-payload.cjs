// Emojis on the phone: from the APK when it carries these exact files,
// otherwise from the official Reborn plugin archive, every file verified.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto'), zlib = require('node:zlib');
const { transformSync } = require('esbuild');
const source = require('../tools/hook-source.cjs')();
const cut = (from, to) => { const i = source.indexOf(from), j = source.indexOf(to, i); assert(i >= 0 && j > i, 'marker ' + from); return source.slice(i, j); };
const helpers = transformSync(cut('  const emojiDirectory =', '  section("payload from the apk",'), { loader: 'ts', target: 'es2020' }).code;
const script = transformSync(cut('  section("payload from the apk",', '  // The path of the APK of the game'), { loader: 'ts', target: 'es2020' }).code;
const inflate = transformSync(cut('function inflateRaw(', '// END inflate'), { loader: 'ts', target: 'es2020' }).code;
const constants = transformSync(cut('const EMOJI_SOURCE =', '\nlet androidLogWrite'), { loader: 'ts', target: 'es2020' }).code;
const sha = bytes => crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex');
const files = Object.fromEntries(['people.json', 'people.png'].map(name => [name, fs.readFileSync('resources/emojis/' + name)]));

// The pinned hashes are the files the Builder extracts (tools/prepare_emojis.py).
const pinned = {}; vm.createContext(pinned); vm.runInContext(constants.replace(/^const /gm, 'var '), pinned);
const builder = fs.readFileSync('tools/prepare_emojis.py', 'utf8');
for (const [name, hash] of Object.entries(pinned.EMOJI_FILES)) {
  assert.equal(sha(files[name]), hash, name + ' in resources/emojis');
  assert(builder.includes(`'${name}': '${hash}'`), name + ': the Builder pins the same file');
}
assert(builder.includes(`URL = '${pinned.EMOJI_SOURCE.url}'`), 'the Builder and the phone use the same plugin release');

function plugin(entries) {  // a plugin ZIP with deflated entries
  const locals = [], centrals = []; let offset = 0;
  for (const [name, data] of entries) {
    const body = zlib.deflateRawSync(data), n = Buffer.from(name);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10);
    central.writeUInt32LE(body.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(n.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, n, body); centrals.push(central, n); offset += 30 + n.length + body.length;
  }
  const dir = Buffer.concat(centrals), eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(dir.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, eocd]);
}
const folder = pinned.EMOJI_SOURCE.folder;
const archive = plugin(Object.entries(files).map(([name, data]) => [folder + name, data]));

function phone({ apk = files, download = archive, clock = 1e12 } = {}) {
  const disk = new Map(), log = [], copied = [], requests = [];
  const c = {
    EMOJI_FILES: pinned.EMOJI_FILES, EMOJI_SOURCE: { ...pinned.EMOJI_SOURCE, sha256: sha(archive) },
    Date: { now: () => clock }, setTimeout: f => f(), emojiInitAttempted: true,
    section: (_, callback) => callback(), schedule: (_, f) => f(), apkPath: () => '/game.apk', persistentPath: () => '/files',
    makeDirectory: () => {}, log: s => log.push(s),
    readTextFile: p => disk.has(p) ? String(disk.get(p)) : '', writeTextFile: (p, s) => { disk.set(p, s); return true; },
    atomicRename: (a, b) => { disk.set(b, disk.get(a)); disk.delete(a); return true; },
    httpGetBytes: (url, cb) => { requests.push(url); cb(download ? 200 : -1, download ? new Uint8Array(download).buffer : null); },
    Checksum: { compute: (_, bytes) => sha(bytes) },
    File: class {
      static readAllBytes(path) { if (!disk.has(path)) throw Error('missing'); return disk.get(path); }
      constructor(path) { this.path = path; this.parts = []; }
      write(bytes) { this.parts.push(Buffer.from(bytes)); } flush() {} close() { disk.set(this.path, Buffer.concat(this.parts)); }
    },
    ZipReader: class {
      valid() { return true; } close() {}
      find(path) { const name = path.split('/').at(-1); return apk[name] ? { method: 0, size: apk[name].length, name } : null; }
      list() { return []; }
      copy(entry, target) { copied.push(target); disk.set(target, apk[entry.name]); }
    },
  };
  vm.createContext(c); vm.runInContext(inflate + helpers.replace(/^const /gm, 'var ') + script, c);
  return { c, disk, log, copied, requests, run: () => vm.runInContext(script, c) };
}

// From the APK.
let p = phone();
assert.equal(p.copied.length, 2, 'clean installation restores emojis from the APK');
assert.equal(p.requests.length, 0, 'no download when the APK has them');
p.run(); assert.equal(p.copied.length, 2, 'verified files are not overwritten');
p.disk.set('/files/tesl-reborn-emojis/people.png', Buffer.from('interrupted copy'));
p.run(); assert.equal(p.copied.length, 3, 'an interrupted copy is repaired on the next launch');
assert(p.disk.get('/files/tesl-reborn-emojis/people.png').equals(files['people.png']));
console.log('PASS: APK emoji extraction, no-cache installation, checksums, reuse and interrupted-copy repair');

// An APK from an older plugin, or none: the plugin archive.
p = phone({ apk: { 'people.json': Buffer.from('{"old":1}'), 'people.png': Buffer.from('old atlas') } });
assert.equal(p.requests.length, 1, 'another version in the APK: download');
for (const [name, data] of Object.entries(files)) assert(Buffer.from(p.disk.get('/files/tesl-reborn-emojis/' + name)).equals(data), name + ' from the archive');
assert.equal(p.c.emojiInitAttempted, false, 'the chat loads the new atlas on its next use');
p.run(); assert.equal(p.requests.length, 1, 'installed: no second download');
console.log('PASS: emojis an APK lacks come from the plugin archive and are verified');

p = phone({ apk: {}, download: plugin([[folder + 'people.json', files['people.json']], [folder + 'people.png', Buffer.from('changed')]]) });
assert(!p.disk.has('/files/tesl-reborn-emojis/people.png'), 'an archive that is not the pinned release writes nothing');
assert(p.log.some(line => /not the expected plugin release/.test(line)));
p = phone({ apk: {}, download: null });
assert(p.log.some(line => /download failed/.test(line)), 'offline: logged');
p.run(); assert.equal(p.requests.length, 1, 'at most one attempt an hour');
console.log('PASS: a wrong archive writes nothing; offline retries wait an hour');
