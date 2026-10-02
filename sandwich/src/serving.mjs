import * as THREE from 'three';
import { cutGeometry } from './cutting.mjs';
import { createKnife } from './knife.mjs';
import { createFocacciaCrumbTexture } from './focaccia.mjs';

const KNIFE_ALIGN_END = 0.42;
const KNIFE_CUT_END = 1.22;
const KNIFE_LIFT_END = 1.52;
const KNIFE_RETURN_END = 1.84;

export class AnchoredSpring {
  constructor(flex = 1) {
    this.flex = flex;
    this.x = this.z = this.vx = this.vz = 0;
  }
  impulse(x, z) {
    this.vx += THREE.MathUtils.clamp(x, -3, 3) * this.flex;
    this.vz += THREE.MathUtils.clamp(z, -3, 3) * this.flex;
  }
  step(dt, reduced = false) {
    if (reduced) {
      this.x = this.z = this.vx = this.vz = 0;
      return;
    }
    const steps = Math.max(1, Math.ceil(dt * 120)),
      h = Math.min(dt, 0.1) / steps;
    for (let i = 0; i < steps; i++) {
      for (const [p, v] of [
        ['x', 'vx'],
        ['z', 'vz'],
      ]) {
        this[v] += (-95 * this[p] - 9 * this[v]) * h;
        this[p] = THREE.MathUtils.clamp(
          this[p] + this[v] * h,
          -0.085 * this.flex,
          0.085 * this.flex,
        );
      }
    }
    if (Math.max(Math.abs(this.x), Math.abs(this.z), Math.abs(this.vx), Math.abs(this.vz)) < 1e-6)
      this.x = this.z = this.vx = this.vz = 0;
  }
}

function rememberSkin(mesh) {
  mesh.userData.restPositions = mesh.geometry.attributes.position.array.slice();
  mesh.userData.restNormals = mesh.geometry.attributes.normal.array.slice();
  mesh.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.attributes.normal.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
}

// Bend all layers together to preserve contact between them.
export function bendServingSkin(mesh, centerY, height, x, z) {
  const last = mesh.userData.servingBend;
  if (last && last.x === x && last.z === z && last.centerY === centerY && last.height === height) return false;
  mesh.userData.servingBend = { x, z, centerY, height };
  const p = mesh.geometry.attributes.position, n = mesh.geometry.attributes.normal;
  const rest = mesh.userData.restPositions, normals = mesh.userData.restNormals;
  const span = Math.max(1, height);
  for (let i = 0; i < p.count; i++) {
    const k = i * 3, y = rest[k + 1] + centerY + height / 2;
    const bend = y * y / span, slope = 2 * y / span;
    p.setXYZ(i, rest[k] - z * bend, rest[k + 1], rest[k + 2] + x * bend);
    const ny = normals[k + 1] + z * slope * normals[k] - x * slope * normals[k + 2];
    const length = Math.hypot(normals[k], ny, normals[k + 2]) || 1;
    n.setXYZ(i, normals[k] / length, ny / length, normals[k + 2] / length);
  }
  p.needsUpdate = n.needsUpdate = true;
  return true;
}

function bakedGeometry(mesh) {
  // MarchingCubes preallocates a large buffer. Copy only its visible triangles.
  const original = mesh.geometry;
  let geometry;
  if (!original.index && Number.isFinite(original.drawRange.count)) {
    geometry = new THREE.BufferGeometry();
    for (const [name, attr] of Object.entries(original.attributes)) {
      const start = original.drawRange.start * attr.itemSize;
      const end = Math.min(
        attr.array.length,
        start + original.drawRange.count * attr.itemSize,
      );
      geometry.setAttribute(
        name,
        new THREE.BufferAttribute(
          attr.array.slice(start, end),
          attr.itemSize,
          attr.normalized,
        ),
      );
    }
  } else geometry = original.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  return geometry;
}

