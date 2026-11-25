import { StudioScene, MATERIALS } from './studio-scene.mjs';
import { StudioHandTracker } from './hand-studio.mjs';
import { StudioAudio } from './studio-audio.mjs';

const studioEl = document.querySelector('.studio');
const canvas = document.getElementById('studioCanvas');
const handOverlay = document.getElementById('handOverlay');
const handCtx = handOverlay.getContext('2d');
const statusLine = document.getElementById('statusLine');

const uiBars = Array.from(document.querySelectorAll('.ui-bar'));
const matButtons = Array.from(document.querySelectorAll('[data-material]'));
const toolButtons = Array.from(document.querySelectorAll('[data-tool]'));
const sizeButtons = Array.from(document.querySelectorAll('[data-size]'));
const airButtons = Array.from(document.querySelectorAll('.ui-bar button'));

const symBtn = document.getElementById('symBtn');
const camBtn = document.getElementById('camBtn');
const camNotice = document.getElementById('camNotice');
const camAllowBtn = document.getElementById('camAllowBtn');
const camCancelBtn = document.getElementById('camCancelBtn');
const pipShowBtn = document.getElementById('pipShowBtn');
const pipWrap = document.getElementById('pipWrap');
const pipHideBtn = document.getElementById('pipHideBtn');
const pipCanvas = document.getElementById('pipCanvas');
const pipLabel = document.getElementById('pipLabel');
const poseRows = Array.from(document.querySelectorAll('.pose-row'));
const soundBtn = document.getElementById('soundBtn');
const undoBtn = document.getElementById('undoBtn');
const resetBtn = document.getElementById('resetBtn');
const exportBtn = document.getElementById('exportBtn');
const saveBtn = document.getElementById('saveBtn');

const studio = new StudioScene(canvas);
const audio = new StudioAudio();

let activeTool = 'sculpt'; // 'sculpt' (automatic 3D push/pull/shape) | 'smooth'
let brushRadius = 0.42;
let symmetryEnabled = false;
let handCamActive = false;

const ptrState = {
  mode: null,
  subMode: null,
  downTime: 0,
  downClient: null,
  movedDuringWait: false,
  lastPt: null,
  lastLocalHit: null,
  grabSession: null,
  grabAnchorWorld: null,
  grabStartWorld: null,
  grabStartNormalLocal: null,
  liveReticleMode: 'sculpt',
};

const handSlots = [
  makeHandInteractState(),
  makeHandInteractState(),
];
let twoHandZoomDist = null;
let lastAirHoveredBtn = null;

function makeHandInteractState() {
  return {
    wasPinched: false,
    intent: null,
    lastPt: null,
    lastLocalHit: null,
    startScale: null,
    grabSession: null,
    grabAnchorWorld: null,
    grabStartWorld: null,
    grabStartNormalLocal: null,
    liveAction: 'sculpt',
    depthOffset: 0,
  };
}

function showStatus(msg, ms = 0) {
  if (!msg) {
    statusLine.hidden = true;
    statusLine.textContent = '';
    return;
  }
  statusLine.textContent = msg;
  statusLine.hidden = false;
  if (ms > 0) {
    window.setTimeout(() => {
      if (statusLine.textContent === msg) statusLine.hidden = true;
    }, ms);
  }
}

function syncUndoButton() {
  undoBtn.disabled = !studio.sculpt.canUndo();
}

let committedMaterial = 'clay';
let previewRevertTimer = 0;

function applyVisualMaterial(id) {
  const m = MATERIALS[id];
  if (!m) return;
  studio.setMaterial(id);
  document.documentElement.dataset.theme = m.theme;
}

function previewMaterial(id) {
  if (previewRevertTimer) {
    window.clearTimeout(previewRevertTimer);
    previewRevertTimer = 0;
  }
  applyVisualMaterial(id);
}

function scheduleRevertMaterial() {
  if (previewRevertTimer) window.clearTimeout(previewRevertTimer);
  previewRevertTimer = window.setTimeout(() => {
    previewRevertTimer = 0;
    applyVisualMaterial(committedMaterial);
  }, 55);
}

