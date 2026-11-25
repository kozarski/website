/* ============================================================
   IMAGE SONIFIER SYNTHESIS & 16-BIT STEREO PCM RIFF/WAVE ENCODER
   ============================================================ */
export function formatMmSs(sec) {
  const s = Math.max(0, Math.floor(sec));
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

export function synthesizeImageAudioBuffer(sourceCanvas, createBufferFn) {
  const sw = Math.min(200, sourceCanvas.width);
  const sh = Math.max(24, Math.round(sw * (sourceCanvas.height / Math.max(1, sourceCanvas.width))));
  const sc = document.createElement('canvas');
  sc.width = sw;
  sc.height = sh;
  sc.getContext('2d').drawImage(sourceCanvas, 0, 0, sw, sh);
  const data = sc.getContext('2d').getImageData(0, 0, sw, sh).data;

  const sampleRate = 44100;
  const duration = 6.0;
  const numSamples = Math.floor(sampleRate * duration);
  let buffer, left, right;
  try {
    buffer = createBufferFn(2, numSamples, sampleRate);
    left = buffer.getChannelData(0);
    right = buffer.getChannelData(1);
  } catch (_) {
    left = new Float32Array(numSamples);
    right = new Float32Array(numSamples);
    buffer = {
      numberOfChannels: 2,
      sampleRate,
      length: numSamples,
      duration,
      getChannelData: (ch) => (ch === 0 ? left : right)
    };
  }

  const totalPx = sw * sh;
  const baseFreq = 110;
  const maxFreq = 1760;
  let phase = 0;
  for (let i = 0; i < numSamples; i++) {
    const px = Math.floor((i / numSamples) * totalPx);
    const pi = (px % totalPx) * 4;
    const r = data[pi] / 255;
    const g = data[pi + 1] / 255;
    const b = data[pi + 2] / 255;
    const lum = (r + g + b) / 3;
    phase += (2 * Math.PI * (baseFreq + (maxFreq - baseFreq) * lum)) / sampleRate;
    const wv = Math.sin(phase) * (0.4 + r * 0.6) + Math.sin(phase * 1.5) * g * 0.45 + Math.sin(phase * 2.0) * b * 0.25;
    const pan = ((px % sw) / sw) * 2 - 1;
    left[i] = Math.tanh(wv * (1 - Math.max(0, pan)) * 0.72);
    right[i] = Math.tanh(wv * (1 + Math.min(0, pan)) * 0.72);
  }
  return buffer;
}

export function encodeAudioBufferToWav(audioBuffer) {
  const numChannels = Math.max(1, Math.min(2, audioBuffer.numberOfChannels || 2));
  const sampleRate = audioBuffer.sampleRate || 44100;
  const numFrames = audioBuffer.length;
  const bytesPerSample = 2; // 16-bit signed PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const totalBytes = 44 + dataSize;

  const out = new ArrayBuffer(totalBytes);
  const view = new DataView(out);

  function writeAscii(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);             // Subchunk1Size (PCM = 16)
  view.setUint16(20, 1, true);              // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true);    // NumChannels (2 = Stereo)
  view.setUint32(24, sampleRate, true);     // SampleRate (44100 Hz)
  view.setUint32(28, byteRate, true);       // ByteRate
  view.setUint16(32, blockAlign, true);     // BlockAlign
  view.setUint16(34, 16, true);             // BitsPerSample (16-bit)
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);       // Subchunk2Size

  const ch0 = audioBuffer.getChannelData(0);
  const ch1 = numChannels > 1 ? audioBuffer.getChannelData(1) : ch0;
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    let sL = ch0[i];
    if (sL > 1) sL = 1; else if (sL < -1) sL = -1;
    view.setInt16(offset, sL < 0 ? Math.round(sL * 0x8000) : Math.round(sL * 0x7FFF), true);
    offset += 2;
    if (numChannels > 1) {
      let sR = ch1[i];
      if (sR > 1) sR = 1; else if (sR < -1) sR = -1;
      view.setInt16(offset, sR < 0 ? Math.round(sR * 0x8000) : Math.round(sR * 0x7FFF), true);
      offset += 2;
    }
  }

  return new Uint8Array(out);
}
