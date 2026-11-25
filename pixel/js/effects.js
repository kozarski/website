import { GRID_SIZE, GRID_EFFECTS } from './constants.js';

/* ============================================================
   SEQUENTIAL 7-EFFECT CHAIN + 6 SPATIAL GRID EFFECTS (FIXED)
   ============================================================ */
export function applyClassicEffects(imageData, params) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const len = data.length;

  // 1. Bit Shift
  const bitShiftAmount = params.bitShift | 0;
  if (bitShiftAmount > 0) {
    const t = bitShiftAmount / 100;
    const invT = 1 - t;
    const shiftR = 1 + (bitShiftAmount % 7);
    const shiftG = 1 + ((bitShiftAmount + 2) % 7);
    const shiftB = 1 + ((bitShiftAmount + 4) % 7);
    for (let i = 0; i < len; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const sr = ((r << shiftR) | (r >>> (8 - shiftR))) & 0xFF;
      const sg = ((g << shiftG) | (g >>> (8 - shiftG))) & 0xFF;
      const sb = ((b << shiftB) | (b >>> (8 - shiftB))) & 0xFF;
      data[i]     = (r * invT + sr * t) | 0;
      data[i + 1] = (g * invT + sg * t) | 0;
      data[i + 2] = (b * invT + sb * t) | 0;
    }
  }

  // 2. Data Offset
  const dataOffsetVal = params.dataOffset | 0;
  if (dataOffsetVal > 0) {
    const src = new Uint8ClampedArray(data);
    const pixelCount = width * height;
    const shiftPixels = Math.floor((dataOffsetVal / 100) * pixelCount * 0.35);
    const bandHeight = Math.max(8, Math.floor(height / 14));
    for (let y = 0; y < height; y++) {
      const bandIdx = Math.floor(y / bandHeight);
      const bandShear = ((bandIdx % 3 === 0 ? 1 : -1) * Math.floor(dataOffsetVal * 1.4 * ((bandIdx * 37) % 7 + 1) / 7));
      const rowBase = y * width;
      for (let x = 0; x < width; x++) {
        const dstPx = rowBase + x;
        let srcPx = (dstPx + shiftPixels + bandShear) % pixelCount;
        if (srcPx < 0) srcPx += pixelCount;
        const di = dstPx * 4, si = srcPx * 4;
        data[di] = src[si]; data[di + 1] = src[si + 1]; data[di + 2] = src[si + 2]; data[di + 3] = 255;
      }
    }
  }

  // 3. RGB Split (reads live working data)
  const rgbAmount = params.rgbSplit | 0;
  if (rgbAmount > 0) {
    const src = new Uint8ClampedArray(data);
    const yShift = Math.max(1, Math.round(rgbAmount * (height / 500)));
    const xShift = Math.round(rgbAmount * 0.45);
    for (let y = 0; y < height; y++) {
      const rY = Math.max(0, y - yShift), bY = Math.min(height - 1, y + yShift);
      const rowOff = y * width, rRowOff = rY * width, bRowOff = bY * width;
      for (let x = 0; x < width; x++) {
        const rX = Math.max(0, x - xShift), bX = Math.min(width - 1, x + xShift);
        const di = (rowOff + x) * 4;
        data[di]     = src[(rRowOff + rX) * 4];
        data[di + 1] = src[di + 1];
        data[di + 2] = src[(bRowOff + bX) * 4 + 2];
      }
    }
  }

  // 4. Scanlines (chains on live working data and scales genuinely with intensity)
  const scanlineIntensity = params.scanlines | 0;
  if (scanlineIntensity > 0) {
    const intensity = scanlineIntensity / 100;
    const src = new Uint8ClampedArray(data);
    const darkMod = 1 - (0.78 * intensity);
    const lightMod = 1 + (0.12 * intensity);
    const maxJitter = intensity * 12;
    for (let y = 0; y < height; y++) {
      const isDarkLine = (y % 4) >= 2;
      const mod = isDarkLine ? darkMod : lightMod;
      const jitter = isDarkLine ? Math.round(Math.sin(y * 0.41) * maxJitter) : 0;
      const rowOff = y * width * 4;
      for (let x = 0; x < width; x++) {
        let sx = x + jitter;
        if (sx < 0) sx = 0; else if (sx >= width) sx = width - 1;
        const di = rowOff + x * 4, si = rowOff + sx * 4;
        data[di]     = Math.min(255, src[si] * mod);
        data[di + 1] = Math.min(255, src[si + 1] * mod);
        data[di + 2] = Math.min(255, src[si + 2] * mod);
      }
    }
  }

  // 5. Path Sort (scales genuinely with intensity)
  const pathSortVal = params.pathSort | 0;
  if (pathSortVal > 0) {
    const intensity = pathSortVal / 100;
    const spanLen = Math.max(4, Math.round(4 + intensity * 68));
    const blend = 0.25 + 0.75 * intensity, invBlend = 1 - blend;
    const idxBuf = new Int32Array(spanLen), lumBuf = new Uint8Array(spanLen), tmpPix = new Uint8Array(spanLen * 4);
    for (let y = 0; y < height; y++) {
      const drift = Math.floor(Math.sin(y * 0.055) * spanLen * 0.45 * intensity);
      const rowOff = y * width * 4;
      for (let bx = 0; bx < width; bx += spanLen) {
        const startX = Math.max(0, Math.min(width - 1, bx + drift));
        const count = Math.min(spanLen, width - startX);
        if (count < 2) continue;
        for (let k = 0; k < count; k++) {
          const pi = rowOff + (startX + k) * 4;
          lumBuf[k] = (data[pi] * 77 + data[pi + 1] * 150 + data[pi + 2] * 29) >> 8;
          idxBuf[k] = k;
        }
        for (let i = 1; i < count; i++) {
          const keyIdx = idxBuf[i], keyLum = lumBuf[keyIdx];
          let j = i - 1;
          while (j >= 0 && lumBuf[idxBuf[j]] > keyLum) { idxBuf[j + 1] = idxBuf[j]; j--; }
          idxBuf[j + 1] = keyIdx;
        }
        for (let k = 0; k < count; k++) {
          const si = rowOff + (startX + idxBuf[k]) * 4, ti = k * 4;
          tmpPix[ti] = data[si]; tmpPix[ti + 1] = data[si + 1]; tmpPix[ti + 2] = data[si + 2];
        }
        for (let k = 0; k < count; k++) {
          const di = rowOff + (startX + k) * 4, ti = k * 4;
          data[di]     = (data[di] * invBlend + tmpPix[ti] * blend) | 0;
          data[di + 1] = (data[di + 1] * invBlend + tmpPix[ti + 1] * blend) | 0;
          data[di + 2] = (data[di + 2] * invBlend + tmpPix[ti + 2] * blend) | 0;
        }
      }
    }
  }

  // 6. Seed Growth
  const seedAmount = params.seedGrowth | 0;
  if (seedAmount > 0) {
    const src = new Uint8ClampedArray(data);
    const radius = Math.max(2, Math.floor(seedAmount / 9) + 2);
    const threshold = Math.round(235 - seedAmount * 0.72);
    const step = Math.max(6, Math.round(14 - seedAmount * 0.06));
    const seeds = [];
    for (let y = 0; y < height; y += step) {
      const rowOff = y * width * 4;
      for (let x = 0; x < width; x += step) {
        const i = rowOff + x * 4;
        if ((src[i] + src[i + 1] + src[i + 2]) / 3 >= threshold) {
          seeds.push(x, y);
          if (seeds.length >= 1400) break;
        }
      }
      if (seeds.length >= 1400) break;
    }
    const rSq = radius * radius;
    for (let s = 0; s < seeds.length; s += 2) {
      const sx = seeds[s], sy = seeds[s + 1];
      const si = (sy * width + sx) * 4;
      const sr = src[si], sg = src[si + 1], sb = src[si + 2];
      const y0 = Math.max(0, sy - radius), y1 = Math.min(height - 1, sy + radius);
      const x0 = Math.max(0, sx - radius), x1 = Math.min(width - 1, sx + radius);
      for (let y = y0; y <= y1; y++) {
        const dy = y - sy, dy2 = dy * dy, rowOff = y * width * 4;
        for (let x = x0; x <= x1; x++) {
          const dx = x - sx, d2 = dx * dx + dy2;
          if (d2 <= rSq) {
            const inf = (1 - Math.sqrt(d2) / radius) * 0.78, inv = 1 - inf;
            const di = rowOff + x * 4;
            data[di]     = Math.min(255, data[di] * inv + sr * inf);
            data[di + 1] = Math.min(255, data[di + 1] * inv + sg * inf);
            data[di + 2] = Math.min(255, data[di + 2] * inv + sb * inf);
          }
        }
      }
    }
  }

  // 7. Pixel Sort (O(N) counting sort)
  const sortThreshold = params.pixelSort | 0;
  if (sortThreshold > 0) {
    const rowLum = new Uint8Array(width), counts = new Int32Array(256), tempRow = new Uint8Array(width * 4);
    for (let y = 0; y < height; y++) {
      const rowOff = y * width * 4;
      for (let x = 0; x < width; x++) {
        const i = rowOff + x * 4;
        rowLum[x] = (data[i] + data[i + 1] + data[i + 2]) / 3;
      }
      let start = 0;
      for (let x = 0; x <= width; x++) {
        if (x === width || rowLum[x] >= sortThreshold) {
          const segLen = x - start;
          if (segLen > 1) {
            counts.fill(0);
            for (let k = start; k < x; k++) counts[rowLum[k]]++;
            let sum = 0;
            for (let b = 0; b < 256; b++) { const c = counts[b]; counts[b] = sum; sum += c; }
            for (let k = start; k < x; k++) {
              const pos = counts[rowLum[k]]++;
              const si = rowOff + k * 4, ti = pos * 4;
              tempRow[ti] = data[si]; tempRow[ti + 1] = data[si + 1]; tempRow[ti + 2] = data[si + 2];
            }
            for (let k = 0; k < segLen; k++) {
              const di = rowOff + (start + k) * 4, ti = k * 4;
              data[di] = tempRow[ti]; data[di + 1] = tempRow[ti + 1]; data[di + 2] = tempRow[ti + 2];
            }
          }
          start = x + 1;
        }
      }
    }
  }
}

