// Keep the already device-tested bridge snapshot while rebuilding our source.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { transformSync } from 'esbuild';
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const source = readFileSync('hook.ts', 'utf8');
const imports = source.match(/^import "frida-il2cpp-bridge";$/gm);
if (imports?.length !== 1) throw Error('Expected exactly one bridge import');
const code = transformSync(source.replace(/^import "frida-il2cpp-bridge";$/m, ''), {
  loader: 'ts', target: 'es2020', legalComments: 'inline'
}).code;
const core = '// TESL-REBORN-ANDROID-CORE v1\n' + readFileSync('runtime/il2cpp-bridge.js', 'utf8') + '\n// hook.ts\n' + code;
const old = JSON.parse(readFileSync('runtime/manifest.json', 'utf8'));
const meta = { ...old, sourceSha256: createHash('sha256').update(source).digest('hex'), bytes: Buffer.byteLength(core), sha256: createHash('sha256').update(core).digest('hex') };
writeFileSync('runtime/core.js', core);
writeFileSync('runtime/manifest.json', JSON.stringify(meta, null, 2) + '\n');
const glue = readFileSync('runtime/loader-glue.js', 'utf8');
const { feedUrl } = JSON.parse(readFileSync('runtime/channel.json', 'utf8'));
if (typeof feedUrl !== 'string' || feedUrl && !/^https:\/\/[a-z0-9.-]+\/[^\s?#\\]*$/i.test(feedUrl)) throw Error('Invalid HTTPS channel URL');
if (glue.split('__EMBEDDED_RELEASE__').length !== 2) throw Error('Invalid loader template');
const loader = readFileSync('runtime/update-engine.js', 'utf8') + '\n' + glue.replace('__EMBEDDED_RELEASE__', JSON.stringify({ meta, code: core, feedUrl }));
writeFileSync('hook.js', loader);
console.log(`Built core (${meta.bytes} bytes) and APK loader (${Buffer.byteLength(loader)} bytes); revision ${meta.revision}`);
