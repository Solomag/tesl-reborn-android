// The hook's source is hook/NN-name.ts, joined in name order into one
// script: the files share one scope (most of them run inside
// Il2Cpp.perform, opened by 10-perform-open.ts and closed by
// 99-perform-close.ts), so a function in one file can use any other's.
// Each file parses on its own; a new one goes where its number puts it.
const { readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const DIRECTORY = join(__dirname, '..', 'hook');

function hookFiles() {
  return readdirSync(DIRECTORY).filter(name => /^\d\d-[a-z0-9-]+\.ts$/.test(name)).sort();
}

function hookSource() {
  return hookFiles().map(name => readFileSync(join(DIRECTORY, name), 'utf8')).join('');
}

module.exports = hookSource;
module.exports.hookFiles = hookFiles;
module.exports.DIRECTORY = DIRECTORY;