export function applySpatialGridEffects(imageData, gridStates, timePhase) {
  const cellW = imageData.width / GRID_SIZE, cellH = imageData.height / GRID_SIZE;
  const t = typeof timePhase === 'number' ? timePhase : 1.75;
  for (const fx of GRID_EFFECTS) {
    const cells = gridStates[fx.key];
    if (!cells) continue;
    for (let i = 0; i < 9; i++) {
      if (!cells[i]) continue;
      const gx = Math.floor((i % GRID_SIZE) * cellW), gy = Math.floor(Math.floor(i / GRID_SIZE) * cellH);
      const cw = Math.floor(cellW), ch = Math.floor(cellH);
      const cx = gx + cw * 0.5, cy = gy + ch * 0.5;
      switch (fx.key) {
        case 'pixelflow': applyPixelFlow(imageData, gx, gy, cw, ch, cx, cy, t); break;
        case 'vortex':    applyVortex(imageData, gx, gy, cw, ch, cx, cy); break;
        case 'shatter':   applyShatter(imageData, gx, gy, cw, ch, cx, cy, t); break;
        case 'ripple':    applyRipple(imageData, gx, gy, cw, ch, cx, cy, t); break;
        case 'neon':      applyNeon(imageData, gx, gy, cw, ch, cx, cy, t); break;
        case 'prism':     applyPrism(imageData, gx, gy, cw, ch, cx, cy); break;
      }
    }
  }
}

