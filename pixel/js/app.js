import {
  STORAGE_PRESETS_KEY,
  STORAGE_SKIN_KEY,
  VALID_SKINS,
  HEX_ROWS_PER_PAGE,
  MAX_HISTORY,
  SNAP_DIST,
  getHexCols,
  getHexPageSize,
  SKIN_SPECTRUM,
  SEG_SOI,
  SEG_DQT,
  SEG_DHT,
  SEG_SCAN,
  SEG_EOI,
  SPECIMENS,
  CELL_COORDS,
  CLASSIC_EFFECTS,
  DEFAULT_PRESETS,
  GRID_EFFECTS,
  LEARNING_NOTES,
  JPEG_SEG_NOTES
} from './constants.js';
import { renderSpecimenIntoCanvas } from './specimens.js';
import { applyClassicEffects, applySpatialGridEffects } from './effects.js';
import { canvasToJpegBytes, parseJpegStructure, decodeJpegBytesAsync } from './hex.js';
import { encodeGif89a } from './gif.js';
import { synthesizeImageAudioBuffer, encodeAudioBufferToWav, formatMmSs } from './audio.js';

/* ============================================================
   APPLICATION STATE
   ============================================================ */
const state = {
  mode: 'bend',      // bend | grid | hex | gif
  skin: 'silver',    // silver | carbon
  visStyle: 'bars',  // bars | mirror | wave
  specimenIndex: 0,
  specimenLabel: SPECIMENS[0].label,

  sourceCanvas: document.createElement('canvas'),
  previewWidth: 800,
  previewHeight: 600,

  // Boots with 3 gentle active bands
  eqEnabled: true,
  classic: {
    bitShift: 24,
    dataOffset: 0,
    rgbSplit: 14,
    scanlines: 30,
    pathSort: 0,
    seedGrowth: 0,
    pixelSort: 0
  },
  activePreset: '',
  userPresets: {},

  activeGridEffect: 'pixelflow',
  gridStates: {
    pixelflow: new Array(9).fill(false),
    vortex:    new Array(9).fill(false),
    shatter:   new Array(9).fill(false),
    ripple:    new Array(9).fill(false),
    neon:      new Array(9).fill(false),
    prism:     new Array(9).fill(false)
  },

  // Unified 25-step Undo / Redo History
  undoStack: [],
  redoStack: [],

  // Native JPEG HEX state
  hexQuality: 0.72,
  hexBaseBytes: null,
  hexBytes: null,
  hexSegments: null,
  hexScanStart: 0,
  hexScanEnd: 0,
  hexHeaderLocked: true,
  hexModifiedSet: new Set(),
  hexPage: 0,
  hexSelectedIdx: 0,
  hexEditNibble: '',
  hexDecodeFault: false,
  hexActiveOutput: false,
  hexLastObjectUrl: null,
  lastHexCols: 8,

  // GIF89a loop state
  gifMode: 'sweep',
  gifFramesCount: 10,
  gifFps: 10,
  gifResCap: 320,
  gifFrames: [],
  gifPlaying: false,
  gifPlayIdx: 0,
  gifTimer: null,
  gifBuildSeq: 0,
  gifLastBytes: null,

  // Web Audio Sonifier + Spectrum Analyzer state
  audioCtx: null,
  audioGain: null,
  audioAnalyser: null,
  audioFreqBuf: null,
  audioTimeBuf: null,
  audioBuffer: null,
  audioSource: null,
  audioPlaying: false,
  audioStartCtxTime: 0,
  audioOffsetSec: 0,
  audioStale: true,
  lastWavBytes: null,
  volume: 0.55,
  muted: false,

  // Spectrum visual buffers
  idleBins: new Float32Array(22),
  peakVals: new Float32Array(22),
  specPhase: 0,

  // Learning Bar state
  tipsVisible: true,
  learnSticky: null,

  // Real Desktop Window Manager state
  zCounter: 20,
  layoutDirty: false,
  winRects: {},
  shaded: { canvas: false, sound: false, studio: false, guide: false }
};

/* ============================================================
   DOM REFERENCES & HELPERS
   ============================================================ */
const $ = (id) => document.getElementById(id);
const desktopStage = $('desktopStage');
const canvasCavity = $('canvasCavity');
const artworkFrame = $('artworkFrame');
const photoCanvas = $('photoCanvas');
const photoCtx = photoCanvas.getContext('2d', { willReadFrequently: true });
const originalCanvas = $('originalCanvas');
const originalCtx = originalCanvas.getContext('2d', { willReadFrequently: true });
const gridOverlay = $('gridOverlay');
const hexScanline = $('hexScanline');
const hexFaultPlate = $('hexFaultPlate');
const learningBar = $('learningBar');
const photoPopover = $('photoPopover');
const presetDrawer = $('presetDrawer');
const winGuide = $('winGuide');
const toastEl = $('toast');
const spectrumCanvas = $('spectrumCanvas');
const specCtx = spectrumCanvas.getContext('2d');

const WINDOWS = {
  canvas: $('winCanvas'),
  sound:  $('winSound'),
  studio: $('winStudio'),
  guide:  $('winGuide')
};

const faderControllers = new Map();
let renderPending = false;
let toastTimer = null;
let learnResetTimer = null;
let visFlashTimer = null;
let audioSeekCtrl = null;

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('is-visible'), 1800);
}

/* ============================================================
   REAL DESKTOP WINDOW MANAGER (DRAG + MAGNETIC SNAP + WINDOWSHADE)
   ============================================================ */
function isDesktopWindowMode() {
  return window.innerWidth >= 1060;
}

function isMobileStackMode() {
  return window.innerWidth <= 767;
}

function computeDefaultWindowRects() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rigW = Math.min(1120, vw - 48);
  const rigH = Math.min(820, vh - 48);
  const ox = Math.max(16, Math.round((vw - rigW) / 2));
  const oy = Math.max(16, Math.round((vh - rigH) / 2));

  const canvasW = Math.round(rigW * 0.575);
  const rightX = ox + canvasW - 1;
  const rightW = rigW - canvasW + 1;
  const soundH = 224;
  const studioY = oy + soundH - 1;
  const studioH = rigH - soundH + 1;

  const guideW = Math.min(484, vw - 32);
  const guideH = Math.min(638, vh - 48);
  const guideX = isDesktopWindowMode()
    ? Math.max(20, Math.min(vw - guideW - 16, ox + canvasW + 6))
    : Math.max(12, Math.round((vw - guideW) / 2));
  const guideY = isDesktopWindowMode()
    ? Math.max(20, oy + 34)
    : Math.max(16, Math.round((vh - guideH) / 2));

  return {
    canvas: { x: ox, y: oy, w: canvasW, h: rigH },
    sound:  { x: rightX, y: oy, w: rightW, h: soundH },
    studio: { x: rightX, y: studioY, w: rightW, h: studioH },
    guide:  { x: guideX, y: guideY, w: guideW, h: guideH }
  };
}

function applyWindowRect(winKey, rect) {
  const el = WINDOWS[winKey];
  if (!el || !rect) return;
  state.winRects[winKey] = { ...rect };
  if (isMobileStackMode()) return;
  if (winKey !== 'guide' && !isDesktopWindowMode()) return;
  el.style.left = Math.round(rect.x) + 'px';
  el.style.top = Math.round(rect.y) + 'px';
  el.style.width = Math.round(rect.w) + 'px';
  el.style.height = Math.round(rect.h) + 'px';
}

function focusWindow(winKey) {
  const el = WINDOWS[winKey];
  if (!el) return;
  state.zCounter += 1;
  el.style.zIndex = String(state.zCounter);
  Object.entries(WINDOWS).forEach(([k, w]) => w.classList.toggle('is-focused', k === winKey));
}

function setLayoutDirty(dirty) {
  state.layoutDirty = !!dirty;
  $('resetLayoutChip').hidden = !state.layoutDirty || !isDesktopWindowMode();
}

function setWindowShaded(winKey, force) {
  const el = WINDOWS[winKey];
  if (!el) return;
  if (isMobileStackMode()) return;
  if (winKey !== 'guide' && !isDesktopWindowMode()) return;
  const next = typeof force === 'boolean' ? force : !state.shaded[winKey];
  state.shaded[winKey] = next;
  el.classList.toggle('is-shaded', next);
  const btn = el.querySelector('[data-shade-btn]');
  if (btn) btn.textContent = next ? '+' : '_';
  if (next) setLayoutDirty(true);
  else checkIfLayoutClean();
  if (winKey === 'canvas' && !next) requestAnimationFrame(layoutArtworkFrame);
}

function checkIfLayoutClean() {
  if (!isDesktopWindowMode()) return;
  const defs = computeDefaultWindowRects();
  let dirty = false;
  for (const k of ['canvas', 'sound', 'studio']) {
    if (state.shaded[k]) { dirty = true; break; }
    const r = state.winRects[k];
    if (!r || Math.abs(r.x - defs[k].x) > 3 || Math.abs(r.y - defs[k].y) > 3) { dirty = true; break; }
  }
  setLayoutDirty(dirty);
}

function resetWindowLayout(silent) {
  const defs = computeDefaultWindowRects();
  for (const k of ['canvas', 'sound', 'studio', 'guide']) {
    state.shaded[k] = false;
    const el = WINDOWS[k];
    el.classList.remove('is-shaded');
    const btn = el.querySelector('[data-shade-btn]');
    if (btn) btn.textContent = '_';
    applyWindowRect(k, defs[k]);
  }
  WINDOWS.canvas.style.zIndex = '10';
  WINDOWS.studio.style.zIndex = '11';
  WINDOWS.sound.style.zIndex = '12';
  WINDOWS.guide.style.zIndex = '40';
  state.zCounter = 40;
  setLayoutDirty(false);
  requestAnimationFrame(layoutArtworkFrame);
  if (!silent) showToast('Window layout reset');
}

function hideSnapGuides() {
  $('snapGuideV').classList.remove('is-visible');
  $('snapGuideH').classList.remove('is-visible');
}

function getVisualWindowRect(winKey) {
  const r = state.winRects[winKey];
  if (!r) return null;
  return { x: r.x, y: r.y, w: r.w, h: state.shaded[winKey] ? 27 : r.h };
}

function initWindowManager() {
  resetWindowLayout(true);

  Object.entries(WINDOWS).forEach(([winKey, el]) => {
    el.addEventListener('pointerdown', () => focusWindow(winKey));

    const handle = el.querySelector('[data-drag-handle]');
    const shadeBtn = el.querySelector('[data-shade-btn]');

    el.querySelectorAll('.wa-win-btn').forEach((btn) => {
      btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    });

    if (shadeBtn) {
      shadeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        setWindowShaded(winKey);
      });
    }

    if (handle) {
      handle.addEventListener('dblclick', (e) => {
        if (e.target.closest('.wa-win-btn')) return;
        setWindowShaded(winKey);
      });

      let dragging = false;
      let startX = 0, startY = 0, origX = 0, origY = 0;

      handle.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.wa-win-btn')) return;
        if (isMobileStackMode()) return;
        if (winKey !== 'guide' && !isDesktopWindowMode()) return;
        e.preventDefault();
        focusWindow(winKey);
        const cur = state.winRects[winKey] || computeDefaultWindowRects()[winKey];
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        origX = cur.x;
        origY = cur.y;
        el.classList.add('is-dragging');
        document.body.classList.add('is-win-dragging');
        try { handle.setPointerCapture(e.pointerId); } catch (_) {}
      });

      handle.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const cur = state.winRects[winKey];
        const w = cur.w;
        const h = state.shaded[winKey] ? 27 : cur.h;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let nx = origX + (e.clientX - startX);
        let ny = origY + (e.clientY - startY);

        // Magnetic edge snapping against other visible windows + viewport margins
        let snappedV = null;
        let snappedH = null;
        let bestDx = SNAP_DIST + 1;
        let bestDy = SNAP_DIST + 1;

        const xTargets = [{ val: 16, line: 16 }, { val: vw - 16 - w, line: vw - 16 }];
        const yTargets = [{ val: 16, line: 16 }, { val: vh - 16 - h, line: vh - 16 }];

        for (const otherKey of Object.keys(WINDOWS)) {
          if (otherKey === winKey) continue;
          const otherEl = WINDOWS[otherKey];
          if (otherEl.hidden) continue;
          const o = getVisualWindowRect(otherKey);
          if (!o) continue;
          xTargets.push(
            { val: o.x + o.w - 1, line: o.x + o.w }, // snap left edge flush to other's right
            { val: o.x - w + 1,   line: o.x },       // snap right edge flush to other's left
            { val: o.x,           line: o.x },       // align left edges
            { val: o.x + o.w - w, line: o.x + o.w }  // align right edges
          );
          yTargets.push(
            { val: o.y + o.h - 1, line: o.y + o.h }, // snap top edge flush to other's bottom
            { val: o.y - h + 1,   line: o.y },       // snap bottom edge flush to other's top
            { val: o.y,           line: o.y },       // align top edges
            { val: o.y + o.h - h, line: o.y + o.h }  // align bottom edges
          );
        }

        for (const t of xTargets) {
          const d = Math.abs(nx - t.val);
          if (d < bestDx) { bestDx = d; nx = t.val; snappedV = t.line; }
        }
        for (const t of yTargets) {
          const d = Math.abs(ny - t.val);
          if (d < bestDy) { bestDy = d; ny = t.val; snappedH = t.line; }
        }

        // Keep window reachable inside viewport
        nx = Math.max(6, Math.min(vw - Math.min(w, 120), nx));
        ny = Math.max(6, Math.min(vh - 36, ny));

        applyWindowRect(winKey, { x: nx, y: ny, w: cur.w, h: cur.h });

        const gV = $('snapGuideV');
        const gH = $('snapGuideH');
        if (snappedV !== null) { gV.style.left = Math.round(snappedV) + 'px'; gV.classList.add('is-visible'); }
        else gV.classList.remove('is-visible');
        if (snappedH !== null) { gH.style.top = Math.round(snappedH) + 'px'; gH.classList.add('is-visible'); }
        else gH.classList.remove('is-visible');

        if (winKey !== 'guide') setLayoutDirty(true);
      });

      const endDrag = (e) => {
        if (!dragging) return;
        dragging = false;
        el.classList.remove('is-dragging');
        document.body.classList.remove('is-win-dragging');
        hideSnapGuides();
        try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
        checkIfLayoutClean();
      };
      handle.addEventListener('pointerup', endDrag);
      handle.addEventListener('pointercancel', endDrag);
    }
  });

  $('resetLayoutChip').addEventListener('click', () => resetWindowLayout(false));

  window.addEventListener('resize', () => {
    if (isDesktopWindowMode()) {
      if (!state.layoutDirty) resetWindowLayout(true);
      else {
        // Keep guide & dragged windows cleanly inside new viewport
        for (const k of Object.keys(WINDOWS)) {
          const r = state.winRects[k];
          if (!r) continue;
          applyWindowRect(k, {
            x: Math.max(6, Math.min(window.innerWidth - 120, r.x)),
            y: Math.max(6, Math.min(window.innerHeight - 40, r.y)),
            w: r.w, h: r.h
          });
        }
      }
    } else {
      $('resetLayoutChip').hidden = true;
      if (!isMobileStackMode() && !winGuide.hidden) {
        applyWindowRect('guide', computeDefaultWindowRects().guide);
      }
    }
    if (state.hexBytes && getHexCols() !== state.lastHexCols) {
      state.hexPage = Math.floor(state.hexSelectedIdx / getHexPageSize());
      renderHexSheet();
    }
    requestAnimationFrame(layoutArtworkFrame);
  });
}

