const vm = require('vm'), assert = require('assert/strict'), { transformSync } = require('esbuild');
// A release file on raw.githubusercontent.com is also fetched from jsDelivr
// (GitHub is cut off in mainland China); other URLs are never rewritten.
function load() {
  const c = {};
  vm.createContext(c);
  vm.runInContext(transformSync(require('./source.cjs')('update-mirror') + '\nthis.mirrorUrls = mirrorUrls; this.withMirrors = withMirrors;', { loader: 'ts' }).code, c);
  return c;
}
const feed = 'https://raw.githubusercontent.com/Solomag/tesl-reborn-android/android-ui-and-update-loader/updates/test/manifest.json';
let c = load();
assert.deepEqual([...c.mirrorUrls(feed)], [
  'https://cdn.jsdelivr.net/gh/Solomag/tesl-reborn-android@android-ui-and-update-loader/updates/test/manifest.json',
  'https://fastly.jsdelivr.net/gh/Solomag/tesl-reborn-android@android-ui-and-update-loader/updates/test/manifest.json',
  'https://gcore.jsdelivr.net/gh/Solomag/tesl-reborn-android@android-ui-and-update-loader/updates/test/manifest.json',
]);
assert.equal(c.mirrorUrls('https://raw.githubusercontent.com/Solomag/RDT-Android/main/release/rdt-12.js')[0], 'https://cdn.jsdelivr.net/gh/Solomag/RDT-Android@main/release/rdt-12.js');
for (const url of ['https://example.test/manifest.json', 'http://raw.githubusercontent.com/a/b/c/d.json', 'https://raw.githubusercontent.com/a/b/c/../d.json',
  'https://raw.githubusercontent.com/a/b/c/d.json?x=1', 'https://raw.githubusercontent.com/a/b/c', 'https://raw.githubusercontent.com.evil.test/a/b/c/d.json'])
  assert.deepEqual([...c.mirrorUrls(url)], [], url);

// Fake network: each URL answers with a fixed result; the calls are recorded.
function net(answers) {
  const calls = [];
  return { calls, get: (url, cb) => { calls.push(url); const a = answers[url] || [-1, '']; cb(a[0], a[1]); } };
}
const mirrors = c.mirrorUrls(feed);
const run = (get, url = feed) => { let out = null; const notes = []; c.withMirrors(get, m => notes.push(m))(url, (s, b) => { out = [s, b]; }); return { out, notes }; };

// GitHub works: one request, no mirror.
let n = net({ [feed]: [200, 'gh'] });
assert.deepEqual(run(n.get).out, [200, 'gh']); assert.deepEqual(n.calls, [feed]);
// GitHub fails: the first mirror answers; later requests go to mirrors first.
n = net({ [mirrors[0]]: [200, 'cdn'] });
let r = run(n.get);
assert.deepEqual(r.out, [200, 'cdn']); assert.deepEqual(n.calls, [feed, mirrors[0]]);
assert.equal(r.notes.length, 2, 'the switch and the mirror are logged');
n = net({ [mirrors[0]]: [200, 'cdn'], [feed]: [200, 'gh'] });
assert.deepEqual(run(n.get).out, [200, 'cdn']); assert.deepEqual(n.calls, [mirrors[0]], 'mirrors first after a GitHub failure');
// Everything fails: GitHub's own failure is reported, after every host was tried.
c = load();
n = net({ [feed]: [404, 'gone'], [mirrors[0]]: [503, ''] });
assert.deepEqual(run(n.get).out, [404, 'gone']); assert.deepEqual(n.calls, [feed, ...mirrors]);
// A cached answer counts; an empty body does not.
c = load();
n = net({ [feed]: [200, ''], [mirrors[1]]: [304, 'cached'] });
assert.deepEqual(run(n.get).out, [304, 'cached']); assert.deepEqual(n.calls, [feed, mirrors[0], mirrors[1]]);
// Other hosts: one request, no mirrors, and GitHub is not marked as failed.
c = load();
n = net({});
assert.deepEqual(run(n.get, 'https://example.test/m.json').out, [-1, '']); assert.deepEqual(n.calls, ['https://example.test/m.json']);
n = net({ [feed]: [200, 'gh'] });
assert.deepEqual(run(n.get).out, [200, 'gh']); assert.deepEqual(n.calls, [feed]);
console.log('PASS: GitHub release files fall back to jsDelivr mirrors; other URLs are never rewritten');
