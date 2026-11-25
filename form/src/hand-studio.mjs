import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

class OneEuro1D {
  constructor(minCutoff = 2.4, beta = 0.09, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }

  _alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x, tSec) {
    if (this.xPrev === null || this.tPrev === null) {
      this.xPrev = x;
      this.tPrev = tSec;
      return x;
    }
    const dt = Math.max(1 / 240, tSec - this.tPrev);
    const dx = (x - this.xPrev) / dt;
    const aD = this._alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const aX = this._alpha(cutoff, dt);
    const xHat = aX * x + (1 - aX) * this.xPrev;
    this.xPrev = xHat;
    this.dxPrev = dxHat;
    this.tPrev = tSec;
    return xHat;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
}

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

function dist2D(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function makeSlot(id) {
  return {
    id,
    active: false,
    lastSeen: 0,
    lastRawX: 0.5,
    lastRawY: 0.5,
    fx: new OneEuro1D(2.4, 0.09),
    fy: new OneEuro1D(2.4, 0.09),
    ix: new OneEuro1D(2.8, 0.09),
    iy: new OneEuro1D(2.8, 0.09),
    tx: new OneEuro1D(2.8, 0.09),
    ty: new OneEuro1D(2.8, 0.09),
    fScale: new OneEuro1D(2.2, 0.06),
    pinched: false,
  };
}

// Local 2-hand VisionOS-style spatial tracker:
// - Single continuous pinch-midpoint cursor (zero jump on pinch lock/release)
// - Spatial nearest-neighbor slot matching (no mid-stroke hand swapping)
// - Crisp pinch hysteresis + smooth magnetic progress 0..1
export class StudioHandTracker {
  constructor({ onFrame, onStatus }) {
    this.onFrame = onFrame;
    this.onStatus = onStatus;

    this.landmarker = null;
    this.stream = null;
    this.videoEl = null;
    this.active = false;
    this.loading = false;
    this.rafId = 0;
    this.lastVideoTime = -1;

    this.slots = [makeSlot(0), makeSlot(1)];
    this.previewCanvas = null;
    this.previewCtx = null;
  }

  attachPreview(canvas) {
    this.previewCanvas = canvas;
    this.previewCtx = canvas ? canvas.getContext('2d') : null;
  }

  async start() {
    if (this.active || this.loading) return;
    this.loading = true;
    this.onStatus?.('loading', 'Starting local camera...');

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera requires HTTPS or localhost.');
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 60, min: 24 },
        },
        audio: false,
      });

      this.videoEl = document.createElement('video');
      this.videoEl.srcObject = this.stream;
      this.videoEl.playsInline = true;
      this.videoEl.muted = true;
      await this.videoEl.play();

      if (!this.landmarker) {
        this.onStatus?.('loading', 'Loading local hand tracker...');
        const base = new URL('./vendor/mediapipe/', window.location.href).href.replace(/\/$/, '');
        const vision = await FilesetResolver.forVisionTasks(base);
        const modelPath = `${base}/hand_landmarker.task`;

        const common = {
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.55,
          minTrackingConfidence: 0.55,
        };

        try {
          this.landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: modelPath, delegate: 'GPU' },
            ...common,
          });
        } catch {
          this.landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: modelPath, delegate: 'CPU' },
            ...common,
          });
        }
      }

      this.active = true;
      this.loading = false;
      this._resetSlots();
      this.onStatus?.('active', '');
      this._loop();
    } catch (err) {
      this.loading = false;
      this.stop();
      const msg = err?.name === 'NotAllowedError'
        ? 'Camera permission denied'
        : (err?.message || 'Could not start camera');
      this.onStatus?.('error', msg);
    }
  }

  _resetSlots() {
    for (const s of this.slots) {
      s.active = false;
      s.pinched = false;
      s.fx.reset(); s.fy.reset();
      s.ix.reset(); s.iy.reset();
      s.tx.reset(); s.ty.reset();
      s.fScale.reset();
    }
  }

  stop() {
    this.active = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
    this.lastVideoTime = -1;
    this._resetSlots();
    this.onFrame?.([]);
    this.onStatus?.('off', '');
  }

  _mapMirror(nx, ny) {
    // Generous ergonomic inner reach zone so every corner & bottom dock is effortless
    const mx = ((1 - nx) - 0.12) / 0.76;
    const my = (ny - 0.10) / 0.78;
    return [
      Math.max(0, Math.min(1, mx)),
      Math.max(0, Math.min(1, my)),
    ];
  }

  _processHand(lm, slot, tSec) {
    const wrist = lm[0];
    // Rigid 4-bone palm span (wrist-to-knuckles + knuckle bridge): invariant to finger pinching,
    // gives clean, reliable Z-depth when moving hand toward or away from the webcam.
    const palmScale = Math.max(
      0.055,
      (dist2D(wrist, lm[9]) + dist2D(wrist, lm[5]) + dist2D(wrist, lm[17]) + dist2D(lm[5], lm[17])) * 0.25
    );
    const pinchDist = dist2D(lm[4], lm[8]);
    const pinchNorm = pinchDist / Math.max(0.055, dist2D(wrist, lm[9]));

    // Crisp VisionOS-like hysteresis (locks cleanly, releases cleanly without chatter)
    if (slot.pinched) {
      if (pinchNorm > 0.48) slot.pinched = false;
    } else if (pinchNorm < 0.35) {
      slot.pinched = true;
    }

    const pinchProgress = Math.max(0, Math.min(1, (0.76 - pinchNorm) / (0.76 - 0.33)));

    // Continuous midpoint between thumb tip and index tip: stays rock-stationary as fingers close!
    const midRawX = lm[8].x * 0.54 + lm[4].x * 0.46;
    const midRawY = lm[8].y * 0.54 + lm[4].y * 0.46;
    const [rawX, rawY] = this._mapMirror(midRawX, midRawY);
    const [rawIX, rawIY] = this._mapMirror(lm[8].x, lm[8].y);
    const [rawTX, rawTY] = this._mapMirror(lm[4].x, lm[4].y);

    const x = slot.fx.filter(rawX, tSec);
    const y = slot.fy.filter(rawY, tSec);
    const indexX = slot.ix.filter(rawIX, tSec);
    const indexY = slot.iy.filter(rawIY, tSec);
    const thumbX = slot.tx.filter(rawTX, tSec);
    const thumbY = slot.ty.filter(rawTY, tSec);
    const scale = slot.fScale.filter(palmScale, tSec);

    slot.lastRawX = rawX;
    slot.lastRawY = rawY;
    slot.lastSeen = tSec;
    slot.active = true;

    return {
      id: slot.id,
      pinched: slot.pinched,
      pinchProgress,
      x,
      y,
      indexX,
      indexY,
      thumbX,
      thumbY,
      scale,
      landmarks: lm,
    };
  }

  _matchToSlots(detections, tSec) {
    const used = new Set();
    const assignments = [];

    // First pass: pair each detection with its closest previously-active slot
    const activeSlots = this.slots.filter((s) => s.active && (tSec - s.lastSeen) < 0.35);

    if (detections.length === 2 && activeSlots.length === 2) {
      const [d0, d1] = detections;
      const [s0, s1] = activeSlots;
      const costDirect =
        Math.hypot(d0.rawX - s0.lastRawX, d0.rawY - s0.lastRawY) +
        Math.hypot(d1.rawX - s1.lastRawX, d1.rawY - s1.lastRawY);
      const costSwap =
        Math.hypot(d0.rawX - s1.lastRawX, d0.rawY - s1.lastRawY) +
        Math.hypot(d1.rawX - s0.lastRawX, d1.rawY - s0.lastRawY);
      if (costDirect <= costSwap) {
        assignments.push([d0, s0], [d1, s1]);
      } else {
        assignments.push([d0, s1], [d1, s0]);
      }
      used.add(s0.id);
      used.add(s1.id);
    } else {
      for (const det of detections) {
        let bestSlot = null;
        let bestDist = Infinity;
        for (const s of activeSlots) {
          if (used.has(s.id)) continue;
          const dist = Math.hypot(det.rawX - s.lastRawX, det.rawY - s.lastRawY);
          if (dist < bestDist) {
            bestDist = dist;
            bestSlot = s;
          }
        }
        if (!bestSlot) {
          bestSlot = this.slots.find((s) => !used.has(s.id));
          if (bestSlot) {
            bestSlot.fx.reset(); bestSlot.fy.reset();
            bestSlot.ix.reset(); bestSlot.iy.reset();
            bestSlot.tx.reset(); bestSlot.ty.reset();
            bestSlot.fScale.reset();
            bestSlot.pinched = false;
          }
        }
        if (bestSlot) {
          used.add(bestSlot.id);
          assignments.push([det, bestSlot]);
        }
      }
    }

    // Retire unseen slots after brief grace period
    for (const s of this.slots) {
      if (!used.has(s.id) && (tSec - s.lastSeen) > 0.16) {
        s.active = false;
        s.pinched = false;
      }
    }

    return assignments;
  }

  _drawPreview(hands) {
    if (!this.previewCanvas || !this.previewCtx || !this.videoEl) return;
    if (this.previewCanvas.offsetParent === null) return;
    const cw = this.previewCanvas.width;
    const ch = this.previewCanvas.height;
    const pctx = this.previewCtx;

    pctx.save();
    pctx.scale(-1, 1);
    pctx.drawImage(this.videoEl, -cw, 0, cw, ch);
    pctx.restore();

    pctx.fillStyle = 'rgba(10, 12, 16, 0.36)';
    pctx.fillRect(0, 0, cw, ch);

    for (const h of hands) {
      const lm = h.landmarks;
      pctx.strokeStyle = h.pinched ? '#f5be78' : 'rgba(255, 255, 255, 0.45)';
      pctx.lineWidth = h.pinched ? 1.8 : 1.2;
      pctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        pctx.moveTo((1 - lm[a].x) * cw, lm[a].y * ch);
        pctx.lineTo((1 - lm[b].x) * cw, lm[b].y * ch);
      }
      pctx.stroke();

      // Highlight thumb & index tips
      for (const tip of [lm[4], lm[8]]) {
        pctx.fillStyle = h.pinched ? '#f5be78' : 'rgba(255,255,255,0.85)';
        pctx.beginPath();
        pctx.arc((1 - tip.x) * cw, tip.y * ch, h.pinched ? 3.2 : 2.2, 0, Math.PI * 2);
        pctx.fill();
      }
    }
  }

  _loop() {
    if (!this.active) return;
    if (this.videoEl && this.videoEl.readyState >= 2 && this.landmarker) {
      const vt = this.videoEl.currentTime;
      if (vt !== this.lastVideoTime) {
        this.lastVideoTime = vt;
        const tSec = performance.now() * 0.001;
        const result = this.landmarker.detectForVideo(this.videoEl, performance.now());
        const lms = result?.landmarks || [];

        const detections = lms.map((lm) => {
          const [rawX, rawY] = this._mapMirror(lm[8].x * 0.54 + lm[4].x * 0.46, lm[8].y * 0.54 + lm[4].y * 0.46);
          return { lm, rawX, rawY };
        });

        const pairs = this._matchToSlots(detections, tSec);
        const hands = pairs.map(([det, slot]) => this._processHand(det.lm, slot, tSec));

        this._drawPreview(hands);
        this.onFrame?.(hands);
      }
    }
    this.rafId = requestAnimationFrame(() => this._loop());
  }
}
