import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { batteredPoint } from './shapes.mjs';

const templates = new Map();
const materials = new WeakMap();
const clamp = THREE.MathUtils.clamp;

function random(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const blisterRandom = random(617);
const blisters = Array.from({ length: 95 }, () => {
  const angle = blisterRandom() * Math.PI * 2;
  const r = Math.sqrt(blisterRandom());
  return {
    x: Math.cos(angle) * r,
    z: Math.sin(angle) * r,
    rx: 0.065 + blisterRandom() * 0.10,
    rz: 0.027 + blisterRandom() * 0.055,
    rise: 0.035 + blisterRandom() * 0.045,
  };
});

// Limit crust displacement to the collision envelope.
function crust(spec, x, y, z) {
  const cod = spec.id === 'cod';
  const fold = cod
    ? Math.sin(z * 39 + Math.sin(x * 8 + z * 5) * 2.8)
    : Math.sin(x * 19 + z * 13 + Math.sin(z * 16) * 1.7);
  const grain = Math.sin(x * 61 + z * 37) * Math.sin(z * 57 - y * 39);
  const ridge = Math.pow(0.5 + fold * 0.5, 2);
  let bubble = 0;
  if (cod)
    for (const b of blisters) {
      const distance = ((x - b.x) / b.rx) ** 2 + ((z - b.z) / b.rz) ** 2;
      bubble = Math.max(bubble, b.rise * Math.exp(-distance * 1.5));
    }
  const height = (cod ? 0.018 : 0.052) * ridge + 0.011 * grain + bubble;
  const normal = new THREE.Vector3(x * 0.65, y, z * 0.5).normalize();
  const p = new THREE.Vector3(...batteredPoint(spec, x, y, z));
  p.addScaledVector(normal, height);
  // Irregular edge profile for the chicken coating.
  const rim =
    (cod ? 0.028 : 0.03) *
    (Math.sin(Math.atan2(z, x) * 11 + 0.5) + 0.45 * Math.cos(z * 27 + x * 24));
  p.x += x * rim;
  p.z += z * rim;
  return {
    p,
    ridge: cod ? clamp(ridge * 0.36 + bubble * 12, 0, 1) : ridge,
    grain,
  };
}

function buildGeometry(spec) {
  const cod = spec.id === 'cod';
  const rand = random(cod ? 108 : 59);
  const gold = new THREE.Color(spec.color);
  const pale = new THREE.Color(cod ? '#ffdc76' : '#ffce72');
  const toast = new THREE.Color(cod ? '#aa3306' : '#982c0b');
  const geometry = new THREE.SphereGeometry(1, 112, 72);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i),
      y = positions.getY(i),
      z = positions.getZ(i);
    const { p, ridge, grain } = crust(spec, x, y, z);
    positions.setXYZ(i, p.x, p.y, p.z);
    const mottling = Math.sin(x * 10 - z * 13) * Math.sin(z * 18 + y * 9);
    const color = gold.clone();
    color.lerp(
      toast,
      clamp((0.54 - ridge) * 1.55 + mottling * 0.52 + (0.2 - y) * 0.4, 0, 0.94),
    );
    color.lerp(pale, clamp((ridge - 0.25) * 0.9 + grain * 0.1, 0, 0.74));
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const pieces = [geometry];

  // Embed the chicken flakes at their roots to avoid gaps.
  const count = cod ? 0 : 155;
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const r = i % 4 === 0 ? 0.965 + rand() * 0.034 : Math.sqrt(rand()) * 0.998;
    const x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    const y = Math.sqrt(1 - r * r);
    const { p } = crust(spec, x, y, z);
    const normal = new THREE.Vector3(
      x / spec.radius, y / (spec.height * 0.5), z / spec.depth,
    ).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const tilt = new THREE.Quaternion().setFromUnitVectors(up, normal);
    const spin = new THREE.Quaternion().setFromAxisAngle(up, rand() * Math.PI * 2);
    tilt.multiply(spin);
    const width = 0.045 + rand() * 0.09;
    const length = 0.10 + rand() * 0.14;
    const height = 0.015 + rand() * 0.02;
    const flake = new THREE.SphereGeometry(1, 10, 8);
    const fp = flake.attributes.position;
    const fc = new Float32Array(fp.count * 3);
    const shade = rand();
    for (let v = 0; v < fp.count; v++) {
      const fx = fp.getX(v),
        fy = fp.getY(v),
        fz = fp.getZ(v);
      const serration = 1 + 0.24 * Math.sin(fx * 9 + fz * 8);
      const vertex = new THREE.Vector3(
        fx * width * serration,
        fy * height +
          0.052 * Math.sin(fz * 4 + fx * 2) * (1 - fx * fx) - height * 0.28,
        fz * length * serration,
      ).applyQuaternion(tilt).add(p);
      fp.setXYZ(v, vertex.x, vertex.y, vertex.z);
      const color = gold.clone().lerp(
        toast, clamp((0.45 - fy) * 0.8 + (shade - 0.35) * 1.05, 0, 0.87),
      );
      color.lerp(
        pale, clamp((fy - 0.1) * (0.35 + (1 - shade) * 0.5), 0, 0.75),
      );
      color.toArray(fc, v * 3);
    }
    flake.setAttribute('color', new THREE.BufferAttribute(fc, 3));
    flake.computeVertexNormals();
    pieces.push(flake);
  }
  const merged = mergeGeometries(pieces);
  pieces.forEach((piece) => piece.dispose());
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

export function createBatteredGeometry(spec) {
  const key = [spec.id, spec.radius, spec.depth, spec.height, spec.color].join(':');
  if (!templates.has(key)) templates.set(key, buildGeometry(spec));
  return templates.get(key).clone();
}

export function addBatteredFood(group, spec, gradient) {
  if (!materials.has(gradient))
    materials.set(gradient, new THREE.MeshToonMaterial({
      vertexColors: true,
      gradientMap: gradient,
      side: THREE.DoubleSide,
    }));
  const mesh = new THREE.Mesh(createBatteredGeometry(spec), materials.get(gradient));
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
}
