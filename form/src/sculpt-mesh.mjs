import * as THREE from 'three';

// High-resolution welded Cube-Sphere sculpting engine (zero pole pinching, zero seam cracks,
// localized incremental normal recomputation, capture-based Pull/Grab, sub-stepped strokes, and mirror symmetry).
export class SculptMesh {
  constructor(segments = 60, radius = 1.04) {
    this.segments = segments;
    this.radius = radius;
    this.history = [];
    this.maxHistory = 24;

    this.geometry = this._buildWeldedCubeSphere(segments, radius);
    this.posAttr = this.geometry.attributes.position;
    this.normAttr = this.geometry.attributes.normal;
    this.sculptDataAttr = this.geometry.attributes.sculptData;
    this.vertexCount = this.posAttr.count;

    this.basePositions = new Float32Array(this.posAttr.array);
    this.resetAnim = null;

    this._buildAdjacency();
    this.updateCavityColors();
  }

  _buildWeldedCubeSphere(N, radius) {
    const pos = [];
    const uvs = [];
    const indices = [];
    const vertMap = new Map();

    const faces = [
      { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
      { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
      { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
      { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
      { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
      { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
    ];

    function getOrAdd(cx, cy, cz) {
      const key = `${Math.round(cx * N)},${Math.round(cy * N)},${Math.round(cz * N)}`;
      const existing = vertMap.get(key);
      if (existing !== undefined) return existing;

      const x2 = cx * cx;
      const y2 = cy * cy;
      const z2 = cz * cz;
      const sx = cx * Math.sqrt(Math.max(0, 1 - y2 * 0.5 - z2 * 0.5 + (y2 * z2) / 3));
      const sy = cy * Math.sqrt(Math.max(0, 1 - z2 * 0.5 - x2 * 0.5 + (z2 * x2) / 3));
      const sz = cz * Math.sqrt(Math.max(0, 1 - x2 * 0.5 - y2 * 0.5 + (x2 * y2) / 3));

      const idx = pos.length / 3;
      pos.push(sx * radius, sy * radius, sz * radius);

      const u = 0.5 + Math.atan2(sz, sx) / (2 * Math.PI);
      const v = 0.5 - Math.asin(Math.max(-1, Math.min(1, sy))) / Math.PI;
      uvs.push(u, v);

      vertMap.set(key, idx);
      return idx;
    }

    for (const f of faces) {
      const grid = new Int32Array((N + 1) * (N + 1));
      for (let iy = 0; iy <= N; iy++) {
        const tv = (iy / N) * 2 - 1;
        for (let ix = 0; ix <= N; ix++) {
          const tu = (ix / N) * 2 - 1;
          const cx = f.n[0] + f.u[0] * tu + f.v[0] * tv;
          const cy = f.n[1] + f.u[1] * tu + f.v[1] * tv;
          const cz = f.n[2] + f.u[2] * tu + f.v[2] * tv;
          grid[iy * (N + 1) + ix] = getOrAdd(cx, cy, cz);
        }
      }

      for (let iy = 0; iy < N; iy++) {
        for (let ix = 0; ix < N; ix++) {
          const a = grid[iy * (N + 1) + ix];
          const b = grid[iy * (N + 1) + ix + 1];
          const c = grid[(iy + 1) * (N + 1) + ix + 1];
          const d = grid[(iy + 1) * (N + 1) + ix];
          indices.push(a, b, c, a, c, d);
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    const sculptData = new Float32Array((pos.length / 3) * 3);
    for (let i = 0; i < sculptData.length; i += 3) {
      sculptData[i] = 1.0;     // AO
      sculptData[i + 1] = 0.5; // neutral depth
      sculptData[i + 2] = 0.0; // untouched mask
    }
    geo.setAttribute('sculptData', new THREE.Float32BufferAttribute(sculptData, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  _buildAdjacency() {
    const idx = this.geometry.index.array;
    const neighborSets = Array.from({ length: this.vertexCount }, () => new Set());
    const faceLists = Array.from({ length: this.vertexCount }, () => []);

    for (let f = 0; f < idx.length; f += 3) {
      const a = idx[f];
      const b = idx[f + 1];
      const c = idx[f + 2];
      neighborSets[a].add(b); neighborSets[a].add(c);
      neighborSets[b].add(a); neighborSets[b].add(c);
      neighborSets[c].add(a); neighborSets[c].add(b);
      faceLists[a].push(f);
      faceLists[b].push(f);
      faceLists[c].push(f);
    }

    this.neighbors = neighborSets.map((s) => Int32Array.from(s));
    this.vertexFaces = faceLists.map((list) => Int32Array.from(list));
    this._visitMark = new Uint32Array(this.vertexCount);
    this._visitStamp = 1;
    this._tmpSmooth = new Float32Array(this.vertexCount * 3);
  }

  // Recompute smooth area-weighted vertex normals only on touched vertices + their 1-ring
  _recomputeLocalNormals(vertices) {
    const pos = this.posAttr.array;
    const norm = this.normAttr.array;
    const idx = this.geometry.index.array;
    const stamp = ++this._visitStamp;
    const expanded = [];

    for (let i = 0; i < vertices.length; i++) {
      const v = vertices[i];
      if (this._visitMark[v] !== stamp) {
        this._visitMark[v] = stamp;
        expanded.push(v);
      }
      const nb = this.neighbors[v];
      for (let j = 0; j < nb.length; j++) {
        const n = nb[j];
        if (this._visitMark[n] !== stamp) {
          this._visitMark[n] = stamp;
          expanded.push(n);
        }
      }
    }

    for (let i = 0; i < expanded.length; i++) {
      const v = expanded[i];
      const faces = this.vertexFaces[v];
      let nx = 0, ny = 0, nz = 0;
      for (let k = 0; k < faces.length; k++) {
        const f = faces[k];
        const a3 = idx[f] * 3;
        const b3 = idx[f + 1] * 3;
        const c3 = idx[f + 2] * 3;

        const abx = pos[b3] - pos[a3];
        const aby = pos[b3 + 1] - pos[a3 + 1];
        const abz = pos[b3 + 2] - pos[a3 + 2];
        const acx = pos[c3] - pos[a3];
        const acy = pos[c3 + 1] - pos[a3 + 1];
        const acz = pos[c3 + 2] - pos[a3 + 2];

        nx += aby * acz - abz * acy;
        ny += abz * acx - abx * acz;
        nz += abx * acy - aby * acx;
      }
      const len = Math.hypot(nx, ny, nz) || 1;
      const v3 = v * 3;
      norm[v3] = nx / len;
      norm[v3 + 1] = ny / len;
      norm[v3 + 2] = nz / len;
    }

    this.normAttr.needsUpdate = true;
    return expanded;
  }

  snapshotForUndo() {
    this.history.push(new Float32Array(this.posAttr.array));
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  canUndo() {
    return this.history.length > 0;
  }

  undo() {
    if (!this.history.length) return false;
    const prev = this.history.pop();
    this.posAttr.array.set(prev);
    this.posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.updateCavityColors();
    this.geometry.computeBoundingSphere();
    return true;
  }

  startResetAnimation() {
    this.snapshotForUndo();
    this.resetAnim = {
      from: new Float32Array(this.posAttr.array),
      t: 0,
      duration: 0.45,
    };
  }

  stepAnimation(dt) {
    if (!this.resetAnim) return false;
    this.resetAnim.t += dt / this.resetAnim.duration;
    const p = Math.min(1, this.resetAnim.t);
    const e = 1 - Math.pow(1 - p, 3);
    const arr = this.posAttr.array;
    const from = this.resetAnim.from;
    const base = this.basePositions;
    for (let i = 0; i < arr.length; i++) {
      arr[i] = from[i] + (base[i] - from[i]) * e;
    }
    this.posAttr.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.updateCavityColors();
    if (p >= 1) {
      this.resetAnim = null;
      this.geometry.computeBoundingSphere();
    }
    return true;
  }

  // Capture vertices + smooth weights once at the start of a Pull/Grab stroke
  // (ZBrush Move / Blender Grab behavior: zero pinching, pure sculptural wave pulling)
  beginGrab(centerLocal, radius, symmetry = false) {
    const arr = this.posAttr.array;
    const r2 = radius * radius;
    const entries = [];
    const centers = symmetry
      ? [
          { x: centerLocal.x, y: centerLocal.y, z: centerLocal.z, signX: 1 },
          { x: -centerLocal.x, y: centerLocal.y, z: centerLocal.z, signX: -1 },
        ]
      : [{ x: centerLocal.x, y: centerLocal.y, z: centerLocal.z, signX: 1 }];

    for (let v = 0; v < this.vertexCount; v++) {
      const i3 = v * 3;
      const vx = arr[i3], vy = arr[i3 + 1], vz = arr[i3 + 2];

      let bestW = 0;
      let signX = 1;
      let totalW = 0;
      let sxAccum = 0;

      for (let c = 0; c < centers.length; c++) {
        const ctr = centers[c];
        const dx = vx - ctr.x;
        const dy = vy - ctr.y;
        const dz = vz - ctr.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 >= r2) continue;
        const u = Math.sqrt(d2) / radius;
        const w = Math.pow(0.5 + 0.5 * Math.cos(u * Math.PI), 1.65);
        totalW += w;
        sxAccum += w * ctr.signX;
        if (w > bestW) {
          bestW = w;
          signX = ctr.signX;
        }
      }

      if (bestW > 0.0005) {
        entries.push({
          v,
          x0: vx,
          y0: vy,
          z0: vz,
          w: Math.min(1, totalW),
          // Blend x-flip cleanly across the mirror plane so center vertices don't tear
          mirrorScaleX: totalW > 0 ? sxAccum / totalW : signX,
        });
      }
    }

    return { entries, symmetry };
  }

  // Smooth asymptotic radial containment: 1:1 free sculpting well beyond the sphere,
  // tapering organically at extremes instead of slamming flat against an invisible wall.
  _softClampRadius(tx, ty, tz) {
    const len = Math.hypot(tx, ty, tz) || 1;
    const softMax = this.radius * 2.85;
    const hardMax = this.radius * 4.40;
    const softMin = this.radius * 0.42;
    const hardMin = this.radius * 0.22;

    if (len > softMax) {
      const span = hardMax - softMax;
      const smoothLen = softMax + span * Math.tanh((len - softMax) / span);
      const s = smoothLen / len;
      return [tx * s, ty * s, tz * s];
    }
    if (len < softMin) {
      const span = softMin - hardMin;
      const smoothLen = softMin - span * Math.tanh((softMin - len) / span);
      const s = smoothLen / len;
      return [tx * s, ty * s, tz * s];
    }
    return [tx, ty, tz];
  }

  updateGrab(grabSession, totalDeltaLocal, materialId = 'clay') {
    if (!grabSession || !grabSession.entries.length) return false;
    const arr = this.posAttr.array;
    const entries = grabSession.entries;
    const gain = materialId === 'chrome' ? 1.18 : materialId === 'glass' ? 1.0 : 1.06;

    const dx = totalDeltaLocal.x * gain;
    const dy = totalDeltaLocal.y * gain;
    const dz = totalDeltaLocal.z * gain;

    const touched = new Int32Array(entries.length);

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const i3 = e.v * 3;
      const [tx, ty, tz] = this._softClampRadius(
        e.x0 + dx * e.w * e.mirrorScaleX,
        e.y0 + dy * e.w,
        e.z0 + dz * e.w
      );

      arr[i3] = tx;
      arr[i3 + 1] = ty;
      arr[i3 + 2] = tz;
      touched[i] = e.v;
    }

    // Smooth liquid surface-tension relaxation (extra pass on long stretches keeps tips silky & rounded)
    const relax = materialId === 'chrome' ? 0.18 : materialId === 'glass' ? 0.15 : 0.06;
    if (relax > 0) {
      const stretchDist = Math.hypot(dx, dy, dz);
      const passes = stretchDist > 0.65 ? 3 : stretchDist > 0.30 ? 2 : 1;
      for (let p = 0; p < passes; p++) {
        this._relaxSubset(touched, relax);
      }
    }

    this.posAttr.needsUpdate = true;
    const expanded = this._recomputeLocalNormals(touched);
    this.updateCavityColors(expanded);
    this.geometry.computeBoundingSphere();
    return true;
  }

  _relaxSubset(vertices, factor) {
    const arr = this.posAttr.array;
    const tmp = this._tmpSmooth;
    for (let k = 0; k < vertices.length; k++) {
      const v = vertices[k];
      const nb = this.neighbors[v];
      let ax = 0, ay = 0, az = 0;
      for (let j = 0; j < nb.length; j++) {
        const n3 = nb[j] * 3;
        ax += arr[n3]; ay += arr[n3 + 1]; az += arr[n3 + 2];
      }
      const inv = 1 / Math.max(1, nb.length);
      const i3 = v * 3;
      tmp[i3] = arr[i3] + (ax * inv - arr[i3]) * factor;
      tmp[i3 + 1] = arr[i3 + 1] + (ay * inv - arr[i3 + 1]) * factor;
      tmp[i3 + 2] = arr[i3 + 2] + (az * inv - arr[i3 + 2]) * factor;
    }
    for (let k = 0; k < vertices.length; k++) {
      const i3 = vertices[k] * 3;
      arr[i3] = tmp[i3];
      arr[i3 + 1] = tmp[i3 + 1];
      arr[i3 + 2] = tmp[i3 + 2];
    }
  }

  // Continuous sub-stepped Push / Build / Smooth brush stroke (zero dotted scalloping)
  applyStroke({
    fromLocal,
    toLocal,
    normalLocal,
    mode = 'push', // 'push' | 'build' | 'smooth'
    radius = 0.42,
    strength = 0.045,
    materialId = 'clay',
    symmetry = false,
  }) {
    const dist = fromLocal ? fromLocal.distanceTo(toLocal) : 0;
    const stepSize = Math.max(0.035, radius * 0.22);
    const steps = fromLocal ? Math.max(1, Math.min(8, Math.ceil(dist / stepSize))) : 1;
    const perStepStrength = steps > 1 ? strength / Math.pow(steps, 0.55) : strength;
    const pt = new THREE.Vector3();
    let changed = false;

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      if (fromLocal) pt.lerpVectors(fromLocal, toLocal, t);
      else pt.copy(toLocal);

      if (this._applyDab(pt, normalLocal, mode, radius, perStepStrength, materialId)) {
        changed = true;
      }
      if (symmetry) {
        const mirPt = new THREE.Vector3(-pt.x, pt.y, pt.z);
        const mirN = new THREE.Vector3(-normalLocal.x, normalLocal.y, normalLocal.z).normalize();
        if (this._applyDab(mirPt, mirN, mode, radius, perStepStrength, materialId)) {
          changed = true;
        }
      }
    }
    return changed;
  }

  _applyDab(centerLocal, fallbackNormal, mode, radius, strength, materialId) {
    const arr = this.posAttr.array;
    const norm = this.normAttr.array;
    const cx = centerLocal.x, cy = centerLocal.y, cz = centerLocal.z;
    const r2 = radius * radius;

    const affected = [];
    const falloffs = [];

    // Compute coherent average surface normal across the brush footprint (eliminates spikes!)
    let avgNx = 0, avgNy = 0, avgNz = 0;

    for (let v = 0; v < this.vertexCount; v++) {
      const i3 = v * 3;
      const dx = arr[i3] - cx;
      const dy = arr[i3 + 1] - cy;
      const dz = arr[i3 + 2] - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r2) continue;

      const u = Math.sqrt(d2) / radius;
      const w = Math.pow(0.5 + 0.5 * Math.cos(u * Math.PI), 1.85);
      affected.push(v);
      falloffs.push(u);

      avgNx += norm[i3] * w;
      avgNy += norm[i3 + 1] * w;
      avgNz += norm[i3 + 2] * w;
    }

    if (!affected.length) return false;

    const nLen = Math.hypot(avgNx, avgNy, avgNz);
    const nx = nLen > 0.001 ? avgNx / nLen : fallbackNormal.x;
    const ny = nLen > 0.001 ? avgNy / nLen : fallbackNormal.y;
    const nz = nLen > 0.001 ? avgNz / nLen : fallbackNormal.z;

    if (mode === 'smooth') {
      const tmp = this._tmpSmooth;
      for (let k = 0; k < affected.length; k++) {
        const v = affected[k];
        const u = falloffs[k];
        const w = Math.pow(0.5 + 0.5 * Math.cos(u * Math.PI), 1.4) * Math.min(0.85, strength);
        const nb = this.neighbors[v];
        let ax = 0, ay = 0, az = 0;
        for (let j = 0; j < nb.length; j++) {
          const n3 = nb[j] * 3;
          ax += arr[n3]; ay += arr[n3 + 1]; az += arr[n3 + 2];
        }
        const inv = 1 / Math.max(1, nb.length);
        const i3 = v * 3;
        tmp[i3] = arr[i3] + (ax * inv - arr[i3]) * w;
        tmp[i3 + 1] = arr[i3 + 1] + (ay * inv - arr[i3 + 1]) * w;
        tmp[i3 + 2] = arr[i3 + 2] + (az * inv - arr[i3 + 2]) * w;
      }
      for (let k = 0; k < affected.length; k++) {
        const i3 = affected[k] * 3;
        arr[i3] = tmp[i3];
        arr[i3 + 1] = tmp[i3 + 1];
        arr[i3 + 2] = tmp[i3 + 2];
      }
    } else {
      const sign = mode === 'build' ? 1 : -1;
      // Material-matched rim displacement: ceramic clay builds a crisp tactile displaced lip around hollows
      const rimFactor = mode === 'push'
        ? (materialId === 'clay' ? 0.24 : materialId === 'chrome' ? 0.14 : 0.08)
        : 0;

      for (let k = 0; k < affected.length; k++) {
        const v = affected[k];
        const u = falloffs[k];
        const bell = Math.pow(0.5 + 0.5 * Math.cos(u * Math.PI), 1.9);
        const rim = rimFactor > 0 ? Math.sin(u * Math.PI) * Math.pow(u, 1.35) * strength * rimFactor : 0;
        const disp = sign * bell * strength + rim;

        const i3 = v * 3;
        const [tx, ty, tz] = this._softClampRadius(
          arr[i3] + nx * disp,
          arr[i3 + 1] + ny * disp,
          arr[i3 + 2] + nz * disp
        );

        arr[i3] = tx;
        arr[i3 + 1] = ty;
        arr[i3 + 2] = tz;
      }

      // Surface tension relaxation matched to material
      const relax = materialId === 'chrome' ? 0.20 : materialId === 'glass' ? 0.18 : 0.05;
      if (relax > 0) {
        this._relaxSubset(affected, relax);
      }
    }

    this.posAttr.needsUpdate = true;
    const expanded = this._recomputeLocalNormals(affected);
    this.updateCavityColors(expanded);
    this.geometry.computeBoundingSphere();
    return true;
  }

  // Cavity + local mean-curvature shading encoded in vertex color:
  // R = depth/cavity factor (0..1, 0.5 = neutral sphere, <0.5 = hollowed, >0.5 = raised)
  // G = local concavity AO (darkens real stoneware grooves & thumb creases)
  // B = sculpt intensity (used by Glass shader to polish carved lenses & Clay shader for crease grit)
  updateCavityColors(subset = null) {
    const arr = this.posAttr.array;
    const col = this.sculptDataAttr.array;
    const r0 = this.radius;

    const process = (v) => {
      const i3 = v * 3;
      const vx = arr[i3], vy = arr[i3 + 1], vz = arr[i3 + 2];
      const dist = Math.hypot(vx, vy, vz);
      const delta = (dist - r0) / r0;

      // Measure true local curvature against 1-ring neighbors for crisp groove occlusion
      const nb = this.neighbors[v];
      let avgR = 0;
      for (let j = 0; j < nb.length; j++) {
        const n3 = nb[j] * 3;
        avgR += Math.hypot(arr[n3], arr[n3 + 1], arr[n3 + 2]);
      }
      avgR /= Math.max(1, nb.length);
      const curv = (dist - avgR) / r0;

      const ao = Math.max(0.56, Math.min(1.10, 0.98 + delta * 0.55 + curv * 7.5));
      const sculptMask = Math.min(1, Math.abs(delta) * 5.5 + Math.abs(curv) * 30.0);
      const depthNorm = Math.max(0, Math.min(1, 0.5 + delta * 2.2));

      col[i3] = ao;
      col[i3 + 1] = depthNorm;
      col[i3 + 2] = sculptMask;
    };

    if (subset) {
      for (let i = 0; i < subset.length; i++) process(subset[i]);
    } else {
      for (let v = 0; v < this.vertexCount; v++) process(v);
    }
    this.sculptDataAttr.needsUpdate = true;
  }
}
