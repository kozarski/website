import * as THREE from 'three';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

function random(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

const rand = random(1029);
const bubbles = [];
for (let row = 0; row < 4; row++)
  for (let col = 0; col < 5; col++) {
    bubbles.push({
      x: -0.98 + col * 0.48 + (rand() - 0.5) * 0.34,
      z: -0.73 + row * 0.49 + (rand() - 0.5) * 0.31,
      rx: 0.22 + rand() * 0.16,
      rz: 0.19 + rand() * 0.17,
      rise: 0.057 + rand() * 0.04,
    });
  }
const dimples = [];
for (let row = 0; row < 3; row++)
  for (let col = 0; col < 4; col++) {
    dimples.push({
      x: -0.76 + col * 0.49 + (rand() - 0.5) * 0.18,
      z: -0.49 + row * 0.48 + (rand() - 0.5) * 0.14,
    });
  }

export function focacciaTop(x, z) {
  let rise = 0;
  for (const bubble of bubbles) {
    const d =
      ((x - bubble.x) / bubble.rx) ** 2 + ((z - bubble.z) / bubble.rz) ** 2;
    rise = Math.max(rise, bubble.rise * Math.exp(-d * 1.3));
  }
  let pressed = 0;
  for (const dimple of dimples)
    pressed +=
      0.065 *
      Math.exp(-(((x - dimple.x) / 0.09) ** 2 + ((z - dimple.z) / 0.075) ** 2));
  return (
    0.175 +
    rise -
    pressed +
    Math.sin(x * 32 + z * 19) * Math.sin(z * 37 - x * 12) * 0.0025
  );
}

export function createFocacciaCrumbTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d'),
    noise = random(5201);
  ctx.fillStyle = '#fffdf4';
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 1100; i++) {
    const x = noise() * 512,
      y = noise() * 512;
    const r = 0.65 + noise() ** 2 * 5.2;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(noise() * Math.PI);
    ctx.scale(1 + noise() * 0.75, 0.65 + noise() * 0.45);
    const shade = ctx.createRadialGradient(-r * 0.16, -r * 0.18, 0, 0, 0, r);
    shade.addColorStop(0, 'rgba(139,104,51,.45)');
    shade.addColorStop(0.6, 'rgba(180,146,88,.28)');
    shade.addColorStop(1, 'rgba(205,179,125,0)');
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(0, 0.3, r * 0.85, 0.15, 2.8);
    ctx.stroke();
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  return texture;
}

// Vary cavity shape and height, including openings along the cut edges.
const pores = [];
for (let row = 0; row < 7; row++)
  for (let col = 0; col < 8; col++) {
    pores.push({
      x: -1.13 + col * 0.32 + (rand() - 0.5) * 0.25,
      z: -0.96 + row * 0.32 + (rand() - 0.5) * 0.24,
      y: -0.035 + (rand() - 0.5) * 0.15,
      rx: 0.105 + rand() * 0.125,
      ry: 0.09 + rand() * 0.12,
      rz: 0.09 + rand() * 0.1,
      lean: (rand() - 0.5) * 1.1,
      phase: rand() * 10,
    });
  }
for (let i = 0; i < 125; i++) {
  pores.push({
    x: (rand() - 0.5) * 2.36,
    z: (rand() - 0.5) * 1.99,
    y: -0.15 + rand() * 0.27,
    rx: 0.022 + rand() * 0.045,
    ry: 0.023 + rand() * 0.05,
    rz: 0.025 + rand() * 0.05,
    lean: 0.2,
    phase: rand() * 10,
  });
}