function applyPixelFlow(img, sx, sy, w, h, cx, cy, t) {
  const src = new Uint8ClampedArray(img.data), d = img.data, iw = img.width, ih = img.height;
  const yEnd = Math.min(ih, sy + h), xEnd = Math.min(iw, sx + w);
  for (let y = sy; y < yEnd; y++) for (let x = sx; x < xEnd; x++) {
    const dx = x - cx, dy = y - cy, dist = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx);
    const flow = Math.sin(dist / 10 - t) * 9.0;
    const nx = Math.max(sx, Math.min(xEnd - 1, Math.floor(x + Math.cos(a) * flow)));
    const ny = Math.max(sy, Math.min(yEnd - 1, Math.floor(y + Math.sin(a) * flow)));
    const ti = (y * iw + x) * 4, si = (ny * iw + nx) * 4;
    d[ti] = src[si]; d[ti + 1] = src[si + 1]; d[ti + 2] = src[si + 2];
  }
}

function applyVortex(img, sx, sy, w, h, cx, cy) {
  const src = new Uint8ClampedArray(img.data), d = img.data, iw = img.width, ih = img.height;
  const maxR = Math.sqrt(w * w + h * h) * 0.5;
  const yEnd = Math.min(ih, sy + h), xEnd = Math.min(iw, sx + w);
  for (let y = sy; y < yEnd; y++) for (let x = sx; x < xEnd; x++) {
    const dx = x - cx, dy = y - cy, dist = Math.sqrt(dx * dx + dy * dy);
    const na = Math.atan2(dy, dx) + Math.max(0, (maxR - dist) / maxR) * 4.6;
    const nx = Math.max(sx, Math.min(xEnd - 1, Math.floor(cx + Math.cos(na) * dist)));
    const ny = Math.max(sy, Math.min(yEnd - 1, Math.floor(cy + Math.sin(na) * dist)));
    const ti = (y * iw + x) * 4, si = (ny * iw + nx) * 4;
    d[ti] = src[si]; d[ti + 1] = src[si + 1]; d[ti + 2] = src[si + 2];
  }
}

