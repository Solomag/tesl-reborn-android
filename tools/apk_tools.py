"""ZIP32 APK repacker: preserves existing entry offsets and resource payloads."""
import os
import shutil
import struct
import zipfile
HOOK_ENTRY = 'lib/arm64-v8a/libhook.js.so'
ZIP32_MAX = (1 << 32) - 1

def verify_classic_zip(path):
    """APK signing needs actual ZIP32 offsets, not ZIP64 sentinel values."""
    with path.open('rb') as f:
        size = f.seek(0, os.SEEK_END)
        f.seek(max(0, size - (65535 + 22 + 20)))
        tail = f.read()
    position = len(tail)
    while True:
        position = tail.rfind(b'PK\x05\x06', 0, position)
        if position < 0:
            raise ValueError('No valid ZIP end record')
        if position + 22 <= len(tail):
            record = struct.unpack_from('<4s4H2IH', tail, position)
            if position + 22 + record[7] == len(tail):
                break
    if record[1] or record[2] or record[3] != record[4]:
        raise ValueError('Multi-volume ZIP is not supported')
    if record[3] == 65535 or record[5] == ZIP32_MAX or record[6] == ZIP32_MAX:
        raise ValueError('ZIP64 sentinel in APK end record; APK must remain ZIP32')
    if position >= 20 and tail[position - 20:position - 16] == b'PK\x06\x07':
        raise ValueError('ZIP64 locator in APK')
    eocd_offset = size - len(tail) + position
    if record[6] + record[5] != eocd_offset:
        raise ValueError('Invalid ZIP32 central directory extent')
    return record[6]


def repack(source, output, hook, resources=None):
    if source.resolve() == output.resolve():
        raise ValueError('Input and output APK must be different files')
    replacements = {HOOK_ENTRY: hook, **(resources or {})}
    if any(not name.startswith('assets/tesl-reborn/emojis/') for name in (resources or {})):
        raise ValueError('Only emoji resource replacements are supported')
    keep = lambda info: info.filename not in replacements and not info.filename.startswith('META-INF/')
    verify_classic_zip(source)
    if source.stat().st_size + sum(map(len, replacements.values())) + 1024**2 >= ZIP32_MAX:
        raise ValueError('APK would approach or exceed the ZIP32 4 GiB limit')
    partial = output.with_name(output.name + '.partial')
    partial.unlink(missing_ok=True)
    if shutil.disk_usage(output.parent).free < source.stat().st_size + 256 * 1024**2:
        raise ValueError('Insufficient destination space: need source APK size plus 256 MiB')
    try:
        print(f'Copying source APK ({source.stat().st_size / 1e6:.1f} MB)...', flush=True)
        shutil.copyfile(source, partial)
        with zipfile.ZipFile(source) as original:
            expected = {
                i.filename: (i.header_offset, i.CRC, i.file_size, i.compress_size, i.compress_type)
                for i in original.infolist() if keep(i)
            }
        # Append at the old central directory, keeping all existing data offsets.
        # Old hook data becomes unreferenced; its central entry is replaced once.
        # CPython defaults to ZIP64 already at 2 GiB, despite ZIP32 offsets
        # supporting unsigned 32-bit values. APK signers need the latter.
        previous_limit = zipfile.ZIP64_LIMIT
        try:
            zipfile.ZIP64_LIMIT = ZIP32_MAX
            with zipfile.ZipFile(partial, 'a', allowZip64=False) as z:
                z.filelist = [i for i in z.filelist if keep(i)]
                z.NameToInfo = {i.filename: i for i in z.filelist}
                for name, content in replacements.items():
                    info = zipfile.ZipInfo(name, (2026, 10, 24, 0, 0, 0))
                    info.compress_type = zipfile.ZIP_DEFLATED if name == HOOK_ENTRY else zipfile.ZIP_STORED
                    info.external_attr = 0o100644 << 16
                    z.writestr(info, content)
        finally:
            zipfile.ZIP64_LIMIT = previous_limit
        central_directory = verify_classic_zip(partial)
        print(f'ZIP32_OK: central directory offset {central_directory}', flush=True)
        with partial.open('r+b') as f:
            os.fsync(f.fileno())
        print('Verifying archive CRCs and preserved entry offsets...', flush=True)
        with zipfile.ZipFile(partial) as z:
            for name, content in replacements.items():
                if sum(i.filename == name for i in z.infolist()) != 1:
                    raise ValueError('Duplicate replacement entries in output')
                if z.read(name) != content:
                    raise ValueError('Output replacement verification failed')
            actual = {
                i.filename: (i.header_offset, i.CRC, i.file_size, i.compress_size, i.compress_type)
                for i in z.infolist() if keep(i)
            }
            if actual != expected:
                raise ValueError('Existing APK entries or alignment changed unexpectedly')
            bad = z.testzip()
            if bad:
                raise ValueError(f'Corrupt ZIP entry: {bad}')
        os.replace(partial, output)
        if hasattr(os, 'sync'):
            os.sync()
    except BaseException:
        partial.unlink(missing_ok=True)
        raise