/* ============================================================
   UNIFIED 25-STEP UNDO / REDO HISTORY ENGINE
   ============================================================ */
function captureSnapshot() {
  const gridCopy = {};
  for (const fx of GRID_EFFECTS) gridCopy[fx.key] = state.gridStates[fx.key].slice();
  return {
    classic: { ...state.classic },
    eqEnabled: state.eqEnabled,
    activePreset: state.activePreset,
    activeGridEffect: state.activeGridEffect,
    gridStates: gridCopy,
    hexBytes: state.hexBytes ? new Uint8Array(state.hexBytes) : null,
    hexHeaderLocked: state.hexHeaderLocked,
    hexActiveOutput: state.hexActiveOutput,
    hexDecodeFault: state.hexDecodeFault,
    hexSelectedIdx: state.hexSelectedIdx
  };
}

function snapshotsEqual(a, b) {
  if (!a || !b) return false;
  if (a.eqEnabled !== b.eqEnabled || a.hexActiveOutput !== b.hexActiveOutput) return false;
  for (const fx of CLASSIC_EFFECTS) if (a.classic[fx.key] !== b.classic[fx.key]) return false;
  for (const fx of GRID_EFFECTS) {
    for (let i = 0; i < 9; i++) if (a.gridStates[fx.key][i] !== b.gridStates[fx.key][i]) return false;
  }
  if ((a.hexBytes ? a.hexBytes.length : -1) !== (b.hexBytes ? b.hexBytes.length : -1)) return false;
  if (a.hexBytes && b.hexBytes) {
    for (let i = 0; i < a.hexBytes.length; i++) if (a.hexBytes[i] !== b.hexBytes[i]) return false;
  }
  return true;
}

function pushUndoSnapshot() {
  const snap = captureSnapshot();
  const last = state.undoStack[state.undoStack.length - 1];
  if (last && snapshotsEqual(last, snap)) return;
  state.undoStack.push(snap);
  if (state.undoStack.length > MAX_HISTORY) state.undoStack.shift();
  state.redoStack = [];
  syncUndoRedoUI();
}

function applySnapshot(snap) {
  state.classic = { ...snap.classic };
  state.eqEnabled = snap.eqEnabled;
  state.activePreset = snap.activePreset;
  state.activeGridEffect = snap.activeGridEffect;
  for (const fx of GRID_EFFECTS) state.gridStates[fx.key] = snap.gridStates[fx.key].slice();

  for (const fx of CLASSIC_EFFECTS) {
    const c = faderControllers.get(fx.key);
    if (c) c.setValue(state.classic[fx.key]);
  }
  syncBypassUI();
  syncPresetHighlight();
  syncGridUI();

  if (snap.hexBytes && state.hexBaseBytes) {
    state.hexBytes = new Uint8Array(snap.hexBytes);
    state.hexHeaderLocked = snap.hexHeaderLocked;
    state.hexSelectedIdx = snap.hexSelectedIdx;
    recomputeHexModifiedSet();
    syncHexLockUI();
    renderHexSheet();
    if (snap.hexActiveOutput || state.mode === 'hex') {
      decodeHexBytesToCanvas();
      updateLcdTicker();
      return;
    }
  }
  redrawCanvasImmediate();
  if (state.mode === 'gif') buildAndPlayGifLoop();
}

function performUndo() {
  if (state.undoStack.length === 0) return false;
  state.redoStack.push(captureSnapshot());
  if (state.redoStack.length > MAX_HISTORY) state.redoStack.shift();
  const prev = state.undoStack.pop();
  applySnapshot(prev);
  syncUndoRedoUI();
  showToast('Undid last change');
  return true;
}

function performRedo() {
  if (state.redoStack.length === 0) return false;
  state.undoStack.push(captureSnapshot());
  if (state.undoStack.length > MAX_HISTORY) state.undoStack.shift();
  const next = state.redoStack.pop();
  applySnapshot(next);
  syncUndoRedoUI();
  showToast('Redid change');
  return true;
}

function syncUndoRedoUI() {
  $('undoBtn').disabled = state.undoStack.length === 0;
  $('redoBtn').disabled = state.redoStack.length === 0;
}

/* ============================================================
   CALM LEARNING BAR & FLOATING FIELD GUIDE
   ============================================================ */
function showLearningNote(note, makeSticky) {
  if (!note) return;
  clearTimeout(learnResetTimer);
  $('learnLed').classList.toggle('is-amber', !!note.amber);
  $('learnLed').classList.toggle('is-on', !note.amber);
  $('learnTitle').textContent = note.title || '';
  $('learnOrigin').textContent = note.origin || '';
  $('learnText').textContent = note.text || '';
  if (makeSticky) state.learnSticky = note;
}

function showLearningKey(key, makeSticky) {
  const n = LEARNING_NOTES[key];
  if (n) showLearningNote(n, makeSticky);
}

function resetLearningDeferred() {
  clearTimeout(learnResetTimer);
  learnResetTimer = setTimeout(() => {
    const fb = state.learnSticky || LEARNING_NOTES['mode:' + state.mode];
    if (fb) showLearningNote(fb, false);
  }, 65);
}

function bindTip(el, key) {
  if (!el || !LEARNING_NOTES[key]) return;
  el.addEventListener('pointerenter', () => showLearningKey(key, false));
  el.addEventListener('focus', () => showLearningKey(key, false));
  el.addEventListener('pointerdown', () => showLearningKey(key, true));
  el.addEventListener('pointerleave', resetLearningDeferred);
  el.addEventListener('blur', resetLearningDeferred);
}

function showHexByteNote(idx, makeSticky) {
  if (!state.hexBytes || idx < 0 || idx >= state.hexBytes.length) return;
  const seg = state.hexSegments ? state.hexSegments[idx] : SEG_SCAN;
  const base = JPEG_SEG_NOTES[seg] || JPEG_SEG_NOTES[SEG_SCAN];
  const addr = '0x' + idx.toString(16).toUpperCase().padStart(4, '0');
  const val = state.hexBytes[idx].toString(16).toUpperCase().padStart(2, '0');
  const isMod = state.hexModifiedSet.has(idx);
  showLearningNote({
    title: base.title,
    origin: addr + ' (' + val + (isMod ? ', edited' : '') + ')',
    amber: isMod || base.amber,
    text: base.text
  }, makeSticky);
}

function toggleLearningBar(force) {
  state.tipsVisible = typeof force === 'boolean' ? force : !state.tipsVisible;
  learningBar.hidden = !state.tipsVisible;
  $('tipsToggleBtn').textContent = state.tipsVisible ? 'Hide Tips' : 'Show Tips';
  $('tipsToggleBtn').setAttribute('aria-pressed', String(state.tipsVisible));
  $('chkTips').textContent = state.tipsVisible ? 'On' : '';
  requestAnimationFrame(layoutArtworkFrame);
}

function openFieldGuide(force, tabName) {
  const willOpen = typeof force === 'boolean' ? force : winGuide.hidden;
  winGuide.hidden = !willOpen;
  if (willOpen) {
    if (!isMobileStackMode()) {
      if (!state.winRects.guide || !isDesktopWindowMode()) applyWindowRect('guide', computeDefaultWindowRects().guide);
      else applyWindowRect('guide', state.winRects.guide);
    }
    if (state.shaded.guide) setWindowShaded('guide', false);
    focusWindow('guide');
    if (tabName) selectGuideTab(tabName);
  }
}

function selectGuideTab(tabName) {
  document.querySelectorAll('.guide-folder-tab').forEach((btn) => {
    const act = btn.dataset.guideTab === tabName;
    btn.classList.toggle('is-active', act);
    btn.setAttribute('aria-selected', String(act));
  });
  document.querySelectorAll('.guide-pane').forEach((pane) => {
    pane.classList.toggle('is-active', pane.dataset.guidePane === tabName);
  });
}

function launchGuidedRecipe(recipeId, triggerBtn) {
  // Apply LIVE on the Canvas WITHOUT closing the floating Field Guide!
  if (recipeId === 'crt') {
    setMode('bend');
    applyPresetValues({ bitShift: 0, dataOffset: 38, rgbSplit: 26, scanlines: 72, pathSort: 0, seedGrowth: 0, pixelSort: 0 }, '');
    showLearningNote({
      title: '1978 CRT Tracking Drift',
      origin: 'Guided Recipe',
      amber: false,
      text: 'Applied live on the canvas. Try dragging Scanlines or RGB, or press Play in the Sound window to hear the drift.'
    }, true);
    showToast('Applied 1978 CRT Tracking Drift');
  } else if (recipeId === 'sort') {
    setMode('bend');
    applyPresetValues({ bitShift: 0, dataOffset: 0, rgbSplit: 8, scanlines: 0, pathSort: 45, seedGrowth: 24, pixelSort: 168 }, '');
    showLearningNote({
      title: 'Painterly Pixel Sort',
      origin: 'Kim Asendorf, 2012',
      amber: false,
      text: 'Applied live on the canvas. Slide Pixel Sort up or down to sweep the brightness threshold, and hold Compare to check.'
    }, true);
    showToast('Applied Painterly Pixel Sort');
  } else if (recipeId === 'hex') {
    state.hexHeaderLocked = true;
    setMode('hex');
    syncHexLockUI();
    runHexOperator('smear');
    showLearningNote({
      title: 'Safe JPEG Byte Surgery',
      origin: 'Guided Recipe',
      amber: false,
      text: 'Header Lock guards the JPEG blueprint. Hover bytes in the Hex Editor to sweep the scanline probe across the canvas.'
    }, true);
    showToast('Applied Safe JPEG Byte Surgery');
  }

  if (triggerBtn) {
    const orig = triggerBtn.textContent;
    triggerBtn.textContent = 'Applied';
    triggerBtn.classList.add('is-cobalt');
    setTimeout(() => {
      triggerBtn.textContent = orig;
      triggerBtn.classList.remove('is-cobalt');
    }, 1100);
  }
}


function generateSpecimen(index) {
  const safeIdx = ((index % SPECIMENS.length) + SPECIMENS.length) % SPECIMENS.length;
  state.sourceCanvas.width = 800;
  state.sourceCanvas.height = 600;
  renderSpecimenIntoCanvas(safeIdx, state.sourceCanvas);

  state.specimenIndex = safeIdx;
  state.specimenLabel = SPECIMENS[safeIdx].label;
  syncSpecimenUI();
  onNewSourceReady();
}

function buildPhotoPopover() {
  const grid = $('specimenGrid');
  grid.innerHTML = '';
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = 200;
  thumbCanvas.height = 150;

  for (const sp of SPECIMENS) {
    renderSpecimenIntoCanvas(sp.id, thumbCanvas);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'specimen-thumb-btn' + (sp.id === state.specimenIndex ? ' is-active' : '');
    btn.dataset.specimen = String(sp.id);
    btn.innerHTML =
      '<img class="specimen-thumb-img" src="' + thumbCanvas.toDataURL('image/png') + '" alt="' + sp.label + '">' +
      '<span class="specimen-thumb-lbl">' + sp.short + '</span>';
    btn.addEventListener('click', () => {
      generateSpecimen(sp.id);
      togglePhotoPopover(false);
      showToast('Loaded ' + sp.label);
    });
    grid.appendChild(btn);
  }
}

function syncSpecimenUI() {
  document.querySelectorAll('#specimenGrid .specimen-thumb-btn').forEach((card) => {
    card.classList.toggle('is-active', parseInt(card.dataset.specimen, 10) === state.specimenIndex);
  });
  document.querySelectorAll('[data-sp-chk]').forEach((el) => {
    el.textContent = parseInt(el.dataset.spChk, 10) === state.specimenIndex ? 'Active' : '';
  });
}

function togglePhotoPopover(force) {
  const willOpen = typeof force === 'boolean' ? force : photoPopover.hidden;
  closeAllMenus();
  presetDrawer.hidden = true;
  photoPopover.hidden = !willOpen;
  $('openPhotoBtn').setAttribute('aria-expanded', String(willOpen));
}