function selectMaterial(id) {
  const m = MATERIALS[id];
  if (!m) return;
  committedMaterial = id;
  if (previewRevertTimer) {
    window.clearTimeout(previewRevertTimer);
    previewRevertTimer = 0;
  }
  applyVisualMaterial(id);
  audio.setMaterial(id);
  matButtons.forEach((b) => {
    const on = b.dataset.material === id;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function selectTool(tool) {
  activeTool = tool;
  toolButtons.forEach((b) => {
    const on = b.dataset.tool === tool;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function selectBrushSize(r) {
  brushRadius = Math.max(0.18, Math.min(0.76, r));
  let closestBtn = sizeButtons[1];
  let bestDiff = Infinity;
  for (const b of sizeButtons) {
    const diff = Math.abs(parseFloat(b.dataset.size) - brushRadius);
    if (diff < bestDiff) {
      bestDiff = diff;
      closestBtn = b;
    }
  }
  sizeButtons.forEach((b) => {
    const on = b === closestBtn;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

function setSymmetry(on) {
  symmetryEnabled = on;
  studio.setSymmetry(on);
  symBtn.classList.toggle('is-active', on);
  symBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
}

function resizeOverlay() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  handOverlay.width = Math.max(320, Math.round(rect.width * dpr));
  handOverlay.height = Math.max(240, Math.round(rect.height * dpr));
  handCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Find any corner control button under a normalized hand coordinate (supports mid-air pinching)
function findAirControlAt(nx, ny) {
  const cx = nx * window.innerWidth;
  const cy = ny * window.innerHeight;
  let nearBar = null;
  for (const bar of uiBars) {
    const br = bar.getBoundingClientRect();
    if (cx >= br.left - 14 && cx <= br.right + 14 && cy >= br.top - 16 && cy <= br.bottom + 16) {
      nearBar = bar;
      break;
    }
  }
  if (!nearBar) return { nearBar: null, button: null };

  for (const btn of airButtons) {
    if (btn.hidden || btn.disabled) continue;
    const r = btn.getBoundingClientRect();
    if (cx >= r.left - 8 && cx <= r.right + 8 && cy >= r.top - 10 && cy <= r.bottom + 10) {
      return { nearBar, button: btn };
    }
  }
  return { nearBar, button: null };
}

function setActivePoseHint(pose) {
  for (const row of poseRows) {
    row.classList.toggle('is-current', Boolean(pose) && row.dataset.pose === pose);
  }
}

function clearAirHover() {
  if (lastAirHoveredBtn) {
    const wasMat = Boolean(lastAirHoveredBtn.dataset.material);
    lastAirHoveredBtn.classList.remove('is-hand-hover');
    lastAirHoveredBtn = null;
    if (wasMat) scheduleRevertMaterial();
  }
}

// Pure monochrome 1px architectural hairline cursor for hand tracking
function renderHandOverlay(hands, slotHits, isTwoHandZoom) {
  const rect = handOverlay.getBoundingClientRect();
  handCtx.clearRect(0, 0, rect.width, rect.height);
  if (!hands.length) return;

  const isDark = document.documentElement.dataset.theme === 'dark';
  const ink = isDark ? '238, 241, 245' : '42, 39, 35';

  if (isTwoHandZoom && hands.length === 2) {
    const x0 = hands[0].x * rect.width;
    const y0 = hands[0].y * rect.height;
    const x1 = hands[1].x * rect.width;
    const y1 = hands[1].y * rect.height;
    handCtx.save();
    handCtx.strokeStyle = `rgba(${ink}, 0.42)`;
    handCtx.lineWidth = 1;
    handCtx.setLineDash([3, 5]);
    handCtx.beginPath();
    handCtx.moveTo(x0, y0);
    handCtx.lineTo(x1, y1);
    handCtx.stroke();
    handCtx.restore();
  }

  for (let i = 0; i < hands.length; i++) {
    const h = hands[i];
    const st = handSlots[h.id];
    const hit = slotHits[i];
    const cx = h.x * rect.width;
    const cy = h.y * rect.height;

    const depthScale = h.pinched && st.intent === 'sculpt' ? (1 - st.depthOffset * 0.22) : 1;
    const outerR = Math.max(7, (h.pinched ? 10 : 15 - h.pinchProgress * 4.5) * depthScale);

    // Subtle open-space turn arcs only when hovering away from sphere and controls
    const inSpace = !hit && st.intent !== 'sculpt' && st.intent !== 'ui' && !isTwoHandZoom;
    if (inSpace) {
      handCtx.strokeStyle = `rgba(${ink}, ${h.pinched ? 0.58 : 0.26})`;
      handCtx.lineWidth = 1;
      const arcR = outerR + 5.5;
      handCtx.beginPath();
      handCtx.arc(cx, cy, arcR, -Math.PI * 0.70, -Math.PI * 0.30);
      handCtx.stroke();
      handCtx.beginPath();
      handCtx.arc(cx, cy, arcR, Math.PI * 0.30, Math.PI * 0.70);
      handCtx.stroke();
    }

    handCtx.strokeStyle = `rgba(${ink}, ${h.pinched ? 0.88 : 0.36 + h.pinchProgress * 0.36})`;
    handCtx.lineWidth = h.pinched ? 1.4 : 1;
    handCtx.beginPath();
    handCtx.arc(cx, cy, outerR, 0, Math.PI * 2);
    handCtx.stroke();

    const innerR = h.pinched ? 2.4 : 1.4 + h.pinchProgress * 1.4;
    handCtx.fillStyle = `rgba(${ink}, ${h.pinched ? 0.92 : 0.30 + h.pinchProgress * 0.48})`;
    handCtx.beginPath();
    handCtx.arc(cx, cy, innerR, 0, Math.PI * 2);
    handCtx.fill();
  }
}

function resetHandSlot(st) {
  st.wasPinched = false;
  st.intent = null;
  st.lastPt = null;
  st.lastLocalHit = null;
  st.startScale = null;
  st.grabSession = null;
  st.grabAnchorWorld = null;
  st.grabStartWorld = null;
  st.grabStartNormalLocal = null;
  st.liveAction = 'sculpt';
  st.depthOffset = 0;
}

function handleHandFrame(hands) {
  const seenIds = new Set(hands.map((h) => h.id));
  for (let id = 0; id < 2; id++) {
    if (!seenIds.has(id)) resetHandSlot(handSlots[id]);
  }

  uiBars.forEach((b) => b.classList.remove('is-hand-near'));

  if (!hands.length) {
    twoHandZoomDist = null;
    clearAirHover();
    studioEl.classList.remove('is-sculpting');
    if (!ptrState.mode) {
      studio.isInteracting = false;
      studio.updateReticle(null);
    }
    renderHandOverlay([], [], false);
    pipLabel.textContent = 'SHOW HAND';
    setActivePoseHint(null);
    return;
  }

  // Two hands pinched -> smooth caliper zoom
  if (hands.length === 2 && hands[0].pinched && hands[1].pinched) {
    const st0 = handSlots[hands[0].id];
    const st1 = handSlots[hands[1].id];
    if (st0.intent !== 'sculpt' && st1.intent !== 'sculpt') {
      const d = Math.hypot(hands[1].x - hands[0].x, hands[1].y - hands[0].y);
      if (twoHandZoomDist !== null) {
        studio.zoomBy(-(d - twoHandZoomDist) * 7.5);
      }
      twoHandZoomDist = d;
      st0.intent = 'zoom';
      st1.intent = 'zoom';
      st0.wasPinched = true;
      st1.wasPinched = true;
      studio.isInteracting = true;
      studio.updateReticle(null);
      studioEl.classList.add('is-sculpting');
      clearAirHover();
      renderHandOverlay(hands, [null, null], true);
      pipLabel.textContent = 'ZOOM';
      setActivePoseHint('zoom');
      return;
    }
  }
  twoHandZoomDist = null;

  let anyActiveAction = false;
  let hoveredControl = null;
  let primaryReticle = null;
  const slotHits = [];

  for (let i = 0; i < hands.length; i++) {
    const h = hands[i];
    const st = handSlots[h.id];
    const { nearBar, button: ctrlBtn } = findAirControlAt(h.x, h.y);
    if (nearBar) nearBar.classList.add('is-hand-near');
    if (ctrlBtn && !st.intent) hoveredControl = ctrlBtn;

    const hit = (!nearBar || st.intent === 'sculpt') ? studio.hitTest(h.x, h.y) : null;
    slotHits.push(hit);

    if (h.pinched && !st.wasPinched) {
      if (ctrlBtn) {
        st.intent = 'ui';
        ctrlBtn.click();
        audio.playPinchLock();
      } else if (hit) {
        st.intent = 'sculpt';
        st.lastPt = { x: h.x, y: h.y };
        st.lastLocalHit = hit.localPoint.clone();
        st.startScale = h.scale;
        st.depthOffset = 0;
        studio.sculpt.snapshotForUndo();
        syncUndoButton();
        audio.playPinchLock();

        if (activeTool === 'sculpt') {
          st.liveAction = 'sculpt';
          st.grabSession = studio.sculpt.beginGrab(hit.localPoint, brushRadius, symmetryEnabled);
          st.grabAnchorWorld = hit.worldPoint.clone();
          st.grabStartWorld = studio.projectToDragPlane(h.x, h.y, st.grabAnchorWorld) || hit.worldPoint.clone();
          st.grabStartNormalLocal = hit.localNormal.clone();
        } else {
          st.liveAction = 'smooth';
          studio.sculpt.applyStroke({
            fromLocal: null,
            toLocal: hit.localPoint,
            normalLocal: hit.localNormal,
            mode: 'smooth',
            radius: brushRadius,
            strength: 0.22,
            materialId: studio.materialId,
            symmetry: symmetryEnabled,
          });
        }
      } else {
        st.intent = 'orbit';
        st.lastPt = { x: h.x, y: h.y };
      }
    }

    if (h.pinched && st.intent === 'sculpt') {
      anyActiveAction = true;

      if (activeTool === 'sculpt' && st.grabSession && st.grabAnchorWorld) {
        const nowWorld = studio.projectToDragPlane(h.x, h.y, st.grabAnchorWorld);
        const deltaWorld = nowWorld && st.grabStartWorld
          ? nowWorld.clone().sub(st.grabStartWorld).multiplyScalar(1.15)
          : studio.getCameraForward().multiplyScalar(0);

        const baseS = Math.max(0.05, st.startScale || h.scale);
        const rawRatio = (h.scale - baseS) / baseS;
        const deadzone = 0.032;
        const absR = Math.abs(rawRatio);
        const effR = absR <= deadzone ? 0 : Math.sign(rawRatio) * Math.min(0.42, absR - deadzone);
        st.depthOffset = Math.max(-1, Math.min(1, effR * 4.5));

        const camFwd = studio.getCameraForward();
        deltaWorld.addScaledVector(camFwd, effR * 3.8);

        const deltaLocal = studio.worldDeltaToLocalDelta(deltaWorld);
        studio.sculpt.updateGrab(st.grabSession, deltaLocal, studio.materialId);

        const radialDot = st.grabStartNormalLocal ? deltaLocal.dot(st.grabStartNormalLocal) : 0;
        if (radialDot > 0.035) st.liveAction = 'pull';
        else if (radialDot < -0.035) st.liveAction = 'push';
        else st.liveAction = 'sculpt';

        const speed = st.lastPt ? Math.hypot(h.x - st.lastPt.x, h.y - st.lastPt.y) : 0;
        if (speed > 0.002 || Math.abs(effR) > 0.02) {
          audio.pulseSculpt(Math.min(1.4, speed * 24 + Math.abs(effR) * 1.6));
        }
        st.lastPt = { x: h.x, y: h.y };
        if (hit) primaryReticle = { hit, pinch: 1, active: true, mode: st.liveAction };
      } else if (hit) {
        st.liveAction = 'smooth';
        studio.sculpt.applyStroke({
          fromLocal: st.lastLocalHit,
          toLocal: hit.localPoint,
          normalLocal: hit.localNormal,
          mode: 'smooth',
          radius: brushRadius,
          strength: 0.18,
          materialId: studio.materialId,
          symmetry: symmetryEnabled,
        });
        st.lastLocalHit = hit.localPoint.clone();
        audio.pulseSculpt(0.4);
        primaryReticle = { hit, pinch: 1, active: true, mode: 'smooth' };
      }
    } else if (h.pinched && st.intent === 'orbit') {
      anyActiveAction = true;
      if (st.lastPt) {
        const dx = h.x - st.lastPt.x;
        const dy = h.y - st.lastPt.y;
        studio.rotateBy(dx * 4.4, dy * 3.6);
        studio.addOrbitImpulse(dx * 0.14, dy * 0.11);
      }
      st.lastPt = { x: h.x, y: h.y };
    } else if (!h.pinched) {
      if (st.wasPinched) {
        st.intent = null;
        st.lastPt = null;
        st.lastLocalHit = null;
        st.startScale = null;
        st.grabSession = null;
        st.grabAnchorWorld = null;
        st.grabStartWorld = null;
        st.grabStartNormalLocal = null;
        st.liveAction = activeTool;
        st.depthOffset = 0;
      }
      if (hit && !primaryReticle) {
        primaryReticle = { hit, pinch: h.pinchProgress, active: false, mode: activeTool };
      }
    }

    st.wasPinched = h.pinched;
  }

  if (hoveredControl !== lastAirHoveredBtn) {
    clearAirHover();
    if (hoveredControl) {
      hoveredControl.classList.add('is-hand-hover');
      lastAirHoveredBtn = hoveredControl;
      if (hoveredControl.dataset.material) {
        previewMaterial(hoveredControl.dataset.material);
      }
    }
  }

  studioEl.classList.toggle('is-sculpting', anyActiveAction);
  studio.isInteracting = anyActiveAction;

  if (primaryReticle) {
    studio.updateReticle(
      primaryReticle.hit,
      brushRadius,
      primaryReticle.pinch,
      primaryReticle.active,
      primaryReticle.mode
    );
  } else {
    studio.updateReticle(null);
  }

  const activeHand = hands.find((h) => handSlots[h.id].intent === 'sculpt' || handSlots[h.id].intent === 'orbit');
  if (activeHand) {
    const st = handSlots[activeHand.id];
    if (st.intent === 'orbit') {
      pipLabel.textContent = 'TURN';
      setActivePoseHint('orbit');
    } else {
      setActivePoseHint('sculpt');
      if (st.liveAction === 'pull') pipLabel.textContent = 'PULL';
      else if (st.liveAction === 'push') pipLabel.textContent = 'PUSH';
      else if (st.liveAction === 'smooth') pipLabel.textContent = 'SMOOTH';
      else pipLabel.textContent = 'SHAPE';
    }
  } else if (hoveredControl) {
    pipLabel.textContent = 'SELECT';
    setActivePoseHint('hover');
  } else if (primaryReticle) {
    pipLabel.textContent = 'GRAB';
    setActivePoseHint('hover');
  } else {
    pipLabel.textContent = 'TURN';
    setActivePoseHint('hover');
  }

  renderHandOverlay(hands, slotHits, false);
}

const tracker = new StudioHandTracker({
  onFrame: handleHandFrame,
  onStatus(state, message) {
    handCamActive = state === 'active';
    camBtn.classList.toggle('is-active', state === 'active' || state === 'loading');
    camBtn.setAttribute('aria-pressed', state === 'active' ? 'true' : 'false');

    if (state === 'active') {
      camNotice.hidden = true;
      pipWrap.hidden = false;
      pipShowBtn.hidden = true;
    } else {
      pipWrap.hidden = true;
      pipShowBtn.hidden = true;
      clearAirHover();
      uiBars.forEach((b) => b.classList.remove('is-hand-near'));
      studioEl.classList.remove('is-sculpting');
      handCtx.clearRect(0, 0, handOverlay.width, handOverlay.height);
    }

    if (state === 'error') showStatus(message, 4500);
    else if (state === 'loading') showStatus(message, 0);
    else showStatus('');
  },
});
tracker.attachPreview(pipCanvas);

function normPtr(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width,
    y: (e.clientY - rect.top) / rect.height,
  };
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('pointerdown', (e) => {
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {}
  const pt = normPtr(e);
  ptrState.lastPt = pt;
  ptrState.downTime = performance.now();
  ptrState.downClient = { x: e.clientX, y: e.clientY };
  ptrState.movedDuringWait = false;

  const forceOrbit = e.button === 2 || e.altKey;
  const hit = forceOrbit ? null : studio.hitTest(pt.x, pt.y);

  if (hit && !forceOrbit) {
    ptrState.mode = 'sculpt';
    ptrState.lastLocalHit = hit.localPoint.clone();

    studio.isInteracting = true;
    studioEl.classList.add('is-sculpting');
    studio.sculpt.snapshotForUndo();
    syncUndoButton();
    audio.playPinchLock();

    if (activeTool === 'smooth') {
      ptrState.subMode = 'smooth';
      ptrState.liveReticleMode = 'smooth';
      studio.sculpt.applyStroke({
        fromLocal: null,
        toLocal: hit.localPoint,
        normalLocal: hit.localNormal,
        mode: 'smooth',
        radius: brushRadius,
        strength: 0.24,
        materialId: studio.materialId,
        symmetry: symmetryEnabled,
      });
    } else if (e.shiftKey) {
      ptrState.subMode = 'build';
      ptrState.liveReticleMode = 'pull';
      studio.sculpt.applyStroke({
        fromLocal: null,
        toLocal: hit.localPoint,
        normalLocal: hit.localNormal,
        mode: 'build',
        radius: brushRadius,
        strength: 0.048,
        materialId: studio.materialId,
        symmetry: symmetryEnabled,
      });
    } else {
      ptrState.subMode = 'grab';
      ptrState.liveReticleMode = 'sculpt';
      ptrState.grabSession = studio.sculpt.beginGrab(hit.localPoint, brushRadius, symmetryEnabled);
      ptrState.grabAnchorWorld = hit.worldPoint.clone();
      ptrState.grabStartWorld = studio.projectToDragPlane(pt.x, pt.y, ptrState.grabAnchorWorld) || hit.worldPoint.clone();
      ptrState.grabStartNormalLocal = hit.localNormal.clone();
    }
    studio.updateReticle(hit, brushRadius, 1, true, ptrState.liveReticleMode);
  } else {
    ptrState.mode = 'orbit';
    ptrState.subMode = null;
    studio.isInteracting = true;
    studio.updateReticle(null);
    canvas.style.cursor = 'grabbing';
  }
});

canvas.addEventListener('pointermove', (e) => {
  const pt = normPtr(e);

  if (!ptrState.mode) {
    const hit = studio.hitTest(pt.x, pt.y);
    studio.updateReticle(hit, brushRadius, 0, false, activeTool);
    canvas.style.cursor = hit ? 'crosshair' : 'grab';
    return;
  }

  const prev = ptrState.lastPt || pt;
  const dnx = pt.x - prev.x;
  const dny = pt.y - prev.y;
  const speed = Math.hypot(dnx, dny);
  ptrState.lastPt = pt;

  if (ptrState.downClient) {
    const movePx = Math.hypot(e.clientX - ptrState.downClient.x, e.clientY - ptrState.downClient.y);
    if (movePx > 6) ptrState.movedDuringWait = true;
  }

  if (ptrState.mode === 'orbit') {
    canvas.style.cursor = 'grabbing';
    studio.rotateBy(dnx * 4.8, dny * 3.9);
    studio.addOrbitImpulse(dnx * 0.16, dny * 0.13);
    return;
  }

  if (ptrState.mode === 'sculpt') {
    if (ptrState.subMode === 'grab' && ptrState.grabSession && ptrState.grabAnchorWorld) {
      const nowWorld = studio.projectToDragPlane(pt.x, pt.y, ptrState.grabAnchorWorld);
      if (nowWorld && ptrState.grabStartWorld) {
        const deltaWorld = nowWorld.clone().sub(ptrState.grabStartWorld).multiplyScalar(1.08);
        const deltaLocal = studio.worldDeltaToLocalDelta(deltaWorld);
        studio.sculpt.updateGrab(ptrState.grabSession, deltaLocal, studio.materialId);

        const radialDot = ptrState.grabStartNormalLocal ? deltaLocal.dot(ptrState.grabStartNormalLocal) : 0;
        ptrState.liveReticleMode = radialDot > 0.03 ? 'pull' : radialDot < -0.03 ? 'push' : 'sculpt';
        if (speed > 0.001) audio.pulseSculpt(Math.min(1.5, speed * 26));
      }
      const liveHit = studio.hitTest(pt.x, pt.y);
      studio.updateReticle(liveHit, brushRadius, 1, true, ptrState.liveReticleMode);
    } else {
      const hit = studio.hitTest(pt.x, pt.y);
      const strokeMode = ptrState.subMode === 'smooth'
        ? 'smooth'
        : ptrState.subMode === 'build'
          ? 'build'
          : 'push';
      studio.updateReticle(hit, brushRadius, 1, Boolean(hit), ptrState.liveReticleMode);
      if (hit) {
        studio.sculpt.applyStroke({
          fromLocal: ptrState.lastLocalHit,
          toLocal: hit.localPoint,
          normalLocal: hit.localNormal,
          mode: strokeMode,
          radius: brushRadius,
          strength: strokeMode === 'smooth' ? 0.20 : 0.042,
          materialId: studio.materialId,
          symmetry: symmetryEnabled,
        });
        ptrState.lastLocalHit = hit.localPoint.clone();
        audio.pulseSculpt(Math.min(1.3, 0.25 + speed * 22));
      } else {
        ptrState.lastLocalHit = null;
      }
    }
  }
});

function endPointer() {
  ptrState.mode = null;
  ptrState.subMode = null;
  ptrState.downClient = null;
  ptrState.movedDuringWait = false;
  ptrState.lastLocalHit = null;
  ptrState.lastPt = null;
  ptrState.grabSession = null;
  ptrState.grabAnchorWorld = null;
  ptrState.grabStartWorld = null;
  ptrState.grabStartNormalLocal = null;
  ptrState.liveReticleMode = activeTool;
  studio.isInteracting = false;
  studioEl.classList.remove('is-sculpting');
  canvas.style.cursor = 'grab';
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => {
  if (!ptrState.mode && !handCamActive) studio.updateReticle(null);
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.shiftKey) {
    selectBrushSize(brushRadius - Math.sign(e.deltaY) * 0.04);
    const pt = normPtr(e);
    const hit = studio.hitTest(pt.x, pt.y);
    studio.updateReticle(hit, brushRadius, 0, false, activeTool);
  } else {
    studio.zoomBy(e.deltaY * 0.0034);
  }
}, { passive: false });

matButtons.forEach((b) => {
  b.addEventListener('click', () => selectMaterial(b.dataset.material));
  b.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'touch') previewMaterial(b.dataset.material);
  });
  b.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'touch') scheduleRevertMaterial();
  });
});
toolButtons.forEach((b) => b.addEventListener('click', () => selectTool(b.dataset.tool)));
sizeButtons.forEach((b) => b.addEventListener('click', () => selectBrushSize(parseFloat(b.dataset.size))));

symBtn.addEventListener('click', () => setSymmetry(!symmetryEnabled));

camBtn.addEventListener('click', () => {
  if (tracker.active || tracker.loading) {
    camNotice.hidden = true;
    tracker.stop();
  } else {
    camNotice.hidden = !camNotice.hidden;
  }
});

camAllowBtn.addEventListener('click', () => {
  camNotice.hidden = true;
  audio.unlock();
  tracker.start();
});

camCancelBtn.addEventListener('click', () => {
  camNotice.hidden = true;
});

// Close privacy notice cleanly if user starts interacting with the studio canvas
canvas.addEventListener('pointerdown', () => {
  if (!camNotice.hidden) camNotice.hidden = true;
});

pipHideBtn.addEventListener('click', () => {
  pipWrap.hidden = true;
  if (tracker.active) pipShowBtn.hidden = false;
});

pipShowBtn.addEventListener('click', () => {
  if (!tracker.active) return;
  pipWrap.hidden = false;
  pipShowBtn.hidden = true;
});

soundBtn.addEventListener('click', async () => {
  const on = await audio.toggle();
  soundBtn.classList.toggle('is-active', on);
  soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
});

undoBtn.addEventListener('click', () => {
  if (studio.sculpt.undo()) syncUndoButton();
});

resetBtn.addEventListener('click', () => {
  resetBtn.classList.remove('is-spinning');
  void resetBtn.offsetWidth;
  resetBtn.classList.add('is-spinning');
  studio.sculpt.startResetAnimation();
  syncUndoButton();
});
resetBtn.addEventListener('animationend', () => resetBtn.classList.remove('is-spinning'));

exportBtn.addEventListener('click', () => studio.exportGLB());

saveBtn.addEventListener('click', () => {
  const a = document.createElement('a');
  a.download = `form-${studio.materialId}.png`;
  a.href = canvas.toDataURL('image/png');
  a.click();
});

window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    if (studio.sculpt.undo()) syncUndoButton();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape' && !camNotice.hidden) {
    camNotice.hidden = true;
    return;
  }
  if (e.key === '1') selectMaterial('clay');
  else if (e.key === '2') selectMaterial('chrome');
  else if (e.key === '3') selectMaterial('glass');
  else if (e.key === '[') selectBrushSize(brushRadius - 0.06);
  else if (e.key === ']') selectBrushSize(brushRadius + 0.06);
  else if (e.key === 'm' || e.key === 'M') setSymmetry(!symmetryEnabled);
  else if (e.key === 'r' || e.key === 'R') resetBtn.click();
});

