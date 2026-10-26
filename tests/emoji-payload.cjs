const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { transformSync } = require('esbuild');
const source = fs.readFileSync('hook.ts', 'utf8');
const start = source.indexOf('  section("payload from the apk",');
const end = source.indexOf('  // The path of the APK of the game', start);
const script = transformSync(source.slice(start, end), { loader: 'ts', target: 'es2020' }).code;
const disk = new Map(), log = [], copied = [];
const files = Object.fromEntries(['people.json', 'people.png'].map(name => [name, fs.readFileSync('resources/emojis/' + name)]));
const c = { section: (_, callback) => callback(), apkPath: () => '/game.apk', persistentPath: () => '/files',
  makeDirectory: () => {}, log: s => log.push(s),
  File: { readAllBytes: path => { if (!disk.has(path)) throw Error('missing'); return disk.get(path); } },
  Checksum: { compute: (_, bytes) => crypto.createHash('sha256').update(bytes).digest('hex') },
  ZipReader: class {
    valid(){return true;}close(){}
    find(path) { const name = path.split('/').at(-1); return files[name] ? { method: 0, size: files[name].length, name } : null; }
    list() { return []; }
    copy(entry, target) { copied.push(target); disk.set(target, files[entry.name]); }
  }
};
vm.createContext(c);vm.runInContext(script, c);
assert.equal(copied.length, 2, 'clean installation restores emojis even without a cache payload');
vm.runInContext(script, c);assert.equal(copied.length, 2, 'verified files are not overwritten');
disk.set('/files/tesl-reborn-emojis/people.png', Buffer.from('interrupted copy'));
vm.runInContext(script, c);assert.equal(copied.length, 3, 'an interrupted copy is repaired on the next launch');
assert.equal(disk.get('/files/tesl-reborn-emojis/people.png'), files['people.png']);
console.log('PASS: APK emoji extraction, no-cache installation, checksums, reuse and interrupted-copy repair');