function loadUploadedFile(file) {
  if (!file || !file.type || !file.type.startsWith('image/')) {
    showToast('Unsupported image file');
    return;
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const maxDim = 1280;
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const scale = Math.min(1, maxDim / Math.max(w, h));
      const pw = Math.max(64, Math.round(w * scale));
      const ph = Math.max(64, Math.round(h * scale));
      state.sourceCanvas.width = pw;
      state.sourceCanvas.height = ph;
      state.sourceCanvas.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, pw, ph);
      state.specimenIndex = -1;
      state.specimenLabel = (file.name || 'Uploaded Photo').replace(/\.[^.]+$/, '').slice(0, 24);
      syncSpecimenUI();
      togglePhotoPopover(false);
      onNewSourceReady();
      showToast('Loaded ' + state.specimenLabel);
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

function onNewSourceReady() {
  state.previewWidth = state.sourceCanvas.width;
  state.previewHeight = state.sourceCanvas.height;
  photoCanvas.width = state.previewWidth;
  photoCanvas.height = state.previewHeight;
  originalCanvas.width = state.previewWidth;
  originalCanvas.height = state.previewHeight;
  originalCtx.drawImage(state.sourceCanvas, 0, 0);

  $('canvasStatusLbl').textContent = state.specimenLabel + ' - ' + state.previewWidth + ' x ' + state.previewHeight;

  state.hexBytes = null;
  state.hexBaseBytes = null;
  state.hexActiveOutput = false;
  state.hexDecodeFault = false;
  hexFaultPlate.classList.remove('is-visible');
  $('hexRepairBanner').hidden = true;
  stopGifPreview();
  state.gifFrames = [];
  state.audioStale = true;
  if (state.audioPlaying) stopAudioPlayback();

  layoutArtworkFrame();
  redrawCanvasImmediate();

  if (state.mode === 'hex') captureCanvasToHex();
  else if (state.mode === 'gif') buildAndPlayGifLoop();
}

function layoutArtworkFrame() {
  const rect = canvasCavity.getBoundingClientRect();
  if (rect.width < 20 || rect.height < 20) return;
  const cs = getComputedStyle(canvasCavity);
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const availW = Math.max(100, rect.width - padX);
  const availH = Math.max(100, rect.height - padY);
  const aspect = state.previewWidth / Math.max(1, state.previewHeight);

  let dispW = availW;
  let dispH = dispW / aspect;
  if (dispH > availH) {
    dispH = availH;
    dispW = dispH * aspect;
  }
  artworkFrame.style.width = Math.floor(dispW) + 'px';
  artworkFrame.style.height = Math.floor(dispH) + 'px';
}


function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => { renderPending = false; redrawCanvasImmediate(); });
}

function redrawCanvasImmediate() {
  state.hexActiveOutput = false;
  hexFaultPlate.classList.remove('is-visible');
  photoCtx.drawImage(state.sourceCanvas, 0, 0, photoCanvas.width, photoCanvas.height);
  const imgData = photoCtx.getImageData(0, 0, photoCanvas.width, photoCanvas.height);
  if (state.eqEnabled) applyClassicEffects(imgData, state.classic);
  applySpatialGridEffects(imgData, state.gridStates, 1.75);
  photoCtx.putImageData(imgData, 0, 0);
  state.audioStale = true;
  sampleImageHistogram(imgData);
  updateLcdTicker();
}

/* ============================================================
   COBALT LCD SPECTRUM ANALYZER (BARS -> MIRROR -> WAVE)
   ============================================================ */
function sampleImageHistogram(imageData) {
  const d = imageData.data;
  const bins = new Float32Array(22);
  const step = Math.max(16, Math.floor(d.length / 2600) * 4);
  let maxVal = 1;
  for (let i = 0; i < d.length; i += step) {
    const lum = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
    const b = Math.min(21, Math.floor((lum / 256) * 22));
    bins[b] += 1;
    if (bins[b] > maxVal) maxVal = bins[b];
  }
  const eqBoost = state.eqEnabled
    ? (state.classic.bitShift + state.classic.rgbSplit * 2 + state.classic.scanlines) / 300
    : 0;
  for (let i = 0; i < 22; i++) {
    const norm = Math.sqrt(bins[i] / maxVal);
    const floor = 0.14 + 0.16 * eqBoost * Math.abs(Math.sin(i * 0.65 + 0.4));
    state.idleBins[i] = Math.min(0.96, Math.max(floor, norm * 0.85 + 0.1));
  }
}

let llamaUntil = 0;

function updateLcdTicker() {
  if (Date.now() < llamaUntil) {
    $('lcdTicker').textContent = "BENT PIXEL 5 - IT REALLY BENDS THE LLAMA'S PIXELS";
    return;
  }
  if (state.audioPlaying) {
    $('lcdTicker').textContent = 'Playing Pixel Audio - ' + state.specimenLabel + ' (44 kHz Stereo)';
    return;
  }
  const parts = [];
  if (state.mode === 'hex' && state.hexBytes) {
    parts.push('Hex Editor');
    parts.push(state.hexBytes.length + ' bytes');
    parts.push(state.hexModifiedSet.size + ' edited');
  } else if (state.mode === 'gif') {
    parts.push('GIF Export (' + state.gifMode + ')');
    parts.push(state.gifFramesCount + ' frames @ ' + state.gifFps + ' FPS');
  } else if (state.mode === 'grid') {
    const total = GRID_EFFECTS.reduce((acc, fx) => acc + state.gridStates[fx.key].filter(Boolean).length, 0);
    parts.push('3x3 Grid');
    parts.push(total + ' active zones');
  } else {
    if (!state.eqEnabled) {
      parts.push('Effects Bypassed');
    } else {
      for (const fx of CLASSIC_EFFECTS) {
        const v = state.classic[fx.key] | 0;
        if (v > 0) parts.push(fx.label + ' ' + v);
      }
      if (parts.length === 0) parts.push('Flat (No Effects)');
    }
  }
  $('lcdTicker').textContent = state.specimenLabel + ' - ' + parts.slice(0, 3).join(', ');
}

function cycleVisStyle() {
  const order = ['bars', 'mirror', 'wave'];
  const labels = { bars: 'Bars', mirror: 'Mirror', wave: 'Wave' };
  const next = order[(order.indexOf(state.visStyle) + 1) % order.length];
  state.visStyle = next;
  $('lcdVisBadge').textContent = labels[next];
  const flash = $('lcdVisFlash');
  flash.textContent = labels[next].toUpperCase();
  flash.classList.add('is-visible');
  clearTimeout(visFlashTimer);
  visFlashTimer = setTimeout(() => flash.classList.remove('is-visible'), 950);
}

function drawSpectrumFrame() {
  const w = spectrumCanvas.width;
  const h = spectrumCanvas.height;
  const pal = SKIN_SPECTRUM[state.skin] || SKIN_SPECTRUM.silver;
  specCtx.clearRect(0, 0, w, h);

  // Subtle dot grid inside LCD
  specCtx.fillStyle = pal.dot;
  for (let y = 4; y < h; y += 6) {
    for (let x = 4; x < w; x += 8) specCtx.fillRect(x, y, 1, 1);
  }

  const barCount = 22;
  const levels = new Float32Array(barCount);

  if (state.audioPlaying && state.audioAnalyser && state.audioFreqBuf) {
    state.audioAnalyser.getByteFrequencyData(state.audioFreqBuf);
    for (let i = 0; i < barCount; i++) {
      const bin = Math.min(state.audioFreqBuf.length - 1, Math.floor(i * (state.audioFreqBuf.length / barCount)));
      levels[i] = Math.max(0.08, state.audioFreqBuf[bin] / 255);
    }
    if (state.audioBuffer && state.audioCtx) {
      const elapsed = Math.min(state.audioBuffer.duration, (state.audioCtx.currentTime - state.audioStartCtxTime) + state.audioOffsetSec);
      $('lcdTimer').textContent = formatMmSs(elapsed);
      const pct = (elapsed / Math.max(0.1, state.audioBuffer.duration)) * 100;
      if (audioSeekCtrl) audioSeekCtrl.setVisual(pct);
      const ph = $('audioPlayhead');
      if (ph) {
        ph.style.top = pct.toFixed(2) + '%';
        ph.classList.add('is-visible');
      }
    }
  } else {
    const ph = $('audioPlayhead');
    if (ph) ph.classList.remove('is-visible');
    state.specPhase += 0.05;
    const llamaBoost = Date.now() < llamaUntil ? 0.36 : 0;
    for (let i = 0; i < barCount; i++) {
      const base = state.idleBins[i] || 0.2;
      const ripple = Math.sin(state.specPhase * (llamaBoost ? 2.8 : 1) + i * 0.48) * (llamaBoost ? 0.22 : 0.06) + Math.cos(state.specPhase * 0.65 - i * 0.28) * 0.035;
      levels[i] = Math.max(0.08, Math.min(0.98, base + ripple + llamaBoost * 0.4));
    }
  }

  for (let i = 0; i < barCount; i++) {
    if (levels[i] >= state.peakVals[i]) state.peakVals[i] = levels[i];
    else state.peakVals[i] = Math.max(levels[i], state.peakVals[i] - 0.012);
  }

  if (state.visStyle === 'wave') {
    // Oscilloscope Waveform Mode
    specCtx.strokeStyle = pal.wave;
    specCtx.lineWidth = 1.6;
    specCtx.beginPath();
    if (state.audioPlaying && state.audioAnalyser && state.audioTimeBuf) {
      state.audioAnalyser.getByteTimeDomainData(state.audioTimeBuf);
      const n = state.audioTimeBuf.length;
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * (w - 8) + 4;
        const y = ((state.audioTimeBuf[i] - 128) / 128) * (h * 0.42) + h * 0.5;
        if (i === 0) specCtx.moveTo(x, y); else specCtx.lineTo(x, y);
      }
    } else {
      for (let x = 4; x <= w - 4; x += 2) {
        const norm = (x - 4) / (w - 8);
        const idx = Math.min(barCount - 1, Math.floor(norm * barCount));
        const amp = levels[idx] * (h * 0.36);
        const y = h * 0.5 + Math.sin(norm * Math.PI * 6 + state.specPhase * 2) * amp;
        if (x === 4) specCtx.moveTo(x, y); else specCtx.lineTo(x, y);
      }
    }
    specCtx.stroke();
    specCtx.fillStyle = pal.waveAxis;
    specCtx.fillRect(4, Math.floor(h * 0.5), w - 8, 1);
  } else if (state.visStyle === 'mirror') {
    // Mirrored Stereo Beat Spectrum (winamp-ref-1.jpg)
    const midX = w * 0.5;
    const halfCols = 11;
    const colW = Math.floor((midX - 8) / halfCols);
    for (let i = 0; i < halfCols; i++) {
      const lvl = (levels[i * 2] + levels[i * 2 + 1]) * 0.5;
      const barH = Math.max(4, Math.round(lvl * (h - 10)));
      const yTop = Math.floor((h - barH) * 0.5);
      const xL = midX - 4 - (i + 1) * colW;
      const xR = midX + 4 + i * colW;
      for (let sy = yTop; sy < yTop + barH; sy += 3) {
        specCtx.fillStyle = sy < h * 0.32 || sy > h * 0.68 ? pal.mirrorHi : pal.mirrorLo;
        specCtx.fillRect(xL, sy, Math.max(2, colW - 2), 2);
        specCtx.fillRect(xR, sy, Math.max(2, colW - 2), 2);
      }
    }
    specCtx.fillStyle = pal.mirrorAxis;
    specCtx.fillRect(midX - 0.5, 4, 1, h - 8);
  } else {
    // Classic Winamp Segmented Pixel Bars (winamp-ref-2.png)
    const padX = 5;
    const usableW = w - padX * 2;
    const slotW = usableW / barCount;
    const barW = Math.max(3, Math.floor(slotW - 2));
    const baseY = h - 4;
    const maxH = h - 9;

    for (let i = 0; i < barCount; i++) {
      const x = Math.round(padX + i * slotW);
      const barH = Math.max(3, Math.round(levels[i] * maxH));
      for (let seg = 0; seg < barH; seg += 3) {
        const y = baseY - seg - 2;
        specCtx.fillStyle = (seg / maxH) > 0.72 ? pal.barHi : ((seg / maxH) > 0.38 ? pal.barMid : pal.barLo);
        specCtx.fillRect(x, y, barW, 2);
      }
      const peakY = Math.max(3, baseY - Math.round(state.peakVals[i] * maxH) - 2);
      specCtx.fillStyle = pal.peak;
      specCtx.fillRect(x, peakY, barW, 1.5);
    }
    specCtx.fillStyle = pal.baseLine;
    specCtx.fillRect(padX, h - 2.5, usableW, 1);
  }

  requestAnimationFrame(drawSpectrumFrame);
}

/* ============================================================
   TAB 1: EFFECTS (7-BAND VERTICAL WINAMP FADERS + PRESETS)
   ============================================================ */
function createVerticalFader(fx) {
  const col = document.createElement('div');
  col.className = 'eq-col';

  const valEl = document.createElement('span');
  valEl.className = 'eq-val';

  const trackArea = document.createElement('div');
  trackArea.className = 'eq-track-area';
  trackArea.setAttribute('role', 'slider');
  trackArea.setAttribute('tabindex', '0');
  trackArea.setAttribute('aria-label', fx.label);
  trackArea.setAttribute('aria-valuemin', String(fx.min));
  trackArea.setAttribute('aria-valuemax', String(fx.max));
  trackArea.innerHTML =
    '<div class="eq-groove"><div class="eq-groove-fill"></div></div>' +
    '<div class="eq-thumb"></div>';

  col.appendChild(valEl);
  col.appendChild(trackArea);

  let val = state.classic[fx.key] | 0;

  function updateVisual(v) {
    val = Math.max(fx.min, Math.min(fx.max, Math.round(v)));
    const ratio = (val - fx.min) / Math.max(1, fx.max - fx.min);
    trackArea.style.setProperty('--fader-ratio', ratio.toFixed(4));
    trackArea.style.setProperty('--fader-pct', (ratio * 100).toFixed(2) + '%');
    trackArea.setAttribute('aria-valuenow', String(val));
    valEl.textContent = String(val);
    col.classList.toggle('is-nonzero', val > fx.min);
  }

  function commitValue(next, recordUndo) {
    const clamped = Math.max(fx.min, Math.min(fx.max, Math.round(next)));
    if (clamped === val) return;
    if (recordUndo) pushUndoSnapshot();
    updateVisual(clamped);
    state.classic[fx.key] = clamped;
    state.activePreset = '';
    if (!state.eqEnabled && clamped > 0) setEqEnabled(true, false);
    syncPresetHighlight();
    scheduleRender();
  }

  function setFromRatio(ratio, recordUndo) {
    const clampedRatio = Math.max(0, Math.min(1, ratio));
    commitValue(fx.min + clampedRatio * (fx.max - fx.min), recordUndo);
  }

  trackArea.addEventListener('wheel', (e) => {
    e.preventDefault();
    const step = Math.max(1, Math.round((fx.max - fx.min) / 25));
    commitValue(val + (e.deltaY < 0 ? step : -step), true);
    showLearningKey('classic:' + fx.key, true);
  }, { passive: false });

  trackArea.addEventListener('dblclick', () => commitValue(0, true));

  trackArea.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? Math.max(1, Math.round((fx.max - fx.min) / 10)) : 1;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); commitValue(val + step, true); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); commitValue(val - step, true); }
    else if (e.key === 'Home') { e.preventDefault(); commitValue(fx.min, true); }
    else if (e.key === 'End') { e.preventDefault(); commitValue(fx.max, true); }
  });

  bindTip(col, 'classic:' + fx.key);

  updateVisual(val);
  const api = { col, trackArea, fx, setValue: updateVisual, setFromRatio, getValue: () => val };
  faderControllers.set(fx.key, api);
  return api;
}

