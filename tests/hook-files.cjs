// hook/NN-name.ts: each file parses on its own (so a cut never falls inside
// a statement, and an editor can read every file), and the joined source
// opens and closes Il2Cpp.perform exactly once, in its own small files.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { transformSync } = require('esbuild');
const source = require('../tools/hook-source.cjs');
const files = source.hookFiles();
assert(files.length > 10, 'hook/ has the source files');
const stray = fs.readdirSync(source.DIRECTORY).filter(name => !files.includes(name));
assert.deepEqual(stray, [], 'every file in hook/ is NN-name.ts, or it would be left out of the build');
const open = files.indexOf('10-perform-open.ts'), close = files.indexOf('99-perform-close.ts');
assert(open > 0 && close === files.length - 1, 'perform is opened after the top-level files and closed last');
for (const [i, name] of files.entries()) {
  if (i === open || i === close) continue;
  const text = fs.readFileSync(path.join(source.DIRECTORY, name), 'utf8');
  assert(text.endsWith('\n'), `${name} ends with a newline`);
  const probe = i > open ? `(() => {\n${text}\n})` : text.replace(/^import "frida-il2cpp-bridge";$/m, '');
  assert.doesNotThrow(() => transformSync(probe, { loader: 'ts' }), `${name} parses on its own`);
}
const joined = source();
assert.equal((joined.match(/^Il2Cpp\.perform\(\(\) => \{$/gm) || []).length, 1);
assert.equal((joined.match(/^import "frida-il2cpp-bridge";$/gm) || []).length, 1);
console.log(`PASS: ${files.length} hook source files parse on their own and join into one script`);