let template;
export function createFocacciaGeometry() {
  if (template) return template.clone();
  const n = 48,
    scale = new THREE.Vector3(1.29, 0.38, 1.1);
  const volume = new MarchingCubes(n, undefined, false, false, 100000);
  volume.isolation = 0;
  const top = new Float32Array(n * n);
  for (let z = 0; z < n; z++)
    for (let x = 0; x < n; x++) {
      const px = ((x / n) * 2 - 1) * scale.x,
        pz = ((z / n) * 2 - 1) * scale.z;
      top[x + z * n] = focacciaTop(px, pz);
      for (let y = 0; y < n; y++) {
        const py = ((y / n) * 2 - 1) * scale.y;
        const edgeX = 1.165 + Math.sin(pz * 11) * 0.005 - Math.abs(px);
        const edgeZ = 0.975 + Math.sin(px * 17) * 0.005 - Math.abs(pz);
        // Round the crust corners.
        const corner =
          0.022 -
          Math.hypot(
            Math.max(0, Math.abs(px) - 1.143),
            Math.max(0, Math.abs(pz) - 0.953),
          );
        volume.field[x + y * n + z * n * n] = Math.min(
          edgeX,
          edgeZ,
          corner,
          py + 0.24,
          top[x + z * n] - py,
        );
      }
    }
  for (const pore of pores) {
    const min = [
      pore.x - pore.rx * 1.7,
      pore.y - pore.ry * 1.2,
      pore.z - pore.rz * 1.2,
    ];
    const max = [
      pore.x + pore.rx * 1.7,
      pore.y + pore.ry * 1.2,
      pore.z + pore.rz * 1.2,
    ];
    const lo = min.map((p, i) =>
      Math.max(1, Math.floor(((p / scale.getComponent(i) + 1) * n) / 2)),
    );
    const hi = max.map((p, i) =>
      Math.min(n - 2, Math.ceil(((p / scale.getComponent(i) + 1) * n) / 2)),
    );
    for (let z = lo[2]; z <= hi[2]; z++)
      for (let y = lo[1]; y <= hi[1]; y++)
        for (let x = lo[0]; x <= hi[0]; x++) {
          const px = ((x / n) * 2 - 1) * scale.x,
            py = ((y / n) * 2 - 1) * scale.y,
            pz = ((z / n) * 2 - 1) * scale.z;
          const dy = (py - pore.y) / pore.ry;
          const dx = (px - pore.x - (py - pore.y) * pore.lean) / pore.rx;
          const dz = (pz - pore.z) / pore.rz;
          const uneven =
            1 +
            0.055 * Math.sin(dx * 4 + pore.phase) * Math.sin(dz * 4 - dy * 3);
          const cavity =
            (Math.sqrt(dx * dx + dy * dy + dz * dz) - uneven) *
            Math.min(pore.rx, pore.ry, pore.rz);
          const roof = py - (top[x + z * n] - 0.04),
            floor = -0.212 - py;
          const i = x + y * n + z * n * n;
          volume.field[i] = Math.min(
            volume.field[i],
            Math.max(cavity, roof, floor),
          );
        }
  }
  volume.update();
  const geometry = new THREE.BufferGeometry();
  for (const name of ['position', 'normal'])
    geometry.setAttribute(
      name,
      new THREE.Float32BufferAttribute(
        volume.geometry.attributes[name].array.slice(0, volume.count * 3),
        3,
      ),
    );
  geometry.scale(scale.x, scale.y, scale.z);
  volume.geometry.dispose();
  volume.material.dispose();
  const position = geometry.attributes.position,
    color = new Float32Array(position.count * 3),
    uv = new Float32Array(position.count * 2);
  const cream = new THREE.Color('#fff0cb'),
    warmCrumb = new THREE.Color('#c59d60');
  const paleGold = new THREE.Color('#e4b150'),
    gold = new THREE.Color('#b96822'),
    toast = new THREE.Color('#8b3915');
  const c = new THREE.Color();
  let groupStart = 0,
    lastMaterial = -1;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      y = position.getY(i),
      z = position.getZ(i);
    const h = focacciaTop(x, z),
      crust = y > h - 0.028;
    if (crust) {
      const browning = THREE.MathUtils.clamp(
        (h - 0.168) / 0.08 +
          0.13 * Math.sin(x * 18 + z * 9) +
          0.07 * Math.sin(x * 51 - z * 31),
        0,
        1,
      );
      c.copy(paleGold)
        .lerp(gold, Math.min(1, browning * 1.5))
        .lerp(toast, Math.max(0, (browning - 0.68) * 1.9));
      c.multiplyScalar(1 + 0.035 * Math.sin(x * 139 + z * 97));
    } else if (y < -0.216) c.copy(gold).lerp(toast, 0.23);
    else {
      const edgeDistance = Math.min(1.17 - Math.abs(x), 0.98 - Math.abs(z));
      c.copy(cream).lerp(
        warmCrumb,
        THREE.MathUtils.clamp(edgeDistance * 6, 0, 0.75),
      );
    }
    color.set([c.r, c.g, c.b], i * 3);
    uv.set(
      [(Math.abs(x) / 1.17 > Math.abs(z) / 0.98 ? z : x) * 0.45, y * 0.45],
      i * 2,
    );
    if (i % 3 === 0) {
      const surface =
        [i, i + 1, i + 2].reduce(
          (sum, j) =>
            sum +
            (position.getY(j) >
            focacciaTop(position.getX(j), position.getZ(j)) - 0.029
              ? 1
              : 0),
          0,
        ) >= 2
          ? 1
          : 0;
      if (surface !== lastMaterial) {
        if (lastMaterial >= 0)
          geometry.addGroup(groupStart, i - groupStart, lastMaterial);
        groupStart = i;
        lastMaterial = surface;
      }
    }
  }
  geometry.addGroup(groupStart, position.count - groupStart, lastMaterial);
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  // Two contiguous material groups avoid one draw call per marching-cubes row.
  const ordered = [[], []];
  for (const group of geometry.groups)
    for (let i = group.start; i < group.start + group.count; i++)
      ordered[group.materialIndex].push(i);
  const order = ordered.flat();
  for (const [name, attr] of Object.entries(geometry.attributes)) {
    const values = new Float32Array(attr.array.length);
    order.forEach((source, i) => {
      for (let j = 0; j < attr.itemSize; j++)
        values[i * attr.itemSize + j] = attr.array[source * attr.itemSize + j];
    });
    geometry.setAttribute(
      name,
      new THREE.Float32BufferAttribute(values, attr.itemSize),
    );
  }
  geometry.clearGroups();
  geometry.addGroup(0, ordered[0].length, 0);
  geometry.addGroup(ordered[0].length, ordered[1].length, 1);
  template = mergeVertices(geometry, 1e-5);
  geometry.dispose();
  return template.clone();
}