function syncBypassUI() {
  $('bypassBtn').setAttribute('aria-pressed', String(!state.eqEnabled));
  $('bypassLed').classList.toggle('is-on', state.eqEnabled);
  $('bypassLabel').textContent = state.eqEnabled ? 'Bypass' : 'Bypassed';
  $('eqFaderBank').classList.toggle('is-bypassed', !state.eqEnabled);
}

function setEqEnabled(enabled, recordUndo) {
  if (recordUndo) pushUndoSnapshot();
  state.eqEnabled = !!enabled;
  syncBypassUI();
  redrawCanvasImmediate();
}

function initEffectsPanel() {
  const bank = $('eqFaderBank');
  const legend = $('eqLegendBar');
  bank.innerHTML = '';
  legend.innerHTML = '';

  const faderApis = [];
  for (const fx of CLASSIC_EFFECTS) {
    const f = createVerticalFader(fx);
    faderApis.push(f);
    bank.appendChild(f.col);

    const legBtn = document.createElement('button');
    legBtn.type = 'button';
    legBtn.className = 'eq-legend-btn';
    legBtn.textContent = fx.label;
    legBtn.title = fx.label + ' (Double-click to reset to 0)';
    legBtn.addEventListener('dblclick', () => {
      if (state.classic[fx.key] === 0) return;
      pushUndoSnapshot();
      state.classic[fx.key] = 0;
      f.setValue(0);
      state.activePreset = '';
      syncPresetHighlight();
      redrawCanvasImmediate();
    });
    bindTip(legBtn, 'classic:' + fx.key);
    legend.appendChild(legBtn);
  }

  // Paint-Across 7-Band EQ Curve Drawing (interpolates skipped faders + single Undo)
  let sweepActive = false;
  let sweepSnapBefore = null;
  let sweepChanged = false;
  let lastBandIdx = -1;
  let lastRatio = 0;

  function resolveBandAndRatio(clientX, clientY) {
    const bankRect = bank.getBoundingClientRect();
    const relX = Math.max(0, Math.min(0.9999, (clientX - bankRect.left) / Math.max(1, bankRect.width)));
    const idx = Math.min(faderApis.length - 1, Math.floor(relX * faderApis.length));
    const tr = faderApis[idx].trackArea.getBoundingClientRect();
    const topPad = 11;
    const usable = Math.max(1, tr.height - topPad * 2);
    const ratio = Math.max(0, Math.min(1, (tr.bottom - topPad - clientY) / usable));
    return { idx, ratio };
  }

  function applySweepPoint(idx, ratio) {
    if (lastBandIdx === -1 || lastBandIdx === idx) {
      const before = faderApis[idx].getValue();
      faderApis[idx].setFromRatio(ratio, false);
      if (faderApis[idx].getValue() !== before) sweepChanged = true;
    } else {
      const step = idx > lastBandIdx ? 1 : -1;
      const dist = Math.abs(idx - lastBandIdx);
      for (let s = 1; s <= dist; s++) {
        const bi = lastBandIdx + step * s;
        const t = s / dist;
        const interp = lastRatio + (ratio - lastRatio) * t;
        const before = faderApis[bi].getValue();
        faderApis[bi].setFromRatio(interp, false);
        if (faderApis[bi].getValue() !== before) sweepChanged = true;
      }
    }
    lastBandIdx = idx;
    lastRatio = ratio;
    showLearningKey('classic:' + faderApis[idx].fx.key, true);
  }

  bank.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.eq-track-area')) return;
    e.preventDefault();
    sweepActive = true;
    sweepChanged = false;
    sweepSnapBefore = captureSnapshot();
    lastBandIdx = -1;
    try { bank.setPointerCapture(e.pointerId); } catch (_) {}
    const pt = resolveBandAndRatio(e.clientX, e.clientY);
    applySweepPoint(pt.idx, pt.ratio);
  });

  bank.addEventListener('pointermove', (e) => {
    if (!sweepActive) return;
    const pt = resolveBandAndRatio(e.clientX, e.clientY);
    applySweepPoint(pt.idx, pt.ratio);
  });

  const endSweep = (e) => {
    if (!sweepActive) return;
    sweepActive = false;
    try { bank.releasePointerCapture(e.pointerId); } catch (_) {}
    if (sweepChanged && sweepSnapBefore) {
      state.undoStack.push(sweepSnapBefore);
      if (state.undoStack.length > MAX_HISTORY) state.undoStack.shift();
      state.redoStack = [];
      syncUndoRedoUI();
    }
    sweepSnapBefore = null;
    lastBandIdx = -1;
  };
  bank.addEventListener('pointerup', endSweep);
  bank.addEventListener('pointercancel', endSweep);

  $('copyPresetLinkBtn').addEventListener('click', copyShareableEqLink);

  $('presetsBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    const willOpen = presetDrawer.hidden;
    closeAllMenus();
    photoPopover.hidden = true;
    presetDrawer.hidden = !willOpen;
    $('presetsBtn').setAttribute('aria-expanded', String(willOpen));
  });
  $('presetDrawerClose').addEventListener('click', () => {
    presetDrawer.hidden = true;
    $('presetsBtn').setAttribute('aria-expanded', 'false');
  });

  $('shuffleBtn').addEventListener('click', shuffleClassicEffects);
  $('resetEffectsBtn').addEventListener('click', resetClassicFaders);
  $('bypassBtn').addEventListener('click', () => setEqEnabled(!state.eqEnabled, true));

  bindTip($('presetsBtn'), 'btn:presets');
  bindTip($('shuffleBtn'), 'btn:shuffle');
  bindTip($('resetEffectsBtn'), 'btn:resetFx');
  bindTip($('bypassBtn'), 'btn:bypass');

  // Build 12 built-in presets inside classic Winamp drawer
  const pList = $('defaultPresetList');
  pList.innerHTML = '';
  for (const [key, def] of Object.entries(DEFAULT_PRESETS)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'preset-row-btn';
    btn.dataset.preset = key;
    btn.textContent = def.label;
    btn.addEventListener('click', () => {
      applyPresetValues(def.values, key);
      presetDrawer.hidden = true;
      $('presetsBtn').setAttribute('aria-expanded', 'false');
      showToast('Preset: ' + def.label);
    });
    bindTip(btn, 'preset:' + key);
    pList.appendChild(btn);
  }

  loadUserPresets();
  renderUserPresets();

  $('savePresetForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('customPresetInput');
    const raw = (inp.value || '').trim();
    const name = raw || ('Custom ' + (Object.keys(state.userPresets).length + 1));
    const snap = {};
    for (const fx of CLASSIC_EFFECTS) snap[fx.key] = state.classic[fx.key] | 0;
    state.userPresets[name] = snap;
    saveUserPresets();
    renderUserPresets();
    inp.value = '';
    state.activePreset = 'user:' + name;
    syncPresetHighlight();
    showToast('Saved preset "' + name + '"');
  });
}

function shuffleClassicEffects() {
  pushUndoSnapshot();
  if (!state.eqEnabled) { state.eqEnabled = true; syncBypassUI(); }
  for (const fx of CLASSIC_EFFECTS) {
    const v = Math.floor(Math.random() * (fx.max + 1));
    state.classic[fx.key] = v;
    const c = faderControllers.get(fx.key);
    if (c) c.setValue(v);
  }
  state.activePreset = '';
  syncPresetHighlight();
  redrawCanvasImmediate();
  showToast('Shuffled effects');
}

function resetClassicFaders() {
  pushUndoSnapshot();
  for (const fx of CLASSIC_EFFECTS) {
    state.classic[fx.key] = 0;
    const c = faderControllers.get(fx.key);
    if (c) c.setValue(0);
  }
  state.activePreset = '';
  syncPresetHighlight();
  redrawCanvasImmediate();
  showToast('Effects reset');
}

function applyPresetValues(values, key) {
  pushUndoSnapshot();
  if (!state.eqEnabled) { state.eqEnabled = true; syncBypassUI(); }
  for (const fx of CLASSIC_EFFECTS) {
    const v = Object.prototype.hasOwnProperty.call(values, fx.key) ? (values[fx.key] | 0) : 0;
    const clamped = Math.max(fx.min, Math.min(fx.max, v));
    state.classic[fx.key] = clamped;
    const c = faderControllers.get(fx.key);
    if (c) c.setValue(clamped);
  }
  state.activePreset = key || '';
  syncPresetHighlight();
  redrawCanvasImmediate();
}

function syncPresetHighlight() {
  document.querySelectorAll('#defaultPresetList .preset-row-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.preset === state.activePreset);
  });
}

function loadUserPresets() {
  try {
    const raw = localStorage.getItem(STORAGE_PRESETS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') state.userPresets = parsed;
    }
  } catch (_) { state.userPresets = {}; }
}

function saveUserPresets() {
  try { localStorage.setItem(STORAGE_PRESETS_KEY, JSON.stringify(state.userPresets)); } catch (_) {}
}

function renderUserPresets() {
  const list = $('userPresetsList');
  list.innerHTML = '';
  for (const name of Object.keys(state.userPresets)) {
    const row = document.createElement('div');
    row.className = 'user-preset-item';

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'preset-row-btn';
    applyBtn.textContent = name;
    applyBtn.addEventListener('click', () => {
      applyPresetValues(state.userPresets[name], 'user:' + name);
      presetDrawer.hidden = true;
      $('presetsBtn').setAttribute('aria-expanded', 'false');
      showToast('Loaded "' + name + '"');
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'user-preset-del';
    delBtn.textContent = '\u00D7';
    delBtn.title = 'Delete ' + name;
    delBtn.addEventListener('click', () => {
      delete state.userPresets[name];
      saveUserPresets();
      renderUserPresets();
      showToast('Deleted "' + name + '"');
    });

    row.appendChild(applyBtn);
    row.appendChild(delBtn);
    list.appendChild(row);
  }
}

/* ============================================================
   TAB 2: 3x3 GRID (DIRECT CANVAS PAINTING + 6 BEVELED PADS)
   ============================================================ */
function initGridPanel() {
  const pads = $('gridPads');
  pads.innerHTML = '';

  for (const fx of GRID_EFFECTS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'grid-pad' + (fx.key === state.activeGridEffect ? ' is-active' : '');
    btn.dataset.gridFx = fx.key;
    btn.innerHTML =
      '<span class="grid-pad-top"><span class="wa-led"></span><span class="grid-pad-count" data-cnt="' + fx.key + '">0 of 9</span></span>' +
      '<span class="grid-pad-name">' + fx.name + '</span>';
    btn.addEventListener('click', () => {
      state.activeGridEffect = fx.key;
      syncGridUI();
      updateLcdTicker();
    });
    bindTip(btn, 'grid:' + fx.key);
    pads.appendChild(btn);
  }

  gridOverlay.innerHTML = '';
  let paintVal = null;
  window.addEventListener('pointerup', () => { paintVal = null; });

  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'grid-cell';
    cell.dataset.cellIdx = String(i);
    cell.innerHTML = '<span class="cell-coord">' + CELL_COORDS[i] + '</span><span class="cell-pip"></span>';
    cell.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pushUndoSnapshot();
      const fx = state.activeGridEffect;
      const next = !state.gridStates[fx][i];
      paintVal = next;
      setGridCell(fx, i, next);
    });
    cell.addEventListener('pointerenter', () => {
      if (paintVal !== null) setGridCell(state.activeGridEffect, i, paintVal);
    });
    gridOverlay.appendChild(cell);
  }

  $('gridClearZoneBtn').addEventListener('click', () => {
    pushUndoSnapshot();
    state.gridStates[state.activeGridEffect].fill(false);
    syncGridUI();
    redrawCanvasImmediate();
  });

  $('gridClearAllBtn').addEventListener('click', () => {
    pushUndoSnapshot();
    for (const fx of GRID_EFFECTS) state.gridStates[fx.key].fill(false);
    syncGridUI();
    redrawCanvasImmediate();
    showToast('Cleared all grid layers');
  });

  $('gridRandomBtn').addEventListener('click', () => {
    pushUndoSnapshot();
    const fx = state.activeGridEffect;
    let any = false;
    for (let i = 0; i < 9; i++) {
      const on = Math.random() > 0.62;
      state.gridStates[fx][i] = on;
      if (on) any = true;
    }
    if (!any) state.gridStates[fx][Math.floor(Math.random() * 9)] = true;
    syncGridUI();
    redrawCanvasImmediate();
  });

  bindTip($('gridClearZoneBtn'), 'btn:gridClear');
  bindTip($('gridClearAllBtn'), 'btn:gridClear');
  bindTip($('gridRandomBtn'), 'btn:gridRand');

  syncGridUI();
}

function setGridCell(fxKey, idx, val) {
  if (state.gridStates[fxKey][idx] === val) return;
  state.gridStates[fxKey][idx] = val;
  syncGridUI();
  scheduleRender();
}