function applyShatter(img, sx, sy, w, h, cx, cy, t) {
  const src = new Uint8ClampedArray(img.data), d = img.data, iw = img.width, ih = img.height;
  const shard = Math.max(6, Math.floor(Math.min(w, h) / 6));
  const fractures = [];
  for (let i = 0; i < 5; i++) fractures.push({ angle: (Math.PI * 2 * i / 5) + t * 0.2, strength: Math.sin(t + i) * 0.4 + 1.3 });
  const yEnd = Math.min(ih, sy + h), xEnd = Math.min(iw, sx + w);
  for (let y = sy; y < yEnd; y += shard) for (let x = sx; x < xEnd; x += shard) {
    const dx = (x - cx) / Math.max(1, w), dy = (y - cy) / Math.max(1, h);
    const baseA = Math.atan2(dy, dx), dist = Math.sqrt(dx * dx + dy * dy);
    let maxD = 0, domA = baseA;
    for (const f of fractures) {
      const diff = Math.abs(((baseA - f.angle + Math.PI) % (Math.PI * 2)) - Math.PI);
      const p = (1 - diff / Math.PI) * f.strength;
      if (p > maxD) { maxD = p; domA = f.angle; }
    }
    const disp = 56 * dist * maxD, offX = Math.cos(domA) * disp, offY = Math.sin(domA) * disp;
    for (let py = 0; py < shard && y + py < yEnd; py++) for (let px = 0; px < shard && x + px < xEnd; px++) {
      const rx = Math.max(sx, Math.min(xEnd - 1, Math.floor(x + px + offX)));
      const ry = Math.max(sy, Math.min(yEnd - 1, Math.floor(y + py + offY)));
      const ti = ((y + py) * iw + (x + px)) * 4, si = (ry * iw + rx) * 4;
      const edge = Math.max(Math.abs(px - shard * 0.5) / (shard * 0.5), Math.abs(py - shard * 0.5) / (shard * 0.5));
      const boost = 1 + edge * 0.45, cShift = Math.floor(edge * 4) % 3;
      d[ti] = Math.min(255, src[si + cShift] * boost);
      d[ti + 1] = Math.min(255, src[si + ((cShift + 1) % 3)] * boost);
      d[ti + 2] = Math.min(255, src[si + ((cShift + 2) % 3)] * boost);
    }
  }
}

