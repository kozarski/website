import {
  SEG_SOI, SEG_APP, SEG_DQT, SEG_SOF, SEG_DHT, SEG_SOS, SEG_SCAN, SEG_EOI, SEG_OTHER
} from './constants.js';

/* ============================================================
   JPEG BINARY STRUCTURE PARSER & ASYNC DECODER
   ============================================================ */
export function canvasToJpegBytes(canvas, quality) {
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const bin = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function parseJpegStructure(bytes) {
  const n = bytes.length;
  const segments = new Uint8Array(n);
  segments.fill(SEG_OTHER);
  let scanStart = Math.min(n - 2, 24);
  let scanEnd = Math.max(scanStart, n - 2);
  let i = 0;

  if (n >= 2 && bytes[0] === 0xFF && bytes[1] === 0xD8) {
    segments[0] = SEG_SOI; segments[1] = SEG_SOI; i = 2;
  }

  let foundSos = false;
  while (i + 1 < n && !foundSos) {
    if (bytes[i] !== 0xFF) { i++; continue; }
    while (i + 1 < n && bytes[i + 1] === 0xFF) i++;
    if (i + 1 >= n) break;
    const code = bytes[i + 1];
    if (code === 0xD9) { scanEnd = i; break; }
    if (code === 0x00 || (code >= 0xD0 && code <= 0xD7) || code === 0x01) { i += 2; continue; }
    if (i + 3 >= n) break;
    const segLen = (bytes[i + 2] << 8) | bytes[i + 3];
    const segEnd = Math.min(n, i + 2 + segLen);
    let segType = SEG_OTHER;
    if ((code >= 0xE0 && code <= 0xEF) || code === 0xFE) segType = SEG_APP;
    else if (code === 0xDB) segType = SEG_DQT;
    else if (code === 0xC0 || code === 0xC1 || code === 0xC2) segType = SEG_SOF;
    else if (code === 0xC4) segType = SEG_DHT;
    else if (code === 0xDA) segType = SEG_SOS;
    for (let k = i; k < segEnd; k++) segments[k] = segType;
    i = segEnd;
    if (code === 0xDA) { foundSos = true; scanStart = i; }
  }

  let eoiPos = n - 2;
  for (let k = n - 2; k >= scanStart; k--) {
    if (bytes[k] === 0xFF && bytes[k + 1] === 0xD9) { eoiPos = k; break; }
  }
  scanEnd = Math.max(scanStart, eoiPos);
  for (let k = scanStart; k < scanEnd; k++) segments[k] = SEG_SCAN;
  for (let k = scanEnd; k < n; k++) segments[k] = SEG_EOI;
  return { segments, scanStart, scanEnd };
}

export function decodeJpegBytesAsync(bytes) {
  return new Promise((resolve) => {
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}