window.addEventListener('resize', () => {
  studio.resize();
  resizeOverlay();
});

// Unlock default-on Web Audio smoothly on the first user interaction
const unlockOnce = () => {
  audio.unlock();
  window.removeEventListener('pointerdown', unlockOnce, true);
  window.removeEventListener('keydown', unlockOnce, true);
};
window.addEventListener('pointerdown', unlockOnce, true);
window.addEventListener('keydown', unlockOnce, true);

selectMaterial('clay');
selectTool('sculpt');
selectBrushSize(0.42);
setSymmetry(false);
syncUndoButton();
resizeOverlay();

let holdAccum = 0;
let lastTs = performance.now();

function loop(ts) {
  const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) * 0.001));
  lastTs = ts;

  if (ptrState.mode === 'sculpt' && ptrState.lastPt) {
    if (ptrState.subMode === 'grab' && !ptrState.movedDuringWait && (ts - ptrState.downTime) > 240) {
      ptrState.subMode = 'press';
      ptrState.liveReticleMode = 'push';
      ptrState.grabSession = null;
    }

    if (ptrState.subMode === 'press' || ptrState.subMode === 'build' || ptrState.subMode === 'smooth') {
      holdAccum += dt;
      if (holdAccum > 0.05) {
        holdAccum = 0;
        const hit = studio.hitTest(ptrState.lastPt.x, ptrState.lastPt.y);
        if (hit) {
          const mode = ptrState.subMode === 'smooth'
            ? 'smooth'
            : ptrState.subMode === 'build'
              ? 'build'
              : 'push';
          studio.sculpt.applyStroke({
            fromLocal: null,
            toLocal: hit.localPoint,
            normalLocal: hit.localNormal,
            mode,
            radius: brushRadius,
            strength: mode === 'smooth' ? 0.14 : 0.028,
            materialId: studio.materialId,
            symmetry: symmetryEnabled,
          });
          studio.updateReticle(hit, brushRadius, 1, true, ptrState.liveReticleMode);
        }
      }
    }
  } else {
    holdAccum = 0;
  }

  studio.render(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