function syncGridUI() {
  let activeCount = 0;
  document.querySelectorAll('#gridPads .grid-pad').forEach((btn) => {
    const k = btn.dataset.gridFx;
    const count = state.gridStates[k].filter(Boolean).length;
    if (k === state.activeGridEffect) activeCount = count;
    const isSelected = k === state.activeGridEffect;
    btn.classList.toggle('is-active', isSelected);
    btn.querySelector('[data-cnt]').textContent = count + ' of 9';
    const led = btn.querySelector('.wa-led');
    if (led) {
      led.classList.toggle('is-on', isSelected || count > 0);
      led.classList.toggle('is-amber', !isSelected && count > 0);
    }
  });
  $('gridTotalCount').textContent = activeCount + ' of 9';

  const cells = gridOverlay.children;
  for (let i = 0; i < 9; i++) {
    const activeHere = state.gridStates[state.activeGridEffect][i];
    let anyOther = false;
    for (const fx of GRID_EFFECTS) {
      if (fx.key !== state.activeGridEffect && state.gridStates[fx.key][i]) { anyOther = true; break; }
    }
    if (cells[i]) {
      cells[i].classList.toggle('is-active', activeHere);
      cells[i].classList.toggle('has-other', anyOther);
    }
  }
}


function captureCanvasToHex() {
  if (state.hexDecodeFault) redrawCanvasImmediate();
  const bytes = canvasToJpegBytes(photoCanvas, state.hexQuality);
  const parsed = parseJpegStructure(bytes);
  state.hexBaseBytes = new Uint8Array(bytes);
  state.hexBytes = new Uint8Array(bytes);
  state.hexSegments = parsed.segments;
  state.hexScanStart = parsed.scanStart;
  state.hexScanEnd = parsed.scanEnd;
  state.hexModifiedSet.clear();
  state.hexDecodeFault = false;
  state.hexActiveOutput = false;
  hexFaultPlate.classList.remove('is-visible');
  $('hexRepairBanner').hidden = true;

  state.hexSelectedIdx = Math.min(bytes.length - 1, parsed.scanStart);
  const pageSize = getHexPageSize();
  state.hexPage = parsed.scanStart < pageSize ? 0 : Math.floor(state.hexSelectedIdx / pageSize);
  renderHexSheet();
  syncHexLockUI();
  updateLcdTicker();
}

function recomputeHexModifiedSet() {
  state.hexModifiedSet.clear();
  if (!state.hexBytes || !state.hexBaseBytes) return;
  const len = Math.min(state.hexBytes.length, state.hexBaseBytes.length);
  for (let i = 0; i < len; i++) {
    if (state.hexBytes[i] !== state.hexBaseBytes[i]) state.hexModifiedSet.add(i);
  }
}

function isByteEditable(idx) {
  if (!state.hexBytes || idx < 0 || idx >= state.hexBytes.length) return false;
  if (!state.hexHeaderLocked) return true;
  return idx >= state.hexScanStart && idx < state.hexScanEnd;
}

function writeSingleHexByte(idx, val) {
  if (!state.hexBytes || idx < 0 || idx >= state.hexBytes.length) return false;
  if (!isByteEditable(idx)) { showToast('Header Lock is ON'); return false; }
  const clean = val & 0xFF;
  if (state.hexBytes[idx] === clean) return true;
  pushUndoSnapshot();
  state.hexBytes[idx] = clean;
  if (state.hexBaseBytes && state.hexBaseBytes[idx] !== clean) state.hexModifiedSet.add(idx);
  else state.hexModifiedSet.delete(idx);
  decodeHexBytesToCanvas();
  renderHexSheet();
  updateLcdTicker();
  return true;
}

function decodeHexBytesToCanvas() {
  if (!state.hexBytes) return;
  const blob = new Blob([state.hexBytes], { type: 'image/jpeg' });
  const url = URL.createObjectURL(blob);
  if (state.hexLastObjectUrl) URL.revokeObjectURL(state.hexLastObjectUrl);
  state.hexLastObjectUrl = url;

  const img = new Image();
  img.onload = () => {
    state.hexDecodeFault = false;
    state.hexActiveOutput = true;
    hexFaultPlate.classList.remove('is-visible');
    $('hexRepairBanner').hidden = true;
    photoCtx.drawImage(img, 0, 0, photoCanvas.width, photoCanvas.height);
    state.audioStale = true;
    sampleImageHistogram(photoCtx.getImageData(0, 0, photoCanvas.width, photoCanvas.height));
  };
  img.onerror = () => {
    state.hexDecodeFault = true;
    hexFaultPlate.classList.add('is-visible');
    $('hexRepairBanner').hidden = false;
  };
  img.src = url;
}

function isMarkerSafeAt(bytes, idx) {
  if (!state.hexHeaderLocked) return true;
  if (bytes[idx] === 0xFF) return false;
  if (idx > 0 && bytes[idx - 1] === 0xFF) return false;
  return true;
}

function runHexOperator(op) {
  if (!state.hexBytes) captureCanvasToHex();
  const bytes = state.hexBytes;
  const start = state.hexHeaderLocked ? Math.min(bytes.length - 1, state.hexScanStart + 4) : 0;
  const end = state.hexHeaderLocked ? Math.max(start + 1, state.hexScanEnd - 4) : bytes.length;
  const span = end - start;
  if (span < 8) return;

  pushUndoSnapshot();
  let firstTouch = start;

  if (op === 'transpose') {
    const chunkLen = Math.max(8, Math.min(Math.floor(span / 6), 36));
    const a = start + Math.floor(Math.random() * Math.max(1, span - chunkLen * 2));
    const b = start + Math.floor(Math.random() * Math.max(1, span - chunkLen));
    firstTouch = a;
    for (let k = 0; k < chunkLen; k++) {
      if (isMarkerSafeAt(bytes, a + k) && isMarkerSafeAt(bytes, b + k)) {
        const tmp = bytes[a + k]; bytes[a + k] = bytes[b + k]; bytes[b + k] = tmp;
      }
    }
  } else if (op === 'invert') {
    const count = 12;
    const pos = start + Math.floor(Math.random() * Math.max(1, span - count));
    firstTouch = pos;
    for (let k = 0; k < count; k++) {
      const idx = pos + k;
      if (idx < end && isMarkerSafeAt(bytes, idx)) {
        let v = (bytes[idx] ^ 0xFF) & 0xFF;
        if (state.hexHeaderLocked && v === 0xFF) v = 0xFE;
        bytes[idx] = v;
      }
    }
  } else if (op === 'smear') {
    const patLen = 5, total = Math.min(span - 4, 80);
    const pos = start + Math.floor(Math.random() * Math.max(1, span - total));
    firstTouch = pos;
    const pat = [];
    for (let p = 0; p < patLen; p++) {
      let v = bytes[pos + p];
      if (state.hexHeaderLocked && v === 0xFF) v = 0x7E;
      pat.push(v);
    }
    for (let k = 0; k < total; k++) {
      const idx = pos + k;
      if (isMarkerSafeAt(bytes, idx)) bytes[idx] = pat[k % patLen];
    }
  }

  recomputeHexModifiedSet();
  state.hexSelectedIdx = firstTouch;
  state.hexPage = Math.floor(firstTouch / getHexPageSize());
  decodeHexBytesToCanvas();
  renderHexSheet();
  const selCell = $('hexRows').querySelector('.hx-b.is-sel');
  if (selCell) selCell.scrollIntoView({ block: 'center' });
  updateLcdTicker();
}

function repairHexHeader() {
  if (!state.hexBytes || !state.hexBaseBytes) return;
  pushUndoSnapshot();
  for (let i = 0; i < state.hexScanStart && i < state.hexBytes.length; i++) state.hexBytes[i] = state.hexBaseBytes[i];
  for (let i = state.hexScanEnd; i < state.hexBytes.length; i++) state.hexBytes[i] = state.hexBaseBytes[i];
  for (let i = state.hexScanStart; i < state.hexScanEnd - 1; i++) {
    if (state.hexBytes[i] === 0xFF && state.hexBaseBytes[i] !== 0xFF) state.hexBytes[i] = 0xFE;
  }
  recomputeHexModifiedSet();
  decodeHexBytesToCanvas();
  renderHexSheet();
  updateLcdTicker();
  showToast('JPEG header repaired');
}

function resetHexStream() {
  if (!state.hexBaseBytes) return;
  pushUndoSnapshot();
  state.hexBytes = new Uint8Array(state.hexBaseBytes);
  state.hexModifiedSet.clear();
  decodeHexBytesToCanvas();
  renderHexSheet();
  updateLcdTicker();
  showToast('Hex bytes reset');
}

function syncHexLockUI() {
  const btn = $('hexLockBtn');
  const led = $('hexLockLed');
  btn.setAttribute('aria-pressed', String(state.hexHeaderLocked));
  led.classList.toggle('is-on', state.hexHeaderLocked);
  led.classList.toggle('is-amber', !state.hexHeaderLocked);
  $('hexLockLabel').textContent = state.hexHeaderLocked ? 'Header Lock: ON' : 'Header Lock: OFF';
}

function renderHexSheet() {
  const rowsEl = $('hexRows');
  const cols = getHexCols();
  const pageSize = cols * HEX_ROWS_PER_PAGE;
  state.lastHexCols = cols;

  const frameEl = $('hexSheetFrame');
  if (frameEl) frameEl.classList.toggle('is-cols-4', cols === 4);
  const colHeadEl = $('hexColBytes');
  if (colHeadEl && colHeadEl.children.length !== cols) {
    let html = '';
    for (let c = 0; c < cols; c++) html += '<span>0' + c + '</span>';
    colHeadEl.innerHTML = html;
  }

  if (!state.hexBytes) { rowsEl.innerHTML = ''; return; }
  const bytes = state.hexBytes;
  const totalPages = Math.max(1, Math.ceil(bytes.length / pageSize));
  state.hexPage = Math.max(0, Math.min(totalPages - 1, state.hexPage));
  const startByte = state.hexPage * pageSize;
  const endByte = Math.min(bytes.length, startByte + pageSize);

  const frag = document.createDocumentFragment();
  for (let rowOff = startByte; rowOff < endByte; rowOff += cols) {
    const row = document.createElement('div');
    row.className = 'hex-row';

    const off = document.createElement('span');
    off.className = 'hex-off';
    off.textContent = rowOff.toString(16).toUpperCase().padStart(6, '0');
    row.appendChild(off);

    const cells = document.createElement('div');
    cells.className = 'hex-cells';
    let ascii = '';

    for (let c = 0; c < cols; c++) {
      const idx = rowOff + c;
      const cell = document.createElement('span');
      if (idx < bytes.length) {
        const val = bytes[idx];
        const isProtected = idx < state.hexScanStart || idx >= state.hexScanEnd;
        let cls = 'hx-b';
        if (isProtected) cls += ' is-protected';
        if (state.hexModifiedSet.has(idx)) cls += ' is-mod';
        if (idx === state.hexSelectedIdx) cls += ' is-sel';
        cell.className = cls;
        cell.dataset.idx = String(idx);
        cell.textContent = (idx === state.hexSelectedIdx && state.hexEditNibble)
          ? (state.hexEditNibble + '_')
          : val.toString(16).toUpperCase().padStart(2, '0');
        ascii += (val >= 32 && val <= 126) ? String.fromCharCode(val) : '.';
      } else {
        cell.className = 'hx-b';
        cell.textContent = '  ';
        ascii += ' ';
      }
      cells.appendChild(cell);
    }
    row.appendChild(cells);

    const asc = document.createElement('span');
    asc.className = 'hex-ascii';
    asc.textContent = ascii;
    row.appendChild(asc);

    frag.appendChild(row);
  }

  rowsEl.innerHTML = '';
  rowsEl.appendChild(frag);

  $('hexPageNum').textContent = (state.hexPage + 1) + '/' + totalPages;
  $('hexPrevPage').disabled = state.hexPage <= 0;
  $('hexNextPage').disabled = state.hexPage >= totalPages - 1;

  const selIdx = Math.max(0, Math.min(bytes.length - 1, state.hexSelectedIdx));
  $('hexSelAddr').textContent = '0x' + selIdx.toString(16).toUpperCase().padStart(4, '0');
  const byteInput = $('hexByteInput');
  if (document.activeElement !== byteInput) {
    byteInput.value = bytes[selIdx].toString(16).toUpperCase().padStart(2, '0');
  }
}

function stepHexSelection(delta) {
  if (!state.hexBytes) return;
  state.hexSelectedIdx = Math.max(0, Math.min(state.hexBytes.length - 1, state.hexSelectedIdx + delta));
  state.hexPage = Math.floor(state.hexSelectedIdx / getHexPageSize());
  state.hexEditNibble = '';
  renderHexSheet();
  showHexByteNote(state.hexSelectedIdx, true);
}