function applyRipple(img, sx, sy, w, h, cx, cy, t) {
  const src = new Uint8ClampedArray(img.data), d = img.data, iw = img.width, ih = img.height;
  const yEnd = Math.min(ih, sy + h), xEnd = Math.min(iw, sx + w);
  for (let y = sy; y < yEnd; y++) for (let x = sx; x < xEnd; x++) {
    const dx = x - cx, dy = y - cy, dist = Math.sqrt(dx * dx + dy * dy);
    const rip = Math.sin(dist * 0.14 - t * 2) * 11, a = Math.atan2(dy, dx);
    const nx = Math.max(sx, Math.min(xEnd - 1, Math.floor(x + Math.cos(a) * rip)));
    const ny = Math.max(sy, Math.min(yEnd - 1, Math.floor(y + Math.sin(a) * rip)));
    const ti = (y * iw + x) * 4, si = (ny * iw + nx) * 4;
    d[ti] = src[si]; d[ti + 1] = src[si + 1]; d[ti + 2] = src[si + 2];
  }
}

function applyNeon(img, sx, sy, w, h, cx, cy, t) {
  const src = new Uint8ClampedArray(img.data), d = img.data, iw = img.width, ih = img.height;
  const pulse = Math.sin(t * 3) * 0.25 + 1.25;
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) lut[i] = Math.min(255, i + Math.pow(i / 255, 0.8) * 78 * pulse);
  const rP = Math.sin(t * 4) * 0.5 + 0.5, gP = Math.sin(t * 4 + 2.094) * 0.5 + 0.5, bP = Math.sin(t * 4 + 4.189) * 0.5 + 0.5;
  const yEnd = Math.min(ih, sy + h), xEnd = Math.min(iw, sx + w);
  for (let y = sy; y < yEnd; y++) for (let x = sx; x < xEnd; x++) {
    const dx = (x - cx) / Math.max(1, w), dy = (y - cy) / Math.max(1, h);
    const distF = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 1.9);
    const i = (y * iw + x) * 4, prev = Math.max(0, i - 4);
    const r = src[i], g = src[i + 1], b = src[i + 2];
    const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255, bloom = lum * lum * distF * 54;
    const nr = lut[r] + bloom * rP, ng = lut[g] + bloom * gP, nb = lut[b] + bloom * bP;
    const edge = Math.max(Math.abs(nr - lut[src[prev]]) / 255, Math.abs(ng - lut[src[prev + 1]]) / 255, Math.abs(nb - lut[src[prev + 2]]) / 255) * pulse * 55;
    d[i] = Math.min(255, nr + edge); d[i + 1] = Math.min(255, ng + edge); d[i + 2] = Math.min(255, nb + edge);
  }
}

function applyPrism(img, sx, sy, w, h, cx, cy) {
  const src = new Uint8ClampedArray(img.data), d = img.data, iw = img.width, ih = img.height;
  const yEnd = Math.min(ih, sy + h), xEnd = Math.min(iw, sx + w);
  for (let y = sy; y < yEnd; y++) for (let x = sx; x < xEnd; x++) {
    const dx = (x - cx) / Math.max(1, w), dy = (y - cy) / Math.max(1, h);
    const a = Math.atan2(dy, dx), s = 15 * Math.max(0.2, 1 - Math.sqrt(dx * dx + dy * dy));
    const rx = Math.max(sx, Math.min(xEnd - 1, Math.floor(x + s * Math.cos(a + Math.PI / 3))));
    const ry = Math.max(sy, Math.min(yEnd - 1, Math.floor(y + s * Math.sin(a + Math.PI / 3))));
    const gx = Math.max(sx, Math.min(xEnd - 1, Math.floor(x + s * Math.cos(a))));
    const gy = Math.max(sy, Math.min(yEnd - 1, Math.floor(y + s * Math.sin(a))));
    const bx = Math.max(sx, Math.min(xEnd - 1, Math.floor(x + s * Math.cos(a - Math.PI / 3))));
    const by = Math.max(sy, Math.min(yEnd - 1, Math.floor(y + s * Math.sin(a - Math.PI / 3))));
    const ti = (y * iw + x) * 4;
    d[ti] = src[(ry * iw + rx) * 4]; d[ti + 1] = src[(gy * iw + gx) * 4 + 1]; d[ti + 2] = src[(by * iw + bx) * 4 + 2];
  }
}
