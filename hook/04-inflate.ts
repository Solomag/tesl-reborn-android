// Raw DEFLATE (RFC 1951) and a ZIP held in memory: enough to take files out
// of the official Reborn plugin archive on the phone (emojis, see
// EMOJI_SOURCE), without relying on a decompressor inside the game.
function inflateRaw(input: Uint8Array, expectedSize: number): Uint8Array {
  const out = new Uint8Array(expectedSize);
  let op = 0, ip = 0, bitBuf = 0, bitCnt = 0;
  const bits = (n: number) => {
    while (bitCnt < n) {
      if (ip >= input.length) throw Error("inflate: truncated data");
      bitBuf |= input[ip++] << bitCnt;
      bitCnt += 8;
    }
    const value = bitBuf & ((1 << n) - 1);
    bitBuf >>>= n;
    bitCnt -= n;
    return value;
  };
  // Canonical Huffman codes, decoded a bit at a time (tinf's method).
  const table = (lengths: ArrayLike<number>, n: number) => {
    const counts = new Uint16Array(16), offsets = new Uint16Array(16), symbols = new Uint16Array(n);
    for (let i = 0; i < n; i++) counts[lengths[i]]++;
    counts[0] = 0;
    for (let i = 1; i < 16; i++) offsets[i] = offsets[i - 1] + counts[i - 1];
    for (let i = 0; i < n; i++) if (lengths[i]) symbols[offsets[lengths[i]]++] = i;
    return { counts, symbols };
  };
  const decode = (t: { counts: Uint16Array; symbols: Uint16Array }) => {
    let code = 0, first = 0, index = 0;
    for (let len = 1; len < 16; len++) {
      code |= bits(1);
      const count = t.counts[len];
      if (code - first < count) return t.symbols[index + code - first];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    throw Error("inflate: bad code");
  };
  const LENGTH_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  let last = 0;
  while (!last) {
    last = bits(1);
    const type = bits(2);
    if (type === 0) {
      bitBuf = 0; bitCnt = 0;  // the rest of the current byte
      if (ip + 4 > input.length) throw Error("inflate: truncated block");
      const len = input[ip] | input[ip + 1] << 8, nlen = input[ip + 2] | input[ip + 3] << 8;
      if ((len ^ 0xffff) !== nlen) throw Error("inflate: bad stored block");
      ip += 4;
      if (ip + len > input.length || op + len > out.length) throw Error("inflate: stored block too long");
      out.set(input.subarray(ip, ip + len), op);
      ip += len; op += len;
      continue;
    }
    let lit, dist;
    if (type === 1) {
      const lengths = new Uint8Array(288);
      lengths.fill(8, 0, 144); lengths.fill(9, 144, 256); lengths.fill(7, 256, 280); lengths.fill(8, 280, 288);
      lit = table(lengths, 288);
      dist = table(new Uint8Array(30).fill(5), 30);
    } else if (type === 2) {
      const hlit = bits(5) + 257, hdist = bits(5) + 1, hclen = bits(4) + 4;
      const codeLengths = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) codeLengths[ORDER[i]] = bits(3);
      const codes = table(codeLengths, 19);
      const lengths = new Uint8Array(hlit + hdist);
      for (let i = 0; i < hlit + hdist;) {
        const symbol = decode(codes);
        if (symbol < 16) { lengths[i++] = symbol; continue; }
        let repeat, value = 0;
        if (symbol === 16) {
          if (!i) throw Error("inflate: repeat without a length");
          value = lengths[i - 1]; repeat = 3 + bits(2);
        } else repeat = symbol === 17 ? 3 + bits(3) : 11 + bits(7);
        if (i + repeat > lengths.length) throw Error("inflate: too many lengths");
        lengths.fill(value, i, i + repeat); i += repeat;
      }
      lit = table(lengths.subarray(0, hlit), hlit);
      dist = table(lengths.subarray(hlit), hdist);
    } else throw Error("inflate: bad block type");
    for (;;) {
      const symbol = decode(lit);
      if (symbol < 256) {
        if (op >= out.length) throw Error("inflate: output too long");
        out[op++] = symbol;
        continue;
      }
      if (symbol === 256) break;
      const index = symbol - 257;
      if (index >= 29) throw Error("inflate: bad length");
      const length = LENGTH_BASE[index] + bits(LENGTH_EXTRA[index]);
      const distSymbol = decode(dist);
      if (distSymbol >= 30) throw Error("inflate: bad distance");
      const distance = DIST_BASE[distSymbol] + bits(DIST_EXTRA[distSymbol]);
      if (distance > op) throw Error("inflate: distance before the start");
      if (op + length > out.length) throw Error("inflate: output too long");
      for (let i = 0; i < length; i++, op++) out[op] = out[op - distance];
    }
  }
  if (op !== out.length) throw Error(`inflate: ${op} bytes instead of ${out.length}`);
  return out;
}

// A whole ZIP in memory: the named file, stored or deflated, or null.
function zipEntry(zip: Uint8Array, name: string): Uint8Array | null {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 0x10016); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw Error("zip: no central directory");
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    if (at + 46 > zip.length || view.getUint32(at, true) !== 0x02014b50) throw Error("zip: bad central directory");
    const method = view.getUint16(at + 10, true), packed = view.getUint32(at + 20, true), size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true), extraLen = view.getUint16(at + 30, true), commentLen = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    let entryName = "";
    for (let k = 0; k < nameLen; k++) entryName += String.fromCharCode(zip[at + 46 + k]);
    at += 46 + nameLen + extraLen + commentLen;
    if (entryName !== name) continue;
    if (offset + 30 > zip.length || view.getUint32(offset, true) !== 0x04034b50) throw Error("zip: bad local header");
    const start = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
    if (start + packed > zip.length) throw Error("zip: entry past the end");
    const data = zip.subarray(start, start + packed);
    if (method === 0) {
      if (packed !== size) throw Error("zip: bad stored entry");
      return data.slice();
    }
    if (method === 8) return inflateRaw(data, size);
    throw Error(`zip: unsupported method ${method}`);
  }
  return null;
}
// END inflate
