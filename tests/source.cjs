const { readFileSync } = require('node:fs');
module.exports = name => {
  const source = readFileSync('hook.ts', 'utf8');
  const start = `// BEGIN android-ui: ${name}\n`, end = `// END android-ui: ${name}`;
  const at = source.indexOf(start), to = source.indexOf(end, at);
  if (at < 0 || to < 0) throw Error(`Missing source section: ${name}`);
  return source.slice(at + start.length, to);
};
