// Private, bounded diagnostics. No IL2CPP or Android UI is needed to write.
function createPortLog(io, redact) {
  const limit = 128 * 1024;
  function bytes(text) {
    let size = 0;
    for (const char of text) {
      const point = char.codePointAt(0);
      size += point < 128 ? 1 : point < 2048 ? 2 : point < 65536 ? 3 : 4;
    }
    return size;
  }
  let size = 0;
  let windowStarted = Date.now(), messages = 0;
  try { io.rotate(); } catch (_) {}
  return message => {
    try {
      const now = Date.now();
      if (now - windowStarted >= 1000) { windowStarted = now; messages = 0; }
      if (++messages > 80) return; // A repeated Unity warning must not saturate storage.
      // Never persist request bodies, even when the normal debug log has them.
      const safe = redact(String(message))
        .replace(/\bbody:\s*[\s\S]*/i, 'body: [omitted]')
        .replace(/(auto login as )[^\r\n]*/i, '$1[omitted]');
      const line = new Date().toISOString() + ' ' + safe.slice(0, 6000) + '\n';
      const length = bytes(line);
      if (size + length > limit) { io.rotate(); size = 0; }
      io.append(line); size += length;
    } catch (_) { /* Full/unavailable storage must never prevent playing. */ }
  };
}

function createNativePortLog(redact) {
  const libc = Process.getModuleByName('libc.so');
  const uid = new NativeFunction(libc.getExportByName('getuid'), 'uint', [])();
  const directory = `/data/user/${Math.floor(uid / 100000)}/com.bethsoft.theelderscrollslegends/files/tesl-reborn-logs`;
  const mkdir = new NativeFunction(libc.getExportByName('mkdir'), 'int', ['pointer','uint']);
  const rename = new NativeFunction(libc.getExportByName('rename'), 'int', ['pointer','pointer']);
  mkdir(Memory.allocUtf8String(directory), 0o700);
  const move = (from, to) => rename(Memory.allocUtf8String(directory + '/' + from), Memory.allocUtf8String(directory + '/' + to));
  return createPortLog({
    rotate() { move('previous.log','older.log'); move('current.log','previous.log'); },
    append(text) {
      const file = new File(directory + '/current.log', 'ab');
      try { file.write(text); file.flush(); } finally { file.close(); }
    }
  }, redact);
}
