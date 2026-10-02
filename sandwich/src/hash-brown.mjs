import * as THREE from 'three';

const templates = new Map();
const materials = new WeakMap();
const clamp = THREE.MathUtils.clamp;

function random(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function buildGeometry(spec) {
  const rand = random(202);
  // Short potato shreds merge into the crust instead of sitting on it as toppings.
  const shreds = Array.from({ length: 220 }, () => {
    const angle = rand() * Math.PI;
    return {
      x: (rand() * 2 - 1) * spec.radius,
      z: (rand() * 2 - 1) * spec.depth,
      cos: Math.cos(angle), sin: Math.sin(angle),
      length: 0.04 + rand() * 0.065,
      width: 0.016 + rand() * 0.023,
      height: 0.018 + rand() * 0.014,
    };
  });
  const bubbles = Array.from({ length: 150 }, () => ({
    x: (rand() * 2 - 1) * spec.radius,
    z: (rand() * 2 - 1) * spec.depth,
    radius: 0.023 + rand() * 0.039,
    height: 0.016 + rand() * 0.016,
  }));
  const geometry = new THREE.BoxGeometry(
    spec.radius * 2, spec.height - 0.044, spec.depth * 2, 76, 8, 84,
  );
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const bevel = 0.075;
  const core = new THREE.Vector3(spec.radius - bevel,
    (spec.height - 0.044) / 2 - bevel, spec.depth - bevel);
  const p = new THREE.Vector3(), centre = new THREE.Vector3(), normal = new THREE.Vector3();
  const gold = new THREE.Color('#dda13f');
  const toast = new THREE.Color('#93501c');
  const light = new THREE.Color('#f6cd75');
  for (let i = 0; i < positions.count; i++) {
    p.fromBufferAttribute(positions, i);
    centre.set(clamp(p.x, -core.x, core.x), clamp(p.y, -core.y, core.y),
      clamp(p.z, -core.z, core.z));
    normal.copy(p).sub(centre).normalize();
    p.copy(centre).addScaledVector(normal, bevel);
    const x = p.x, z = p.z;
    let relief = 0;
    for (const s of shreds) {
      const dx = x - s.x, dz = z - s.z;
      if (Math.abs(dx) + Math.abs(dz) > s.length * 2) continue;
      const along = (dx * s.cos + dz * s.sin) / s.length;
      const across = (-dx * s.sin + dz * s.cos) / s.width;
      const d = along * along + across * across;
      if (d < 5) relief = Math.max(relief, s.height * Math.exp(-d * 1.5));
    }
    for (const b of bubbles) {
      const d = ((x - b.x) ** 2 + (z - b.z) ** 2) / b.radius ** 2;
      if (d < 4) relief = Math.max(relief, b.height * Math.exp(-d * 1.8));
    }
    const grit = Math.sin(x * 163 + z * 91 + p.y * 37) *
      Math.sin(z * 147 - x * 79 + p.y * 43);
    const mottling = Math.sin(x * 27 + z * 19) * Math.sin(z * 31 - x * 13);
    const face = Math.abs(normal.y);
    const crust = relief * face + 0.005 * grit + 0.004 * mottling +
      (1 - face) * 0.008 * Math.sin(x * 37 + z * 29 + p.y * 43);
    p.addScaledVector(normal, crust);
    // Keep the rough skin close to the existing collision surface for stacking.
    positions.setXYZ(i, p.x, clamp(p.y, -spec.height / 2 - 0.009,
      spec.height / 2 + 0.009), p.z);
    const ridge = clamp((relief / 0.027) * face +
      (1 - face) * (0.35 + grit * 0.19 + mottling * 0.14), 0, 1);
    const color = gold.clone().lerp(toast,
      clamp((0.47 - ridge) * 1.25 + mottling * 0.23 + (1 - face) * 0.24, 0, 0.78));
    color.lerp(light, clamp((ridge - 0.18) * 0.77 + grit * 0.08, 0, 0.7));
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createHashBrownGeometry(spec) {
  const key = [spec.radius, spec.depth, spec.height].join(':');
  if (!templates.has(key)) templates.set(key, buildGeometry(spec));
  return templates.get(key).clone();
}

export function addHashBrown(group, spec, gradient) {
  if (!materials.has(gradient)) materials.set(gradient, new THREE.MeshToonMaterial({
    vertexColors: true, gradientMap: gradient, side: THREE.DoubleSide,
  }));
  const mesh = new THREE.Mesh(createHashBrownGeometry(spec), materials.get(gradient));
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
}