function initHexPanel() {
  $('hexLockBtn').addEventListener('click', () => {
    state.hexHeaderLocked = !state.hexHeaderLocked;
    syncHexLockUI();
    showToast(state.hexHeaderLocked ? 'Header Lock ON' : 'Header Lock OFF');
  });

  $('hexTransposeBtn').addEventListener('click', () => runHexOperator('transpose'));
  $('hexInvertBtn').addEventListener('click', () => runHexOperator('invert'));
  $('hexSmearBtn').addEventListener('click', () => runHexOperator('smear'));
  $('hexResetBtn').addEventListener('click', resetHexStream);
  $('hexRepairBanner').addEventListener('click', repairHexHeader);
  $('faultRepairBtn').addEventListener('click', repairHexHeader);
  $('faultUndoBtn').addEventListener('click', performUndo);

  bindTip($('hexLockBtn'), 'hex:lock');
  bindTip($('hexTransposeBtn'), 'hex:transpose');
  bindTip($('hexInvertBtn'), 'hex:invert');
  bindTip($('hexSmearBtn'), 'hex:smear');
  bindTip($('hexResetBtn'), 'hex:reset');
  bindTip($('hexRepairBanner'), 'hex:repair');

  const rowsEl = $('hexRows');
  rowsEl.addEventListener('click', (e) => {
    const cell = e.target.closest('.hx-b[data-idx]');
    if (!cell) return;
    state.hexSelectedIdx = parseInt(cell.dataset.idx, 10);
    state.hexEditNibble = '';
    renderHexSheet();
    showHexByteNote(state.hexSelectedIdx, true);
    rowsEl.focus();
  });

  let lastHoverIdx = -1;
  rowsEl.addEventListener('mousemove', (e) => {
    const cell = e.target.closest('.hx-b[data-idx]');
    if (!cell || !state.hexBytes) { hexScanline.classList.remove('is-visible'); return; }
    const idx = parseInt(cell.dataset.idx, 10);
    if (idx !== lastHoverIdx) { lastHoverIdx = idx; showHexByteNote(idx, false); }
    if (idx >= state.hexScanStart && idx < state.hexScanEnd) {
      const ratio = (idx - state.hexScanStart) / Math.max(1, state.hexScanEnd - state.hexScanStart);
      hexScanline.style.top = (ratio * 100).toFixed(2) + '%';
      hexScanline.classList.add('is-visible');
    } else {
      hexScanline.classList.remove('is-visible');
    }
  });

  rowsEl.addEventListener('mouseleave', () => {
    lastHoverIdx = -1;
    hexScanline.classList.remove('is-visible');
    resetLearningDeferred();
  });

  rowsEl.addEventListener('keydown', (e) => {
    if (!state.hexBytes) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); stepHexSelection(1); return; }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); stepHexSelection(-1); return; }
    if (e.key === 'ArrowDown')  { e.preventDefault(); stepHexSelection(getHexCols()); return; }
    if (e.key === 'ArrowUp')    { e.preventDefault(); stepHexSelection(-getHexCols()); return; }
    if (e.key === 'Escape')     { state.hexEditNibble = ''; renderHexSheet(); return; }

    if (/^[0-9a-fA-F]$/.test(e.key)) {
      e.preventDefault();
      if (!isByteEditable(state.hexSelectedIdx)) { showToast('Header Lock is ON'); return; }
      const ch = e.key.toUpperCase();
      if (!state.hexEditNibble) { state.hexEditNibble = ch; renderHexSheet(); }
      else {
        const val = parseInt(state.hexEditNibble + ch, 16);
        state.hexEditNibble = '';
        const idx = state.hexSelectedIdx;
        if (writeSingleHexByte(idx, val) && idx + 1 < state.hexBytes.length) stepHexSelection(1);
      }
    }
  });

  const byteInput = $('hexByteInput');
  const commitByte = () => {
    const raw = (byteInput.value || '').trim();
    if (/^[0-9a-fA-F]{1,2}$/.test(raw)) writeSingleHexByte(state.hexSelectedIdx, parseInt(raw, 16));
    else showToast('Enter a hex byte from 00 to FF');
  };
  $('hexApplyBtn').addEventListener('click', commitByte);
  byteInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); commitByte(); } });

  $('hexPrevPage').addEventListener('click', () => { state.hexPage = Math.max(0, state.hexPage - 1); renderHexSheet(); });
  $('hexNextPage').addEventListener('click', () => { state.hexPage++; renderHexSheet(); });
}

/* ============================================================
   REUSABLE HORIZONTAL WINAMP METALLIC GROOVE SLIDER
   ============================================================ */
function bindHorizontalGroove(el, cfg) {
  let val = cfg.value;
  function setVisual(v) {
    val = Math.max(cfg.min, Math.min(cfg.max, cfg.step ? Math.round(v / cfg.step) * cfg.step : v));
    const ratio = (val - cfg.min) / Math.max(0.0001, cfg.max - cfg.min);
    const pct = ratio * 100;
    el.style.setProperty('--val-pct', pct.toFixed(2) + '%');
    el.style.setProperty('--val-ratio', ratio.toFixed(4));
    el.setAttribute('aria-valuenow', String(Math.round(val)));
    if (cfg.onVisual) cfg.onVisual(val, pct);
  }

  function updateFromX(clientX) {
    const r = el.getBoundingClientRect();
    if (r.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const next = cfg.min + ratio * (cfg.max - cfg.min);
    const rounded = cfg.step ? Math.round(next / cfg.step) * cfg.step : next;
    if (rounded !== val || cfg.alwaysFire) {
      setVisual(rounded);
      if (cfg.onChange) cfg.onChange(val);
    }
  }

  let dragging = false;
  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    try { el.setPointerCapture(e.pointerId); } catch (_) {}
    updateFromX(e.clientX);
  });
  el.addEventListener('pointermove', (e) => { if (dragging) updateFromX(e.clientX); });
  const stop = (e) => {
    if (!dragging) return;
    dragging = false;
    try { el.releasePointerCapture(e.pointerId); } catch (_) {}
    if (cfg.onCommit) cfg.onCommit(val);
  };
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);

  el.addEventListener('keydown', (e) => {
    const st = cfg.step || 1;
    let next = val;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next += st;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next -= st;
    else if (e.key === 'Home') next = cfg.min;
    else if (e.key === 'End') next = cfg.max;
    else return;
    e.preventDefault();
    next = Math.max(cfg.min, Math.min(cfg.max, next));
    if (next !== val) {
      setVisual(next);
      if (cfg.onChange) cfg.onChange(val);
      if (cfg.onCommit) cfg.onCommit(val);
    }
  });

  setVisual(val);
  return { setVisual, getValue: () => val };
}

/* ============================================================
   TAB 4: GIF EXPORT PANEL
   ============================================================ */
function initGifPanel() {
  bindHorizontalGroove($('gifFramesGroove'), {
    min: 6, max: 20, step: 1, value: state.gifFramesCount,
    onVisual(v) { $('gifFramesVal').textContent = String(v); },
    onChange(v) {
      state.gifFramesCount = v;
      $('gifLcdStatus').textContent = v + ' frames at ' + state.gifFps + ' FPS';
      updateLcdTicker();
    },
    onCommit() { if (state.mode === 'gif') buildAndPlayGifLoop(); }
  });

  bindHorizontalGroove($('gifFpsGroove'), {
    min: 4, max: 20, step: 1, value: state.gifFps,
    onVisual(v) { $('gifFpsVal').textContent = v + ' FPS'; },
    onChange(v) {
      state.gifFps = v;
      $('gifLcdStatus').textContent = state.gifFramesCount + ' frames at ' + v + ' FPS';
      updateLcdTicker();
      if (state.gifPlaying) startGifPreview();
    }
  });

  bindTip($('gifFramesRow'), 'gif:frames');
  bindTip($('gifFpsRow'), 'gif:fps');

  document.querySelectorAll('#gifModes .gif-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.gifMode = btn.dataset.gifMode;
      document.querySelectorAll('#gifModes .gif-mode-btn').forEach((b) => {
        const act = b === btn;
        b.classList.toggle('is-active', act);
        const led = b.querySelector('.wa-led');
        if (led) led.classList.toggle('is-on', act);
      });
      updateLcdTicker();
      buildAndPlayGifLoop();
    });
    bindTip(btn, 'gif:' + btn.dataset.gifMode);
  });

  $('gifPreviewBtn').addEventListener('click', () => {
    if (state.gifPlaying) stopGifPreview();
    else if (state.gifFrames.length > 0) startGifPreview();
    else buildAndPlayGifLoop();
  });

  $('exportGifBtn').addEventListener('click', encodeAndDownloadGif);
  bindTip($('exportGifBtn'), 'gif:export');
}

async function buildAndPlayGifLoop() {
  const seq = ++state.gifBuildSeq;
  stopGifPreview();
  $('gifLcdStatus').textContent = 'Building ' + state.gifFramesCount + ' frames...';
  $('gifLcdBar').style.width = '10%';

  const count = state.gifFramesCount;
  const aspect = state.sourceCanvas.width / Math.max(1, state.sourceCanvas.height);
  const fw = Math.min(state.gifResCap, state.sourceCanvas.width);
  const fh = Math.max(32, Math.round(fw / aspect));

  const workCanvas = document.createElement('canvas');
  workCanvas.width = fw; workCanvas.height = fh;
  const wctx = workCanvas.getContext('2d', { willReadFrequently: true });

  let driftBase = null, driftStart = 0, driftEnd = 0;
  if (state.gifMode === 'drift') {
    wctx.drawImage(state.sourceCanvas, 0, 0, fw, fh);
    const baseData = wctx.getImageData(0, 0, fw, fh);
    if (state.eqEnabled) applyClassicEffects(baseData, state.classic);
    applySpatialGridEffects(baseData, state.gridStates, 1.0);
    wctx.putImageData(baseData, 0, 0);
    driftBase = canvasToJpegBytes(workCanvas, 0.70);
    const parsed = parseJpegStructure(driftBase);
    driftStart = parsed.scanStart + 4;
    driftEnd = Math.max(driftStart + 16, parsed.scanEnd - 4);
  }

  const hasClassic = CLASSIC_EFFECTS.some((fx) => (state.classic[fx.key] | 0) > 0);
  const peak = hasClassic ? state.classic : {
    bitShift: 34, dataOffset: 42, rgbSplit: 24, scanlines: 56, pathSort: 40, seedGrowth: 0, pixelSort: 145
  };

  const built = [];
  for (let f = 0; f < count; f++) {
    if (seq !== state.gifBuildSeq) return;
    const phase = f / count;
    const tri = 1 - Math.abs(phase * 2 - 1);
    const sine = (Math.sin(phase * Math.PI * 2 - Math.PI / 2) + 1) * 0.5;

    if (state.gifMode === 'drift' && driftBase) {
      const mut = new Uint8Array(driftBase);
      const span = driftEnd - driftStart;
      const winStart = driftStart + Math.floor(phase * Math.max(1, span - 24));
      const burst = 6 + Math.floor(sine * 14);
      for (let b = 0; b < burst; b++) {
        const idx = winStart + ((b * 7) % Math.max(1, span - 1));
        if (idx > driftStart && idx < driftEnd && mut[idx] !== 0xFF && mut[idx - 1] !== 0xFF) {
          let v = (mut[idx] ^ (0x3A + ((f * 29 + b * 13) & 0x7F))) & 0xFF;
          if (v === 0xFF) v = 0xFE;
          mut[idx] = v;
        }
      }
      const decoded = await decodeJpegBytesAsync(mut);
      if (seq !== state.gifBuildSeq) return;
      if (decoded) wctx.drawImage(decoded, 0, 0, fw, fh);
      else wctx.drawImage(state.sourceCanvas, 0, 0, fw, fh);
    } else {
      wctx.drawImage(state.sourceCanvas, 0, 0, fw, fh);
      const imgData = wctx.getImageData(0, 0, fw, fh);
      const p = { bitShift: 0, dataOffset: 0, rgbSplit: 0, scanlines: 0, pathSort: 0, seedGrowth: 0, pixelSort: 0 };

      if (state.gifMode === 'sweep') {
        const amp = 0.15 + 0.85 * tri;
        for (const fx of CLASSIC_EFFECTS) p[fx.key] = Math.round((peak[fx.key] || 0) * amp);
      } else if (state.gifMode === 'pulse') {
        p.bitShift   = Math.round((state.classic.bitShift || 0) * sine);
        p.dataOffset = Math.round(Math.max(18, state.classic.dataOffset || 28) * sine);
        p.rgbSplit   = Math.round(Math.max(14, state.classic.rgbSplit || 26) * (0.2 + 0.8 * sine));
        p.scanlines  = Math.round(Math.max(24, state.classic.scanlines || 52) * (0.35 + 0.65 * sine));
        p.pathSort   = Math.round((state.classic.pathSort || 26) * sine);
        p.seedGrowth = Math.round((state.classic.seedGrowth || 0) * sine);
        p.pixelSort  = Math.round((state.classic.pixelSort || 110) * sine);
      } else if (state.gifMode === 'strobe') {
        const hit = (f % 3 === 0) ? 1.0 : ((f % 2 === 0) ? 0.55 : 0.12);
        p.bitShift   = Math.round((state.classic.bitShift || 52) * hit);
        p.dataOffset = Math.round((state.classic.dataOffset || 68) * hit);
        p.rgbSplit   = Math.round((state.classic.rgbSplit || 34) * hit);
        p.scanlines  = Math.round(Math.max(20, state.classic.scanlines || 64) * (0.3 + 0.7 * hit));
        p.pathSort   = Math.round((state.classic.pathSort || 0) * hit);
        p.seedGrowth = Math.round((state.classic.seedGrowth || 0) * hit);
        p.pixelSort  = Math.round((state.classic.pixelSort || 165) * hit);
      }

      applyClassicEffects(imgData, p);
      applySpatialGridEffects(imgData, state.gridStates, phase * Math.PI * 2);
      wctx.putImageData(imgData, 0, 0);
    }

    built.push({ width: fw, height: fh, imageData: wctx.getImageData(0, 0, fw, fh) });
    $('gifLcdBar').style.width = Math.round(((f + 1) / count) * 100) + '%';
    await new Promise((r) => requestAnimationFrame(r));
  }

  if (seq !== state.gifBuildSeq) return;
  state.gifFrames = built;
  $('gifLcdBar').style.width = '0%';
  $('gifLcdStatus').textContent = count + ' frames at ' + state.gifFps + ' FPS - looping';
  if (state.mode === 'gif') startGifPreview();
}

function renderGifFrameToStage(idx) {
  const f = state.gifFrames[idx];
  if (!f) return;
  state.gifPlayIdx = idx;
  const tmp = document.createElement('canvas');
  tmp.width = f.width; tmp.height = f.height;
  tmp.getContext('2d').putImageData(f.imageData, 0, 0);
  photoCtx.drawImage(tmp, 0, 0, photoCanvas.width, photoCanvas.height);
}

function startGifPreview() {
  if (state.gifFrames.length === 0) return;
  stopGifPreview();
  state.gifPlaying = true;
  $('gifPreviewBtn').textContent = 'Pause Preview';
  renderGifFrameToStage(state.gifPlayIdx % state.gifFrames.length);
  state.gifTimer = setInterval(() => {
    if (!state.gifPlaying || state.gifFrames.length === 0) return;
    state.gifPlayIdx = (state.gifPlayIdx + 1) % state.gifFrames.length;
    renderGifFrameToStage(state.gifPlayIdx);
  }, Math.round(1000 / Math.max(1, state.gifFps)));
}

function stopGifPreview() {
  state.gifPlaying = false;
  $('gifPreviewBtn').textContent = 'Play Preview';
  if (state.gifTimer) { clearInterval(state.gifTimer); state.gifTimer = null; }
}

