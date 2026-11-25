/* ============================================================
   PURE-JS GIF89a ENCODER (MEDIAN CUT + BAYER + LZW + NETSCAPE2.0)
   ============================================================ */
function buildMedianCutPalette(frames) {
  const sampleColors = [];
  const perFrameBudget = Math.max(800, Math.floor(18000 / Math.max(1, frames.length)));
  for (const f of frames) {
    const d = f.imageData.data, totalPx = f.width * f.height;
    const stride = Math.max(1, Math.floor(totalPx / perFrameBudget));
    for (let p = 0; p < totalPx; p += stride) {
      const i = p * 4;
      sampleColors.push((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    }
  }
  if (sampleColors.length === 0) sampleColors.push(0);

  function makeBox(arr) {
    let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
    for (let i = 0; i < arr.length; i++) {
      const c = arr[i], r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
      if (r < rMin) rMin = r; if (r > rMax) rMax = r;
      if (g < gMin) gMin = g; if (g > gMax) gMax = g;
      if (b < bMin) bMin = b; if (b > bMax) bMax = b;
    }
    const rSpan = rMax - rMin, gSpan = gMax - gMin, bSpan = bMax - bMin;
    const maxSpan = Math.max(rSpan, gSpan, bSpan);
    return { arr, maxSpan, axis: maxSpan === rSpan ? 0 : (maxSpan === gSpan ? 1 : 2) };
  }

  const boxes = [makeBox(sampleColors)];
  while (boxes.length < 256) {
    let bestIdx = -1, bestScore = 0;
    for (let i = 0; i < boxes.length; i++) {
      const bx = boxes[i];
      if (bx.arr.length < 2 || bx.maxSpan === 0) continue;
      const score = bx.maxSpan * Math.log2(bx.arr.length + 1);
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    if (bestIdx === -1) break;
    const bx = boxes.splice(bestIdx, 1)[0];
    const shift = bx.axis === 0 ? 16 : (bx.axis === 1 ? 8 : 0);
    bx.arr.sort((a, b) => ((a >> shift) & 255) - ((b >> shift) & 255));
    const mid = bx.arr.length >> 1;
    boxes.push(makeBox(bx.arr.slice(0, mid)));
    boxes.push(makeBox(bx.arr.slice(mid)));
  }

  const palette = new Uint8Array(256 * 3);
  for (let i = 0; i < boxes.length && i < 256; i++) {
    const arr = boxes[i].arr;
    let rs = 0, gs = 0, bs = 0;
    for (let k = 0; k < arr.length; k++) { const c = arr[k]; rs += (c >> 16) & 255; gs += (c >> 8) & 255; bs += c & 255; }
    const cnt = Math.max(1, arr.length);
    palette[i * 3] = Math.round(rs / cnt); palette[i * 3 + 1] = Math.round(gs / cnt); palette[i * 3 + 2] = Math.round(bs / cnt);
  }
  return { palette, colorCount: Math.min(256, boxes.length) };
}

function mapFrameToPalette(imageData, palette, colorCount, lut) {
  const w = imageData.width, h = imageData.height, d = imageData.data;
  const out = new Uint8Array(w * h);
  const bayer = [-6, 4, 2, -2];
  for (let y = 0; y < h; y++) {
    const bRow = (y & 1) << 1, rowOff = y * w;
    for (let x = 0; x < w; x++) {
      const p = rowOff + x, i = p * 4, dth = bayer[bRow | (x & 1)];
      const r = Math.max(0, Math.min(255, d[i] + dth));
      const g = Math.max(0, Math.min(255, d[i + 1] + dth));
      const b = Math.max(0, Math.min(255, d[i + 2] + dth));
      const key = ((r & 0xF8) << 7) | ((g & 0xF8) << 2) | (b >> 3);
      let idx = lut[key];
      if (idx === -1) {
        let best = 0, bestDist = 1e9;
        for (let c = 0; c < colorCount; c++) {
          const dr = r - palette[c * 3], dg = g - palette[c * 3 + 1], db = b - palette[c * 3 + 2];
          const dist = dr * dr + dg * dg + db * db;
          if (dist < bestDist) { bestDist = dist; best = c; if (dist === 0) break; }
        }
        lut[key] = best; idx = best;
      }
      out[p] = idx;
    }
  }
  return out;
}

function lzwEncodeGif(indices, minCodeSize) {
  const clearCode = 1 << minCodeSize, eoiCode = clearCode + 1;
  const MAX_TABLE = 4096, HASH_SIZE = 5003;
  const hashKeys = new Int32Array(HASH_SIZE), hashVals = new Int16Array(HASH_SIZE);
  hashKeys.fill(-1);

  const outBytes = [], block = new Uint8Array(255);
  let blockLen = 0, bitBuf = 0, bitCount = 0;

  function flushBlock() {
    if (blockLen > 0) {
      outBytes.push(blockLen);
      for (let i = 0; i < blockLen; i++) outBytes.push(block[i]);
      blockLen = 0;
    }
  }
  function emitByte(b) { block[blockLen++] = b & 0xFF; if (blockLen === 255) flushBlock(); }
  function emitCode(code, codeSize) {
    bitBuf |= (code << bitCount); bitCount += codeSize;
    while (bitCount >= 8) { emitByte(bitBuf & 0xFF); bitBuf >>= 8; bitCount -= 8; }
  }

  let codeSize = minCodeSize + 1, nextCode = eoiCode + 1;
  emitCode(clearCode, codeSize);

  if (indices.length > 0) {
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i], key = (prefix << 8) | k;
      let slot = ((key * 2654435761) >>> 0) % HASH_SIZE, found = -1;
      while (true) {
        const hk = hashKeys[slot];
        if (hk === -1) break;
        if (hk === key) { found = hashVals[slot]; break; }
        slot++; if (slot === HASH_SIZE) slot = 0;
      }
      if (found !== -1) { prefix = found; }
      else {
        emitCode(prefix, codeSize);
        if (nextCode < MAX_TABLE) {
          hashKeys[slot] = key; hashVals[slot] = nextCode++;
          if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
        } else {
          emitCode(clearCode, codeSize);
          hashKeys.fill(-1); codeSize = minCodeSize + 1; nextCode = eoiCode + 1;
        }
        prefix = k;
      }
    }
    emitCode(prefix, codeSize);
  }

  emitCode(eoiCode, codeSize);
  if (bitCount > 0) emitByte(bitBuf & 0xFF);
  flushBlock();
  outBytes.push(0x00);
  return outBytes;
}

export function encodeGif89a(frames, fps) {
  if (!frames || frames.length === 0) return new Uint8Array(0);
  const w = frames[0].width, h = frames[0].height;
  const delayCs = Math.max(2, Math.round(100 / Math.max(1, fps)));
  const { palette, colorCount } = buildMedianCutPalette(frames);
  const lut = new Int16Array(32768);
  lut.fill(-1);

  const chunks = [];
  const head = new Uint8Array(13);
  head[0] = 0x47; head[1] = 0x49; head[2] = 0x46; head[3] = 0x38; head[4] = 0x39; head[5] = 0x61;
  head[6] = w & 0xFF; head[7] = (w >> 8) & 0xFF; head[8] = h & 0xFF; head[9] = (h >> 8) & 0xFF;
  head[10] = 0xF7; head[11] = 0x00; head[12] = 0x00;
  chunks.push(head);
  chunks.push(palette);
  chunks.push(new Uint8Array([
    0x21, 0xFF, 0x0B, 0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30,
    0x03, 0x01, 0x00, 0x00, 0x00
  ]));

  for (let f = 0; f < frames.length; f++) {
    const indexed = mapFrameToPalette(frames[f].imageData, palette, colorCount, lut);
    chunks.push(new Uint8Array([0x21, 0xF9, 0x04, 0x04, delayCs & 0xFF, (delayCs >> 8) & 0xFF, 0x00, 0x00]));
    chunks.push(new Uint8Array([0x2C, 0x00, 0x00, 0x00, 0x00, w & 0xFF, (w >> 8) & 0xFF, h & 0xFF, (h >> 8) & 0xFF, 0x00, 0x08]));
    chunks.push(new Uint8Array(lzwEncodeGif(indexed, 8)));
  }
  chunks.push(new Uint8Array([0x3B]));

  let totalLen = 0;
  for (const c of chunks) totalLen += c.length;
  const out = new Uint8Array(totalLen);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}