function cutMaterial(spec) {
  if (spec.id === 'focaccia')
    return new THREE.MeshToonMaterial({
      color: '#fff0cf',
      map: createFocacciaCrumbTexture(),
      side: THREE.DoubleSide,
      emissive: '#fff0d0',
      emissiveIntensity: 0.13,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  const interiors = {
    focaccia: '#fff0cf',
    sourdough: '#f4e4c6',
    'milk-bread': '#fff0d0',
    bun: '#f8ddb0',
    top: '#f8ddb0',
    chicken: '#f6e5cc',
    cod: '#fff4df',
    falafel: '#9baf65',
    brie: '#f8df9b',
    'roast-beef': '#b17a76',
    avocado: '#e2eaa6',
  };
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = interiors[spec.id] || spec.color;
  ctx.fillRect(0, 0, 128, 128);
  // Interior texture for cut faces.
  const fibrous = ['chicken', 'cod', 'roast-beef'].includes(spec.id);
  for (let i = 0; i < 65; i++) {
    const x = (i * 47.13) % 128,
      y = (i * 73.71) % 128;
    ctx.fillStyle = i % 3 ? 'rgba(108,75,32,.09)' : 'rgba(255,255,255,.3)';
    ctx.beginPath();
    ctx.ellipse(
      x,
      y,
      fibrous ? 7 : 1.5 + (i % 3),
      fibrous ? 0.5 : 1 + (i % 2),
      fibrous ? -0.3 : i,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshToonMaterial({
    map: texture,
    side: THREE.DoubleSide,
    emissive: spec.id === 'focaccia' ? '#fff0d0' : '#000000',
    emissiveIntensity: spec.id === 'focaccia' ? 0.13 : 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
}

// Snapshot the settled meshes; leave the build simulation unchanged.
export class ServingAssembly {
  constructor(sources) {
    this.root = new THREE.Group();
    this.whole = new THREE.Group();
    this.halves = [new THREE.Group(), new THREE.Group()];
    this.root.add(this.whole, ...this.halves);
    this.halves.forEach((half) => {
      half.visible = false;
    });
    this.entries = [];
    this.cutEntries = [];
    this.capMaterials = new Map();
    this.velocity = new THREE.Vector2();
    this.spring = new AnchoredSpring(0.75);
    this.cut = false;
    this.gap = 0;
    this.knifeTime = -1;
    this.needsRender = true;
    this.knife = createKnife();
    this.knife.visible = false;
    this.root.add(this.knife);
    const snapshots = [];
    const bounds = new THREE.Box3();
    for (const { model, spec } of sources) {
      model.updateMatrixWorld(true);
      const meshes = [],
        itemBounds = new THREE.Box3();
      model.traverseVisible((mesh) => {
        if (!mesh.isMesh) return;
        const geometry = bakedGeometry(mesh);
        if (!geometry.attributes.position.count) {
          geometry.dispose();
          return;
        }
        geometry.computeBoundingBox();
        itemBounds.union(geometry.boundingBox);
        meshes.push({ geometry, material: mesh.material });
      });
      if (!meshes.length) continue;
      bounds.union(itemBounds);
      snapshots.push({
        meshes,
        spec,
        center: itemBounds.getCenter(new THREE.Vector3()),
      });
    }
    this.size = bounds.getSize(new THREE.Vector3());
    this.center = bounds.getCenter(new THREE.Vector3());
    this.root.position.set(0, Math.max(1.8, this.size.y / 2 + 0.7), 0);
    for (const snapshot of snapshots) {
      const group = new THREE.Group();
      group.position.copy(snapshot.center).sub(this.center);
      for (const { geometry, material } of snapshot.meshes) {
        geometry.translate(
          -snapshot.center.x,
          -snapshot.center.y,
          -snapshot.center.z,
        );
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = mesh.receiveShadow = true;
        rememberSkin(mesh);
        group.add(mesh);
      }
      this.whole.add(group);
      this.entries.push({
        group,
        spec: snapshot.spec,
      });
    }
  }

  rotate(dx, dy, cameraQuaternion, dt = 1 / 60) {
    if (this.knifeTime >= 0) return;
    this.needsRender = true;
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cameraQuaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(cameraQuaternion);
    const q = new THREE.Quaternion().setFromAxisAngle(up, dx);
    q.multiply(new THREE.Quaternion().setFromAxisAngle(right, dy));
    this.root.quaternion.premultiply(q).normalize();
    this.velocity.set(
      THREE.MathUtils.clamp(dx / Math.max(dt, 0.016), -4, 4),
      THREE.MathUtils.clamp(dy / Math.max(dt, 0.016), -4, 4),
    );
    this.spring.impulse(dy * 8, -dx * 8);
  }

  ring() {
    this.spring.impulse(0.5, -0.35);
  }

  toggleCut(reduced = false, origin = null, restingQuaternion = null, restingScale = 1) {
    if (this.knifeTime >= 0) return;
    if (!this.cutEntries.length) this.prepareCut();
    this.cut = !this.cut;
    this.knifeTime = this.cut && !reduced ? 0 : -1;
    this.knife.visible = this.knifeTime >= 0;
    this.velocity.set(0, 0);
    this.knifeOrigin = origin?.clone() || new THREE.Vector3(0, this.size.y / 2 + 2.3, 0);
    this.knifeRestingQuaternion = restingQuaternion?.clone() ||
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 1.22, -Math.PI / 2));
    this.knifeRestingScale = restingScale;
    this.knifeStartRotation = this.root.quaternion.clone();
    this.root.updateMatrixWorld(true);
    this.knifeOriginWorld = this.root.localToWorld(this.knifeOrigin.clone());
    this.knifeRestingWorldQuaternion = this.root.quaternion.clone()
      .multiply(this.knifeRestingQuaternion);
    this.knife.position.copy(this.knifeOrigin);
    this.knife.quaternion.copy(this.knifeRestingQuaternion);
    this.knife.scale.setScalar(restingScale);
    this.ring();
  }

  prepareCut() {
    for (const entry of this.entries) {
      const material =
        this.capMaterials.get(entry.spec.id) || cutMaterial(entry.spec);
      this.capMaterials.set(entry.spec.id, material);
      const groups = this.halves.map(() => new THREE.Group());
      entry.group.children.forEach((mesh) => {
        const rest = mesh.geometry.clone();
        rest.attributes.position.array.set(mesh.userData.restPositions);
        rest.attributes.normal.array.set(mesh.userData.restNormals);
        const halves = cutGeometry(rest, -entry.group.position.x);
        rest.dispose();
        halves.forEach(({ skin, cap }, i) => {
          if (skin.attributes.position.count)
            groups[i].add(new THREE.Mesh(skin, mesh.material));
          else skin.dispose();
          if (cap.attributes.position.count) {
            const face = new THREE.Mesh(cap, material);
            face.userData.cutFace = true;
            groups[i].add(face);
          } else cap.dispose();
        });
      });
      groups.forEach((group, i) => {
        group.traverse((mesh) => {
          if (mesh.isMesh) {
            rememberSkin(mesh);
            mesh.castShadow = true;
            mesh.receiveShadow = !(
              entry.spec.id === 'focaccia' && mesh.userData.cutFace
            );
          }
        });
        group.position.copy(entry.group.position);
        this.halves[i].add(group);
        this.cutEntries.push({
          group,
          spec: entry.spec,
        });
      });
    }
  }

  step(dt, cameraQuaternion, dragging = false, reduced = false) {
    let changed = this.needsRender;
    if (!dragging && !reduced && this.velocity.lengthSq() > 0.00001) {
      const velocity = this.velocity.clone().multiplyScalar(Math.exp(-dt * 5));
      this.rotate(velocity.x * dt, velocity.y * dt, cameraQuaternion, dt);
      this.velocity.copy(velocity);
    } else if (reduced && !dragging) this.velocity.set(0, 0);
    if (this.knifeTime >= 0) {
      changed = true;
      this.knifeTime += dt;
      const t = this.knifeTime;
      const top = new THREE.Vector3(0, this.size.y / 2 + 0.4, 0).add(this.root.position);
      const bottom = new THREE.Vector3(0, -this.size.y / 2 - 0.25, 0).add(this.root.position);
      const upright = new THREE.Quaternion();
      const position = new THREE.Vector3();
      const orientation = new THREE.Quaternion();
      // Use world space so the knife descends vertically after rotating the stack.
      const alignment = THREE.MathUtils.smoothstep(t, 0, KNIFE_ALIGN_END);
      this.root.quaternion.slerpQuaternions(this.knifeStartRotation, upright, alignment);
      if (t < KNIFE_ALIGN_END) {
        const p = alignment;
        position.lerpVectors(this.knifeOriginWorld, top, p);
        orientation.slerpQuaternions(this.knifeRestingWorldQuaternion, upright, p);
        this.knife.scale.setScalar(THREE.MathUtils.lerp(this.knifeRestingScale, 1, p));
      } else if (t < KNIFE_CUT_END) {
        const p = (t - KNIFE_ALIGN_END) / (KNIFE_CUT_END - KNIFE_ALIGN_END);
        position.lerpVectors(top, bottom, p);
        position.z += Math.sin(p * Math.PI * 6) * Math.sin(p * Math.PI) * 0.17;
        this.knife.scale.setScalar(1);
      } else if (t < KNIFE_LIFT_END) {
        const p = THREE.MathUtils.smoothstep(t, KNIFE_CUT_END, KNIFE_LIFT_END);
        position.lerpVectors(bottom, top, p);
        this.knife.scale.setScalar(1);
      } else {
        const p = THREE.MathUtils.smoothstep(t, KNIFE_LIFT_END, KNIFE_RETURN_END);
        position.lerpVectors(top, this.knifeOriginWorld, p);
        orientation.slerpQuaternions(upright, this.knifeRestingWorldQuaternion, p);
        this.knife.scale.setScalar(THREE.MathUtils.lerp(1, this.knifeRestingScale, p));
      }
      this.root.updateMatrixWorld(true);
      this.knife.position.copy(this.root.worldToLocal(position));
      this.knife.quaternion.copy(this.root.quaternion).invert().multiply(orientation);
      if (t >= KNIFE_RETURN_END) {
        this.knife.visible = false;
        this.knifeTime = -1;
      }
    }
    const target =
      this.cut && (this.knifeTime < 0 || this.knifeTime >= KNIFE_CUT_END) ? 1 : 0;
    const previousGap = this.gap;
    this.gap += (target - this.gap) * (reduced ? 1 : 1 - Math.exp(-dt * 8));
    if (Math.abs(target - this.gap) < 1e-6) this.gap = target;
    if (this.gap !== previousGap) changed = true;
    this.whole.visible = !this.cut && this.gap < 0.002;
    for (let i = 0; i < 2; i++) {
      this.halves[i].visible = !this.whole.visible;
      this.halves[i].position.x = (i ? 1 : -1) * this.gap * 0.55;
      this.halves[i].rotation.y = (i ? 1 : -1) * this.gap * 0.36;
    }
    this.spring.step(dt, reduced);
    for (const entry of this.whole.visible ? this.entries : this.cutEntries)
      for (const mesh of entry.group.children)
        if (bendServingSkin(mesh, entry.group.position.y, this.size.y, this.spring.x, this.spring.z)) changed = true;
    changed ||= this.needsRender;
    this.needsRender = false;
    return changed;
  }

  dispose() {
    this.root.traverse((mesh) => {
      if (mesh.geometry) mesh.geometry.dispose();
    });
    this.knife.traverse((mesh) => {
      if (mesh.material) mesh.material.dispose();
    });
    for (const material of this.capMaterials.values()) {
      material.map.dispose();
      material.dispose();
    }
    this.root.removeFromParent();
  }
}

let audioContext;
export function ringBell() {
  const recording = document.querySelector('#bell-audio');
  if (recording?.getAttribute('src')) {
    recording.pause();
    recording.currentTime = 0;
    recording.volume = 0.7;
    void recording.play().catch((error) => {
      // A second tap deliberately interrupts the previous play request.
      if (error.name !== 'AbortError') synthesizedBell();
    });
    return;
  }
  synthesizedBell();
}

function synthesizedBell() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  try {
    audioContext ??= new AudioContext();
    void audioContext
      .resume()
      .then(() => {
        const t = audioContext.currentTime;
        // Inharmonic partials and a short attack give a service bell its metallic ding.
        for (const [frequency, level, decay] of [
          [1360, 0.19, 1.5],
          [2728, 0.065, 0.8],
          [3911, 0.035, 0.45],
          [5670, 0.012, 0.18],
        ]) {
          const oscillator = audioContext.createOscillator(),
            gain = audioContext.createGain();
          oscillator.frequency.setValueAtTime(frequency, t);
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(level, t + 0.003);
          gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
          oscillator.connect(gain);
          gain.connect(audioContext.destination);
          oscillator.start(t);
          oscillator.stop(t + decay + 0.02);
          oscillator.onended = () => {
            oscillator.disconnect();
            gain.disconnect();
          };
        }
      })
      .catch(() => {});
  } catch {
    /* Serving remains usable on browsers without audio output. */
  }
}
