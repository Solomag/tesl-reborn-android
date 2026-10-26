const { spawnSync } = require('node:child_process');
for (const name of ['native-ui-sprites', 'splash-version', 'deck-search', 'matching-friends', 'store-images', 'display-diagnostics', 'apk-download', 'updater', 'port-log', 'update-notices', 'resource-diagnostics', 'ota-release', 'loader-glue', 'chat-bounds', 'history', 'chat-scale', 'message-preview', 'release', 'resource-language', 'localized-language-state', 'mobile-debug', 'auth-and-logs', 'settings-data', 'settings-diagnostics']) {
  const result = spawnSync(process.execPath, [`tests/${name}.cjs`], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (require('node:fs').existsSync('resources/emojis/people.png')) {
  const result = spawnSync(process.execPath, ['tests/emoji-payload.cjs'], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
} else console.log('SKIP: emoji APK extraction fixture (run python3 tools/prepare_emojis.py to enable)');
const python = process.platform === 'win32' ? 'python' : 'python3';
const result = spawnSync(python, ['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status || 1);
