/* ============================================================
   3 TEXT-FREE, HIGH-CONTRAST PROCEDURAL ARTWORKS (800x600)
   ============================================================ */
export function renderSpecimenIntoCanvas(index, targetCanvas) {
  const w = targetCanvas.width;
  const h = targetCanvas.height;
  const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
  ctx.save();
  ctx.scale(w / 800, h / 600);
  if (index === 0) drawDessau(ctx, 800, 600);
  else if (index === 1) drawAlpineRidge(ctx, 800, 600);
  else drawChromaPrism(ctx, 800, 600);
  ctx.restore();
  if (w >= 600) addDeterministicGrain(ctx, w, h, 8, 2003 + index * 317);
}

export function drawDessau(ctx, w, h) {
  ctx.fillStyle = '#ECE8DE';
  ctx.fillRect(0, 0, w, h);

  for (let y = 0; y < h; y += 50) {
    ctx.fillStyle = (y / 50) % 2 === 0 ? 'rgba(10,16,32,0.032)' : 'rgba(255,255,255,0.22)';
    ctx.fillRect(0, y, w, 25);
  }

  ctx.fillStyle = '#CFD5E0';
  ctx.fillRect(54, 48, 344, 286);

  ctx.fillStyle = '#0D1321';
  ctx.fillRect(426, 48, 320, 174);

  ctx.fillStyle = '#1447C2';
  ctx.fillRect(426, 246, 214, 306);

  ctx.fillStyle = '#EBB80A';
  ctx.fillRect(658, 246, 88, 148);

  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#0D1321' : '#ECE8DE';
    ctx.fillRect(658, 412 + i * 24, 88, 12);
  }

  ctx.beginPath();
  ctx.moveTo(54, 552); ctx.lineTo(396, 210); ctx.lineTo(444, 258); ctx.lineTo(102, 552); ctx.closePath();
  ctx.fillStyle = '#0D1321'; ctx.fill();

  ctx.beginPath(); ctx.arc(250, 218, 124, 0, Math.PI * 2); ctx.fillStyle = '#DF3118'; ctx.fill();
  ctx.beginPath(); ctx.arc(250, 218, 58, -Math.PI * 0.5, Math.PI * 0.5); ctx.fillStyle = '#ECE8DE'; ctx.fill();

  ctx.beginPath(); ctx.arc(586, 135, 42, 0, Math.PI * 2); ctx.fillStyle = '#ECE8DE'; ctx.fill();
  ctx.beginPath(); ctx.arc(604, 135, 22, 0, Math.PI * 2); ctx.fillStyle = '#DF3118'; ctx.fill();

  ctx.strokeStyle = 'rgba(13, 19, 33, 0.24)';
  ctx.lineWidth = 1;
  for (let x = 54; x <= 746; x += 86.5) { ctx.beginPath(); ctx.moveTo(x + 0.5, 48); ctx.lineTo(x + 0.5, 552); ctx.stroke(); }
  for (let y = 48; y <= 552; y += 63) { ctx.beginPath(); ctx.moveTo(54, y + 0.5); ctx.lineTo(746, y + 0.5); ctx.stroke(); }
}