async function encodeAndDownloadGif() {
  const btn = $('exportGifBtn');
  const bar = $('gifLcdBar');
  const st = $('gifLcdStatus');
  btn.disabled = true;
  bar.style.width = '24%';
  st.textContent = 'Encoding GIF89a...';
  try {
    if (state.gifFrames.length !== state.gifFramesCount || state.gifFrames.length === 0) {
      await buildAndPlayGifLoop();
    }
    if (state.gifFrames.length === 0) return;
    bar.style.width = '64%';
    await new Promise((r) => requestAnimationFrame(r));

    const gifBytes = encodeGif89a(state.gifFrames, state.gifFps);
    state.gifLastBytes = gifBytes;
    bar.style.width = '100%';
    const kb = Math.round(gifBytes.length / 1024);
    st.textContent = 'Exported ' + kb + ' KB - ' + state.gifFrames.length + ' frames';
    triggerBlobDownload(new Blob([gifBytes], { type: 'image/gif' }), 'bent-pixel-5-' + state.gifMode + '-' + timestampStamp() + '.gif');
    showToast('Exported GIF (' + kb + ' KB)');
  } finally {
    setTimeout(() => { bar.style.width = '0%'; btn.disabled = false; }, 450);
  }
}

/* ============================================================
   AUDIO-ONLY WEB AUDIO SONIFIER (STOP NEVER TOUCHES ARTWORK!)
   ============================================================ */
function ensureAudioContext() {
  if (!state.audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    state.audioCtx = new AC();
    state.audioAnalyser = state.audioCtx.createAnalyser();
    state.audioAnalyser.fftSize = 128;
    state.audioAnalyser.smoothingTimeConstant = 0.72;
    state.audioFreqBuf = new Uint8Array(state.audioAnalyser.frequencyBinCount);
    state.audioTimeBuf = new Uint8Array(state.audioAnalyser.fftSize);

    state.audioGain = state.audioCtx.createGain();
    state.audioGain.gain.value = state.muted ? 0 : state.volume * 0.65;
    state.audioAnalyser.connect(state.audioGain);
    state.audioGain.connect(state.audioCtx.destination);
  }
  return state.audioCtx;
}

function buildAudioBuffer() {
  const buffer = synthesizeImageAudioBuffer(photoCanvas, (ch, len, sr) => ensureAudioContext().createBuffer(ch, len, sr));
  state.audioBuffer = buffer;
  state.audioStale = false;
  return buffer;
}

function exportAudioWav() {
  if (!state.audioBuffer || state.audioStale) buildAudioBuffer();
  if (!state.audioBuffer) return null;
  const wavBytes = encodeAudioBufferToWav(state.audioBuffer);
  state.lastWavBytes = wavBytes;
  const blob = new Blob([wavBytes], { type: 'audio/wav' });
  triggerBlobDownload(blob, 'bent-pixel-sound-' + timestampStamp() + '.wav');
  const mb = (wavBytes.length / (1024 * 1024)).toFixed(1);
  const dur = (state.audioBuffer.duration || 6.0).toFixed(1);
  showToast('Exported WAV (' + mb + ' MB, ' + dur + 's)');
  return wavBytes;
}

async function startAudioPlayback(fromSec) {
  const ctx = ensureAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();
  if (!state.audioBuffer || state.audioStale) buildAudioBuffer();

  if (state.audioSource) {
    const old = state.audioSource; state.audioSource = null;
    try { old.stop(); } catch (_) {}
  }

  const offset = Math.max(0, Math.min(state.audioBuffer.duration - 0.05, typeof fromSec === 'number' ? fromSec : state.audioOffsetSec));
  const src = ctx.createBufferSource();
  src.buffer = state.audioBuffer;
  src.connect(state.audioAnalyser);
  src.onended = () => {
    if (state.audioSource === src) {
      state.audioSource = null;
      state.audioPlaying = false;
      state.audioOffsetSec = 0;
      $('lcdTimer').textContent = '00:00';
      if (audioSeekCtrl) audioSeekCtrl.setVisual(0);
      syncAudioUI();
      updateLcdTicker();
    }
  };
  src.start(0, offset);
  state.audioSource = src;
  state.audioOffsetSec = offset;
  state.audioStartCtxTime = ctx.currentTime;
  state.audioPlaying = true;
  syncAudioUI();
  updateLcdTicker();
}

function pauseAudioPlayback() {
  if (!state.audioPlaying) return;
  if (state.audioCtx && state.audioBuffer) {
    state.audioOffsetSec = Math.min(state.audioBuffer.duration - 0.05, (state.audioCtx.currentTime - state.audioStartCtxTime) + state.audioOffsetSec);
  }
  if (state.audioSource) {
    const old = state.audioSource; state.audioSource = null;
    try { old.stop(); } catch (_) {}
  }
  state.audioPlaying = false;
  syncAudioUI();
  updateLcdTicker();
}

function stopAudioPlayback() {
  // STRICTLY ONLY stops audio! NEVER modifies artwork sliders or effects!
  if (state.audioSource) {
    const old = state.audioSource; state.audioSource = null;
    try { old.stop(); } catch (_) {}
  }
  state.audioPlaying = false;
  state.audioOffsetSec = 0;
  $('lcdTimer').textContent = '00:00';
  if (audioSeekCtrl) audioSeekCtrl.setVisual(0);
  syncAudioUI();
  updateLcdTicker();
}

function syncAudioUI() {
  $('btnPlayPause').classList.toggle('is-playing-now', state.audioPlaying);
  $('playPauseIcon').innerHTML = state.audioPlaying
    ? '<rect x="2.6" y="2.2" width="2.4" height="7.6"/><rect x="7" y="2.2" width="2.4" height="7.6"/>'
    : '<path d="M2.6 1.8L10.4 6 2.6 10.2z"/>';
  $('lcdPlayGlyph').innerHTML = state.audioPlaying ? '&#9654;' : '&#9632;';
  $('audioStateLbl').textContent = state.audioPlaying ? 'Playing' : (state.audioOffsetSec > 0 ? 'Paused' : 'Ready');
  if (!state.audioPlaying) $('audioPlayhead').classList.remove('is-visible');
}

/* ============================================================
   INTERACTIVE JPEG STRIP JUMP, CLIPBOARD, HASH & LLAMA SECRET
   ============================================================ */
function jumpHexToJpegSection(part) {
  setMode('hex');
  if (!state.hexBytes) captureCanvasToHex();
  const segs = state.hexSegments;
  let targetIdx = 0;
  let scanPct = 0;

  if (part === 'hdr') {
    targetIdx = 0;
    scanPct = 2;
  } else if (part === 'tbl') {
    targetIdx = 2;
    if (segs) {
      for (let i = 0; i < segs.length; i++) {
        if (segs[i] === SEG_DQT || segs[i] === SEG_DHT) { targetIdx = i; break; }
      }
    }
    scanPct = 10;
  } else if (part === 'data') {
    targetIdx = Math.min(state.hexBytes.length - 1, state.hexScanStart + 16);
    scanPct = 42;
  } else if (part === 'end') {
    targetIdx = Math.max(0, state.hexScanEnd);
    scanPct = 97;
  }

  state.hexSelectedIdx = targetIdx;
  state.hexPage = Math.floor(targetIdx / getHexPageSize());
  renderHexSheet();
  const selCell = $('hexRows').querySelector('.hx-b.is-sel');
  if (selCell) selCell.scrollIntoView({ block: 'center' });
  showHexByteNote(targetIdx, true);

  hexScanline.style.top = scanPct + '%';
  hexScanline.classList.add('is-visible');
  showToast('Jumped to ' + (part === 'hdr' ? 'Header (FF D8)' : part === 'tbl' ? 'Tables (DQT/DHT)' : part === 'data' ? 'Picture Scan Data' : 'End Marker (FF D9)'));
}

async function copyImageToClipboard() {
  try {
    const blob = await new Promise((res) => photoCanvas.toBlob(res, 'image/png'));
    if (blob && navigator.clipboard && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('Copied PNG to clipboard');
      return true;
    }
  } catch (_) {}
  showToast('Clipboard write unavailable in this browser');
  return false;
}

function encodeEqHash() {
  const vals = CLASSIC_EFFECTS.map((fx) => state.classic[fx.key] | 0);
  return '#eq=' + vals.join(',');
}

function applyEqFromUrlHash(hashStr) {
  const raw = typeof hashStr === 'string' ? hashStr : window.location.hash;
  const match = (raw || '').match(/#eq=([0-9,\s]+)/);
  if (!match) return false;
  const nums = match[1].split(',').map((s) => parseInt(s.trim(), 10));
  if (nums.length !== CLASSIC_EFFECTS.length || nums.some((n) => Number.isNaN(n))) return false;
  CLASSIC_EFFECTS.forEach((fx, i) => {
    const v = Math.max(fx.min, Math.min(fx.max, nums[i]));
    state.classic[fx.key] = v;
    const c = faderControllers.get(fx.key);
    if (c) c.setValue(v);
  });
  state.eqEnabled = true;
  state.activePreset = '';
  syncBypassUI();
  syncPresetHighlight();
  return true;
}

async function copyShareableEqLink() {
  const hash = encodeEqHash();
  try { history.replaceState(null, '', hash); } catch (_) {}
  const url = window.location.href;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      showToast('Copied shareable preset link');
      return url;
    }
  } catch (_) {}
  showToast('Updated URL hash (' + hash + ')');
  return url;
}

function triggerLlamaEasterEgg() {
  llamaUntil = Date.now() + 3600;
  updateLcdTicker();
  for (let i = 0; i < state.peakVals.length; i++) state.peakVals[i] = 0.96;
  showToast("It really bends the llama's pixels");
  setTimeout(() => updateLcdTicker(), 3700);

  if (!state.muted) {
    try {
      const ctx = ensureAudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      const notes = [440, 554.37, 659.25, 880];
      const now = ctx.currentTime;
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.075);
        g.gain.setValueAtTime(0.001, now + idx * 0.075);
        g.gain.linearRampToValueAtTime(0.16 * state.volume, now + idx * 0.075 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.075 + 0.095);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(now + idx * 0.075);
        osc.stop(now + idx * 0.075 + 0.1);
      });
    } catch (_) {}
  }
}

function syncVolumeUI() {
  const effective = state.muted ? 0 : state.volume;
  const pct = Math.round(effective * 100);
  $('volumeGroove').style.setProperty('--val-pct', pct + '%');
  $('volumeGroove').style.setProperty('--val-ratio', effective.toFixed(4));
  $('volumeGroove').setAttribute('aria-valuenow', String(pct));
  const pips = $('volPips').children;
  for (let i = 0; i < pips.length; i++) {
    const threshold = (i + 0.5) / pips.length;
    pips[i].classList.toggle('is-lit', effective >= threshold * 0.9);
  }
  if (state.audioGain) state.audioGain.gain.value = effective * 0.65;
}

/* ============================================================
   MODES, SKINS, MENUS, SAVE & GLOBAL WIRING
   ============================================================ */
function setMode(nextMode) {
  if (!['bend', 'grid', 'hex', 'gif'].includes(nextMode)) return;
  if (state.mode === 'gif' && nextMode !== 'gif') {
    stopGifPreview();
    if (nextMode === 'hex' && state.hexBytes) decodeHexBytesToCanvas();
    else redrawCanvasImmediate();
  }
  state.mode = nextMode;
  desktopStage.dataset.mode = nextMode;
  presetDrawer.hidden = true;
  $('presetsBtn').setAttribute('aria-expanded', 'false');

  document.querySelectorAll('.studio-tab').forEach((btn) => {
    const act = btn.dataset.tab === nextMode;
    btn.classList.toggle('is-active', act);
    btn.setAttribute('aria-selected', String(act));
    const led = btn.querySelector('.wa-led');
    if (led) led.classList.toggle('is-on', act);
  });

  document.querySelectorAll('.studio-pane').forEach((pane) => {
    pane.classList.toggle('is-active', pane.dataset.pane === nextMode);
  });

  $('gifPreviewBtn').hidden = nextMode !== 'gif';

  if (nextMode === 'bend' || nextMode === 'grid') {
    if (state.hexDecodeFault) redrawCanvasImmediate();
    hexScanline.classList.remove('is-visible');
  } else if (nextMode === 'hex') {
    if (!state.hexBytes) captureCanvasToHex();
    else renderHexSheet();
  } else if (nextMode === 'gif') {
    hexScanline.classList.remove('is-visible');
    buildAndPlayGifLoop();
  }

  state.learnSticky = null;
  showLearningKey('mode:' + nextMode, false);
  updateLcdTicker();
  requestAnimationFrame(layoutArtworkFrame);
}

function applySkin(skinName) {
  const clean = VALID_SKINS.includes(skinName) ? skinName : 'silver';
  state.skin = clean;
  if (clean === 'silver') document.documentElement.removeAttribute('data-skin');
  else document.documentElement.setAttribute('data-skin', clean);
  const chkMap = {
    silver: 'chkSilver',
    carbon: 'chkCarbon',
    olive:  'chkOlive',
    amber:  'chkAmber',
    green:  'chkGreen'
  };
  for (const [key, id] of Object.entries(chkMap)) {
    const el = $(id);
    if (el) el.textContent = clean === key ? 'On' : '';
  }
  try { localStorage.setItem(STORAGE_SKIN_KEY, clean); } catch (_) {}
}

function closeAllMenus() {
  $('menuFileDrop').hidden = true;
  $('menuViewDrop').hidden = true;
  $('menuFileBtn').classList.remove('is-open');
  $('menuViewBtn').classList.remove('is-open');
  $('menuFileBtn').setAttribute('aria-expanded', 'false');
  $('menuViewBtn').setAttribute('aria-expanded', 'false');
}

function toggleMenu(btnId, dropId) {
  const drop = $(dropId);
  const willOpen = drop.hidden;
  closeAllMenus();
  photoPopover.hidden = true;
  presetDrawer.hidden = true;
  if (willOpen) {
    drop.hidden = false;
    $(btnId).classList.add('is-open');
    $(btnId).setAttribute('aria-expanded', 'true');
    focusWindow('sound');
  }
}

function setCompareOriginal(active) {
  artworkFrame.classList.toggle('is-peeking', !!active);
  $('compareBtn').classList.toggle('is-pressed', !!active);
}

function timestampStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function saveAsPng() {
  photoCanvas.toBlob((blob) => {
    if (!blob) return;
    triggerBlobDownload(blob, 'bent-pixel-5-' + timestampStamp() + '.png');
    showToast('Saved PNG image');
  }, 'image/png');
}

function saveAsJpg() {
  if (state.hexActiveOutput && state.hexBytes && !state.hexDecodeFault) {
    triggerBlobDownload(new Blob([state.hexBytes], { type: 'image/jpeg' }), 'bent-pixel-5-hex-' + timestampStamp() + '.jpg');
    showToast('Saved mutated JPEG');
    return;
  }
  photoCanvas.toBlob((blob) => {
    if (!blob) return;
    triggerBlobDownload(blob, 'bent-pixel-5-' + timestampStamp() + '.jpg');
    showToast('Saved JPG image');
  }, 'image/jpeg', 0.92);
}

function saveCurrentOutput() {
  if (state.mode === 'gif') { encodeAndDownloadGif(); return; }
  if (state.hexActiveOutput && state.hexBytes && !state.hexDecodeFault) {
    saveAsJpg();
    return;
  }
  saveAsPng();
}

function initGlobalWiring() {
  // Top Studio Mode Tabs
  document.querySelectorAll('.studio-tab[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.tab));
    bindTip(btn, 'mode:' + btn.dataset.tab);
  });

  // Sound Menu Bar (File / View / Guide)
  $('menuFileBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu('menuFileBtn', 'menuFileDrop'); });
  $('menuViewBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu('menuViewBtn', 'menuViewDrop'); });
  $('menuGuideBtn').addEventListener('click', () => { closeAllMenus(); openFieldGuide(true); });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.wa-menu-wrap')) closeAllMenus();
    if (!e.target.closest('#openPhotoBtn') && !e.target.closest('#photoPopover')) {
      photoPopover.hidden = true;
      $('openPhotoBtn').setAttribute('aria-expanded', 'false');
    }
    if (!e.target.closest('#presetsBtn') && !e.target.closest('#presetDrawer')) {
      presetDrawer.hidden = true;
      $('presetsBtn').setAttribute('aria-expanded', 'false');
    }
  });

  $('ddUploadPhoto').addEventListener('click', () => { closeAllMenus(); $('photoInput').click(); });
  document.querySelectorAll('[data-dd-specimen]').forEach((btn) => {
    btn.addEventListener('click', () => { closeAllMenus(); generateSpecimen(parseInt(btn.dataset.ddSpecimen, 10)); });
  });
  $('ddSavePng').addEventListener('click', () => { closeAllMenus(); saveAsPng(); });
  $('ddSaveJpg').addEventListener('click', () => { closeAllMenus(); saveAsJpg(); });
  $('ddCopyImage').addEventListener('click', () => { closeAllMenus(); copyImageToClipboard(); });
  $('ddExportWav').addEventListener('click', () => { closeAllMenus(); exportAudioWav(); });
  $('ddExportGif').addEventListener('click', () => { closeAllMenus(); setMode('gif'); encodeAndDownloadGif(); });

  $('ddSkinSilver').addEventListener('click', () => { closeAllMenus(); applySkin('silver'); showToast('Classic Silver theme'); });
  $('ddSkinCarbon').addEventListener('click', () => { closeAllMenus(); applySkin('carbon'); showToast('Carbon Dark theme'); });
  $('ddSkinOlive').addEventListener('click', () => { closeAllMenus(); applySkin('olive'); showToast('Alpine Olive theme'); });
  $('ddSkinAmber').addEventListener('click', () => { closeAllMenus(); applySkin('amber'); showToast('Amber CRT theme'); });
  $('ddSkinGreen').addEventListener('click', () => { closeAllMenus(); applySkin('green'); showToast('Classic Green theme'); });
  $('ddToggleTips').addEventListener('click', () => { closeAllMenus(); toggleLearningBar(); });
  $('ddResetLayout').addEventListener('click', () => { closeAllMenus(); resetWindowLayout(false); });

  // Canvas Action Bar
  $('openPhotoBtn').addEventListener('click', (e) => { e.stopPropagation(); togglePhotoPopover(); });
  $('photoPopoverClose').addEventListener('click', () => togglePhotoPopover(false));
  $('uploadPhotoBtn').addEventListener('click', () => $('photoInput').click());
  $('photoInput').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) loadUploadedFile(f);
    e.target.value = '';
  });

  $('undoBtn').addEventListener('click', performUndo);
  $('redoBtn').addEventListener('click', performRedo);
  $('saveBtn').addEventListener('click', saveCurrentOutput);

  bindTip($('openPhotoBtn'), 'btn:openPhoto');
  bindTip($('compareBtn'), 'btn:compare');
  bindTip($('undoBtn'), 'btn:undo');
  bindTip($('redoBtn'), 'btn:undo');
  bindTip($('saveBtn'), 'btn:save');

  // Learning Bar & Floating Field Guide
  $('tipsToggleBtn').addEventListener('click', () => toggleLearningBar());
  $('openGuideBtn').addEventListener('click', () => openFieldGuide(true));
  $('guideCloseBtn').addEventListener('click', () => openFieldGuide(false));

  document.querySelectorAll('.guide-folder-tab[data-guide-tab]').forEach((btn) => {
    btn.addEventListener('click', () => selectGuideTab(btn.dataset.guideTab));
  });

  document.querySelectorAll('[data-recipe]').forEach((btn) => {
    btn.addEventListener('click', () => launchGuidedRecipe(btn.dataset.recipe, btn));
  });

  // Interactive Clickable JPEG Strip inside Floating Field Guide
  document.querySelectorAll('[data-jpeg-jump]').forEach((btn) => {
    const part = btn.dataset.jpegJump;
    btn.addEventListener('click', () => jumpHexToJpegSection(part));
    btn.addEventListener('pointerenter', () => {
      const map = { hdr: SEG_SOI, tbl: SEG_DQT, data: SEG_SCAN, end: SEG_EOI };
      const base = JPEG_SEG_NOTES[map[part]];
      if (base) showLearningNote(base, false);
    });
    btn.addEventListener('pointerleave', resetLearningDeferred);
  });

  // Triple-click Sound corner bolt triggers Winamp Llama Easter Egg
  let boltClicks = 0;
  let boltTimer = null;
  $('soundCornerBolt').addEventListener('pointerdown', (e) => e.stopPropagation());
  $('soundCornerBolt').addEventListener('click', (e) => {
    e.stopPropagation();
    boltClicks += 1;
    clearTimeout(boltTimer);
    if (boltClicks >= 3) {
      boltClicks = 0;
      triggerLlamaEasterEgg();
    } else {
      boltTimer = setTimeout(() => { boltClicks = 0; }, 550);
    }
  });

  // Sound Window Audio-Only Controls
  $('spectrumBtn').addEventListener('click', cycleVisStyle);
  bindTip($('spectrumBtn'), 'audio:spectrum');

  $('btnPlayPause').addEventListener('click', () => {
    if (state.audioPlaying) pauseAudioPlayback();
    else startAudioPlayback(state.audioOffsetSec);
  });
  $('btnAudioStop').addEventListener('click', stopAudioPlayback);
  $('saveWavBtn').addEventListener('click', exportAudioWav);
  bindTip($('btnPlayPause'), 'audio:play');
  bindTip($('btnAudioStop'), 'audio:stop');
  bindTip($('saveWavBtn'), 'audio:saveWav');

  audioSeekCtrl = bindHorizontalGroove($('audioSeekGroove'), {
    min: 0, max: 100, step: 0.5, value: 0, alwaysFire: true,
    onChange(v) {
      const dur = state.audioBuffer ? state.audioBuffer.duration : 6.0;
      const sec = (v / 100) * dur;
      $('lcdTimer').textContent = formatMmSs(sec);
      state.audioOffsetSec = sec;
      const ph = $('audioPlayhead');
      if (ph) {
        ph.style.top = v.toFixed(2) + '%';
        if (state.audioPlaying) ph.classList.add('is-visible');
      }
      if (state.audioPlaying) startAudioPlayback(sec);
    },
    onCommit(v) {
      if (!state.audioPlaying) {
        const dur = state.audioBuffer ? state.audioBuffer.duration : 6.0;
        startAudioPlayback((v / 100) * dur);
      }
    }
  });
  bindTip($('audioSeekGroove'), 'audio:scrub');

  bindHorizontalGroove($('volumeGroove'), {
    min: 0, max: 100, step: 1, value: Math.round(state.volume * 100),
    onChange(v) {
      state.muted = false;
      state.volume = v / 100;
      syncVolumeUI();
    }
  });
  $('muteBtn').addEventListener('click', () => {
    state.muted = !state.muted;
    syncVolumeUI();
    showToast(state.muted ? 'Audio muted' : 'Audio unmuted');
  });
  bindTip($('volumeHump'), 'audio:volume');

  // Dual-Mode Direct Canvas Compare: Hold-to-Peek + Drag Split Curtain in Effects/Hex
  $('compareBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); setCompareOriginal(true); });

  let canvasInspecting = false;
  let canvasDragStartX = 0;
  let curtainEngaged = false;

  function clearCanvasInspect() {
    canvasInspecting = false;
    curtainEngaged = false;
    artworkFrame.classList.remove('is-curtain');
    setCompareOriginal(false);
  }

  artworkFrame.addEventListener('pointerdown', (e) => {
    if (state.mode === 'grid') return;
    if (e.target.closest('.hex-fault-plate')) return;
    e.preventDefault();
    canvasInspecting = true;
    curtainEngaged = false;
    canvasDragStartX = e.clientX;
    try { artworkFrame.setPointerCapture(e.pointerId); } catch (_) {}
    setCompareOriginal(true);
  });

  artworkFrame.addEventListener('pointermove', (e) => {
    if (!canvasInspecting) return;
    if (state.mode !== 'bend' && state.mode !== 'hex') return;
    if (!curtainEngaged && Math.abs(e.clientX - canvasDragStartX) >= 6) {
      curtainEngaged = true;
      artworkFrame.classList.add('is-curtain');
    }
    if (curtainEngaged) {
      const r = artworkFrame.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((e.clientX - r.left) / Math.max(1, r.width)) * 100));
      artworkFrame.style.setProperty('--curtain-pct', pct.toFixed(2) + '%');
    }
  });

  window.addEventListener('pointerup', clearCanvasInspect);
  window.addEventListener('pointercancel', clearCanvasInspect);

  // Clipboard Paste (Cmd/Ctrl+V) for instant photo drop-in
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          loadUploadedFile(file);
          showToast('Pasted image from clipboard');
          break;
        }
      }
    }
  });

  // Keyboard Shortcuts (Undo/Redo, Play, Shuffle, Tabs, Llama Secret)
  let llamaBuf = '';
  window.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault();
      if (e.shiftKey) performRedo();
      else performUndo();
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y' && tag !== 'INPUT' && tag !== 'TEXTAREA') {
      e.preventDefault();
      performRedo();
      return;
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Escape') {
      closeAllMenus();
      photoPopover.hidden = true;
      presetDrawer.hidden = true;
      return;
    }
    if (document.activeElement === $('hexRows')) return;

    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
      llamaBuf = (llamaBuf + e.key.toLowerCase()).slice(-5);
      if (llamaBuf === 'llama') { llamaBuf = ''; triggerLlamaEasterEgg(); return; }
    }

    if (e.key === '?') { e.preventDefault(); openFieldGuide(); return; }
    if (e.key === ' ') { e.preventDefault(); setCompareOriginal(true); }
    else if (e.key.toLowerCase() === 'p') {
      if (state.audioPlaying) pauseAudioPlayback();
      else startAudioPlayback(state.audioOffsetSec);
    }
    else if (e.key.toLowerCase() === 'r') shuffleClassicEffects();
    else if (e.key === '1') setMode('bend');
    else if (e.key === '2') setMode('grid');
    else if (e.key === '3') setMode('hex');
    else if (e.key === '4') setMode('gif');
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ') setCompareOriginal(false);
  });

  // Drag-and-Drop Image Anywhere
  const dropOverlay = $('dropOverlay');
  let depth = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; dropOverlay.classList.add('is-visible'); });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('dragleave', (e) => {
    e.preventDefault(); depth = Math.max(0, depth - 1);
    if (depth === 0) dropOverlay.classList.remove('is-visible');
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault(); depth = 0; dropOverlay.classList.remove('is-visible');
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) loadUploadedFile(file);
  });

  const ro = new ResizeObserver(() => layoutArtworkFrame());
  ro.observe(canvasCavity);

  window.addEventListener('hashchange', () => {
    if (applyEqFromUrlHash()) redrawCanvasImmediate();
  });
}

/* ============================================================
   BOOTSTRAP
   ============================================================ */
function boot() {
  try {
    const savedSkin = localStorage.getItem(STORAGE_SKIN_KEY);
    if (savedSkin && VALID_SKINS.includes(savedSkin)) applySkin(savedSkin);
  } catch (_) {}

  initWindowManager();
  buildPhotoPopover();
  initEffectsPanel();
  applyEqFromUrlHash();
  initGridPanel();
  initHexPanel();
  initGifPanel();
  initGlobalWiring();

  syncBypassUI();
  syncVolumeUI();
  syncUndoRedoUI();
  generateSpecimen(0);
  setMode('bend');
  requestAnimationFrame(drawSpectrumFrame);
}

window.__BPL_WINAMP__ = {
  getState: () => state,
  setMode,
  applySkin,
  cycleVisStyle,
  setEqEnabled,
  applyClassicEffects,
  encodeGif89a,
  encodeAudioBufferToWav,
  exportAudioWav,
  saveAsPng,
  saveAsJpg,
  parseJpegStructure,
  captureCanvasToHex,
  writeSingleHexByte,
  runHexOperator,
  toggleLearningBar,
  openFieldGuide,
  selectGuideTab,
  launchGuidedRecipe,
  jumpHexToJpegSection,
  showHexByteNote,
  performUndo,
  performRedo,
  setWindowShaded,
  resetWindowLayout,
  copyShareableEqLink,
  applyEqFromUrlHash,
  triggerLlamaEasterEgg
};

boot();