let materials;
export function addFocaccia(group, gradient) {
  materials ??= [
    new THREE.MeshToonMaterial({
      vertexColors: true,
      map: createFocacciaCrumbTexture(),
      gradientMap: gradient,
      side: THREE.DoubleSide,
      emissive: '#fff0d0',
      emissiveIntensity: 0.1,
    }),
    new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 42,
      specular: '#bb9863',
      side: THREE.DoubleSide,
    }),
    new THREE.MeshToonMaterial({
      color: '#31431c',
      gradientMap: gradient,
      side: THREE.DoubleSide,
    }),
    new THREE.MeshToonMaterial({
      color: '#7d8540',
      gradientMap: gradient,
      side: THREE.DoubleSide,
    }),
    new THREE.MeshPhongMaterial({ color: '#fff4d9', shininess: 75 }),
    new THREE.MeshToonMaterial({ color: '#97511d', gradientMap: gradient }),
  ];
  const body = new THREE.Mesh(createFocacciaGeometry(), materials.slice(0, 2));
  body.castShadow = body.receiveShadow = true;
  group.add(body);
  const herbs = random(861);
  const add = (geometry, material) => {
    const mesh = new THREE.Mesh(geometry, materials[material]);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  for (let i = 0; i < 13; i++) {
    const x = (herbs() - 0.5) * 1.84,
      z = (herbs() - 0.5) * 1.44,
      a = herbs() * Math.PI * 2;
    const length = 0.13 + herbs() * 0.15;
    const sample = (along, across = 0, lift = 0.012) => {
      const px = x + Math.cos(a) * along - Math.sin(a) * across;
      const pz = z + Math.sin(a) * along + Math.cos(a) * across;
      return new THREE.Vector3(px, focacciaTop(px, pz) + lift, pz);
    };
    add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3([
          sample(-length / 2),
          sample(0),
          sample(length / 2),
        ]),
        8,
        0.0045,
        5,
        false,
      ),
      2,
    );
    for (let j = 0; j < 4; j++)
      for (const side of [-1, 1]) {
        const t = (j / 4 - 0.5) * length;
        const points = [
          sample(t),
          sample(t + 0.035, side * 0.035, 0.022),
          sample(t + 0.065, side * 0.054, 0.016),
        ];
        add(
          new THREE.TubeGeometry(
            new THREE.CatmullRomCurve3(points),
            5,
            0.004 + herbs() * 0.002,
            4,
            false,
          ),
          j % 3 ? 2 : 3,
        );
      }
  }
  for (let i = 0; i < 46; i++) {
    const x = (herbs() - 0.5) * 2.14,
      z = (herbs() - 0.5) * 1.78;
    const salt = add(new THREE.OctahedronGeometry(0.007 + herbs() * 0.008), 4);
    salt.position.set(x, focacciaTop(x, z) + 0.008, z);
    salt.scale.set(1.4, 0.35, 0.9);
    salt.rotation.y = herbs() * 6;
  }
  for (let i = 0; i < 15; i++) {
    const bubble = bubbles[(i * 7) % bubbles.length],
      a = herbs() * 6;
    const points = Array.from({ length: 7 }, (_, j) => {
      const t = (j / 6 - 0.5) * 0.19;
      const x = bubble.x + Math.cos(a) * t + Math.sin(j * 1.8) * 0.009;
      const z = bubble.z + Math.sin(a) * t;
      return new THREE.Vector3(x, focacciaTop(x, z) + 0.0015, z);
    });
    if (points.some((p) => Math.abs(p.x) > 1.14 || Math.abs(p.z) > 0.95))
      continue;
    add(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        12,
        0.0018,
        3,
        false,
      ),
      5,
    );
  }
}