export function drawAlpineRidge(ctx, w, h) {
  // Rich high-altitude dusk sky gradient with clean horizon band
  const sky = ctx.createLinearGradient(0, 0, 0, 448);
  sky.addColorStop(0, '#07122B');
  sky.addColorStop(0.32, '#17346B');
  sky.addColorStop(0.62, '#4171B5');
  sky.addColorStop(0.84, '#A8C7EA');
  sky.addColorStop(1, '#F8DEC0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, 448);

  // Subtle atmospheric strata bands in upper sky
  for (let y = 26; y < 290; y += 22) {
    ctx.fillStyle = y % 44 === 0 ? 'rgba(255, 255, 255, 0.032)' : 'rgba(6, 14, 34, 0.045)';
    ctx.fillRect(0, y, w, 7);
  }

  // Radiant alpine sun + warm core + geometric meridian rings
  const sunX = 562, sunY = 162;
  const halo = ctx.createRadialGradient(sunX, sunY, 30, sunX, sunY, 210);
  halo.addColorStop(0, 'rgba(255, 138, 48, 0.52)');
  halo.addColorStop(0.5, 'rgba(246, 102, 34, 0.16)');
  halo.addColorStop(1, 'rgba(246, 102, 34, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(sunX, sunY, 210, 0, Math.PI * 2); ctx.fill();

  ctx.beginPath(); ctx.arc(sunX, sunY, 74, 0, Math.PI * 2); ctx.fillStyle = '#F25A1A'; ctx.fill();
  ctx.beginPath(); ctx.arc(sunX - 10, sunY - 8, 44, 0, Math.PI * 2); ctx.fillStyle = '#FFA43D'; ctx.fill();
  ctx.strokeStyle = 'rgba(235, 246, 255, 0.44)'; ctx.lineWidth = 1.6;
  for (let r = 98; r <= 182; r += 28) {
    ctx.beginPath(); ctx.arc(sunX, sunY, r, 0, Math.PI * 2); ctx.stroke();
  }

  // Far misty slate ridge
  ctx.beginPath();
  ctx.moveTo(0, 396); ctx.lineTo(118, 254); ctx.lineTo(234, 314);
  ctx.lineTo(410, 186); ctx.lineTo(548, 288); ctx.lineTo(686, 204);
  ctx.lineTo(800, 294); ctx.lineTo(800, 448); ctx.lineTo(0, 448); ctx.closePath();
  ctx.fillStyle = '#3C5785'; ctx.fill();

  // Far sunlit flank facets
  ctx.beginPath();
  ctx.moveTo(410, 186); ctx.lineTo(492, 292); ctx.lineTo(548, 288); ctx.closePath();
  ctx.fillStyle = '#7999C7'; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(686, 204); ctx.lineTo(748, 304); ctx.lineTo(800, 294); ctx.closePath();
  ctx.fillStyle = '#89A8D4'; ctx.fill();

  // Mid glacier range
  ctx.beginPath();
  ctx.moveTo(0, 448); ctx.lineTo(94, 342); ctx.lineTo(222, 232);
  ctx.lineTo(340, 330); ctx.lineTo(506, 248); ctx.lineTo(646, 356);
  ctx.lineTo(800, 270); ctx.lineTo(800, 448); ctx.closePath();
  ctx.fillStyle = '#1D3358'; ctx.fill();

  ctx.beginPath();
  ctx.moveTo(222, 232); ctx.lineTo(278, 322); ctx.lineTo(340, 330); ctx.closePath();
  ctx.fillStyle = '#9BB8DE'; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(506, 248); ctx.lineTo(564, 342); ctx.lineTo(646, 356); ctx.closePath();
  ctx.fillStyle = '#B9D0EE'; ctx.fill();

  // Monumental foreground obsidian peak
  ctx.beginPath();
  ctx.moveTo(0, 448); ctx.lineTo(154, 306); ctx.lineTo(334, 108);
  ctx.lineTo(486, 332); ctx.lineTo(632, 256); ctx.lineTo(800, 424);
  ctx.lineTo(800, 448); ctx.closePath();
  ctx.fillStyle = '#091224'; ctx.fill();

  // Razor-sharp sunlit ivory & glacial-blue faceted faces on main peak
  ctx.beginPath();
  ctx.moveTo(334, 108); ctx.lineTo(386, 224); ctx.lineTo(318, 298);
  ctx.lineTo(442, 412); ctx.lineTo(486, 332); ctx.closePath();
  ctx.fillStyle = '#F3F8FF'; ctx.fill();

  ctx.beginPath();
  ctx.moveTo(334, 108); ctx.lineTo(318, 298); ctx.lineTo(274, 248); ctx.closePath();
  ctx.fillStyle = '#BBD2EF'; ctx.fill();

  ctx.beginPath();
  ctx.moveTo(154, 306); ctx.lineTo(234, 384); ctx.lineTo(192, 448); ctx.lineTo(96, 412); ctx.closePath();
  ctx.fillStyle = '#7393BF'; ctx.fill();

  ctx.beginPath();
  ctx.moveTo(632, 256); ctx.lineTo(704, 378); ctx.lineTo(664, 448); ctx.lineTo(596, 390); ctx.closePath();
  ctx.fillStyle = '#D7E6FA'; ctx.fill();

  // Reflective glacial lake in lower quarter (y: 448..600)
  const lake = ctx.createLinearGradient(0, 448, 0, h);
  lake.addColorStop(0, '#102447');
  lake.addColorStop(0.52, '#0B1830');
  lake.addColorStop(1, '#060D1C');
  ctx.fillStyle = lake;
  ctx.fillRect(0, 448, w, h - 448);

  // Reflected snow facet & fiery sun shimmer slices on water
  ctx.fillStyle = 'rgba(222, 238, 255, 0.24)';
  ctx.beginPath();
  ctx.moveTo(318, 448); ctx.lineTo(468, 448); ctx.lineTo(408, 594); ctx.lineTo(338, 594); ctx.closePath();
  ctx.fill();

  for (let y = 454; y < 594; y += 8) {
    const span = Math.max(24, 118 - (y - 448) * 0.55);
    const jitter = Math.sin(y * 0.37) * 14;
    ctx.fillStyle = y % 16 === 6 ? 'rgba(255, 162, 66, 0.72)' : 'rgba(246, 98, 30, 0.44)';
    ctx.fillRect(sunX - span * 0.5 + jitter, y, span, 3.2);
  }

  // Crisp horizontal lake contour ripples
  for (let y = 456; y < 596; y += 11) {
    ctx.strokeStyle = y % 22 === 0 ? 'rgba(220, 238, 255, 0.42)' : 'rgba(132, 178, 236, 0.22)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 20) {
      const wave = Math.sin(x * 0.02 + y * 0.055) * 4.5;
      if (x === 0) ctx.moveTo(x, y + wave); else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }

  // Crisp glacial shoreline highlight + clean modernist registration bar (no text)
  ctx.fillStyle = '#E8F2FF';
  ctx.fillRect(0, 447, w, 2);
  ctx.fillStyle = '#F25A1A'; ctx.fillRect(38, 36, 44, 7);
  ctx.fillStyle = '#F5C422'; ctx.fillRect(86, 36, 44, 7);
  ctx.fillStyle = '#5CA4FF'; ctx.fillRect(134, 36, 44, 7);
}

export function drawChromaPrism(ctx, w, h) {
  // Museum gallery mat frame + deep optical obsidian studio backdrop
  ctx.fillStyle = '#ECEFF6';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#090D1A';
  ctx.fillRect(22, 22, w - 44, h - 44);

  // Precision op-art optical grating lines on dark backdrop (electric under JPEG & Scanlines)
  ctx.save();
  ctx.beginPath();
  ctx.rect(22, 22, w - 44, h - 44);
  ctx.clip();

  for (let x = 26; x < w - 22; x += 10) {
    ctx.fillStyle = x % 20 === 6 ? 'rgba(180, 212, 255, 0.065)' : 'rgba(255, 255, 255, 0.025)';
    ctx.fillRect(x, 22, 3, h - 44);
  }

  // High-contrast stepped vertical diffraction bars on left field
  const leftBars = [
    { x: 52, y: 66, bw: 18, bh: 158, c: '#ECEFF6' },
    { x: 78, y: 92, bw: 10, bh: 132, c: '#3B78E8' },
    { x: 52, y: 386, bw: 96, bh: 16, c: '#F5C419' },
    { x: 52, y: 412, bw: 72, bh: 12, c: '#E83D22' },
    { x: 52, y: 434, bw: 118, bh: 12, c: '#26B5F2' }
  ];
  for (const b of leftBars) {
    ctx.fillStyle = b.c;
    ctx.fillRect(b.x, b.y, b.bw, b.bh);
  }

  // Concentric optical target rings behind prism apex
  ctx.strokeStyle = 'rgba(216, 232, 255, 0.16)';
  ctx.lineWidth = 1.5;
  for (let r = 84; r <= 276; r += 32) {
    ctx.beginPath(); ctx.arc(334, 304, r, 0, Math.PI * 2); ctx.stroke();
  }

  // 7-band razor-sharp chromatic spectral dispersion fan exiting right face of prism
  const spectrum = ['#E62222', '#F56A14', '#F7C815', '#20C95A', '#14B8EB', '#255CE8', '#8C2EE8'];
  const bandCount = spectrum.length;
  for (let i = 0; i < bandCount; i++) {
    const t0 = i / bandCount;
    const t1 = (i + 1) / bandCount;
    const sy0 = 262 + t0 * 88;
    const sy1 = 262 + t1 * 88;
    const ey0 = 114 + t0 * 372;
    const ey1 = 114 + t1 * 372;

    ctx.beginPath();
    ctx.moveTo(384, sy0);
    ctx.lineTo(w - 22, ey0);
    ctx.lineTo(w - 22, ey1);
    ctx.lineTo(384, sy1);
    ctx.closePath();
    ctx.fillStyle = spectrum[i];
    ctx.fill();
  }

  // Optical stepped diffraction slits intersecting the right spectral fan
  for (let x = 516; x <= 716; x += 28) {
    ctx.fillStyle = x % 56 === 12 ? '#090D1A' : 'rgba(255, 255, 255, 0.88)';
    ctx.fillRect(x, 128, 7, 344);
  }

  // Incoming pure white optical light beam striking left face of prism
  const beamGlow = ctx.createLinearGradient(22, 240, 290, 310);
  beamGlow.addColorStop(0, 'rgba(210, 236, 255, 0.42)');
  beamGlow.addColorStop(1, 'rgba(255, 255, 255, 0.96)');
  ctx.beginPath();
  ctx.moveTo(22, 266);
  ctx.lineTo(286, 298);
  ctx.lineTo(280, 326);
  ctx.lineTo(22, 314);
  ctx.closePath();
  ctx.fillStyle = beamGlow;
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(22, 281);
  ctx.lineTo(288, 304);
  ctx.lineTo(284, 318);
  ctx.lineTo(22, 299);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  // Central faceted equilateral optical glass prism
  const ax = 334, ay = 136;
  const bx = 196, by = 438;
  const cx = 472, cy = 438;

  const prismGrad = ctx.createLinearGradient(bx, ay, cx, by);
  prismGrad.addColorStop(0, '#1B3A75');
  prismGrad.addColorStop(0.45, '#0F224A');
  prismGrad.addColorStop(1, '#2D60B8');
  ctx.beginPath();
  ctx.moveTo(ax, ay); ctx.lineTo(cx, cy); ctx.lineTo(bx, by); ctx.closePath();
  ctx.fillStyle = prismGrad;
  ctx.fill();

  // Internal specular glass refraction facets
  ctx.beginPath();
  ctx.moveTo(ax, ay); ctx.lineTo(356, 286); ctx.lineTo(262, 332); ctx.closePath();
  ctx.fillStyle = 'rgba(220, 240, 255, 0.34)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(282, 308); ctx.lineTo(386, 264); ctx.lineTo(414, 344); ctx.lineTo(266, 336); ctx.closePath();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(bx, by); ctx.lineTo(334, 376); ctx.lineTo(cx, cy); ctx.closePath();
  ctx.fillStyle = 'rgba(92, 168, 255, 0.36)';
  ctx.fill();

  // Crisp beveled glass outline
  ctx.beginPath();
  ctx.moveTo(ax, ay); ctx.lineTo(cx, cy); ctx.lineTo(bx, by); ctx.closePath();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#E6F2FF';
  ctx.stroke();

  // Floating chromatic refraction discs for high-contrast sorting targets
  ctx.beginPath(); ctx.arc(624, 152, 38, 0, Math.PI * 2); ctx.fillStyle = '#090D1A'; ctx.fill();
  ctx.beginPath(); ctx.arc(624, 152, 22, 0, Math.PI * 2); ctx.fillStyle = '#F7C815'; ctx.fill();

  ctx.beginPath(); ctx.arc(166, 150, 34, 0, Math.PI * 2); ctx.fillStyle = '#E62222'; ctx.fill();
  ctx.beginPath(); ctx.arc(166, 150, 15, 0, Math.PI * 2); ctx.fillStyle = '#ECEFF6'; ctx.fill();

  ctx.beginPath(); ctx.arc(650, 456, 32, 0, Math.PI * 2); ctx.fillStyle = '#14B8EB'; ctx.fill();
  ctx.beginPath(); ctx.arc(650, 456, 14, 0, Math.PI * 2); ctx.fillStyle = '#090D1A'; ctx.fill();

  ctx.restore();

  // Crisp dark hairline inside museum mat border
  ctx.strokeStyle = '#090D1A';
  ctx.lineWidth = 2;
  ctx.strokeRect(21, 21, w - 42, h - 42);
}

export function addDeterministicGrain(ctx, w, h, amp, seed) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let s = seed | 0;
  for (let i = 0; i < d.length; i += 4) {
    s = (s * 1664525 + 1013904223) | 0;
    const n = ((s >>> 24) / 255 - 0.5) * amp * 2;
    d[i]     = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}

