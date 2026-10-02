import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CATALOG } from './catalog.mjs';
import { MarchingCubes } from 'three/addons/objects/MarchingCubes.js';
import { sampleSheet } from './physics.mjs';
import { addFocaccia } from './focaccia.mjs';
import { addBatteredFood } from './battered.mjs';
import { addHashBrown } from './hash-brown.mjs';
import {
  sheetPoint,
  fluidPoints,
  clusterParts,
  avocadoPoint,
  avocadoSlices,
} from './shapes.mjs';

const materialCache = new Map();
const gradient = new THREE.DataTexture(
  new Uint8Array([105, 155, 202, 238, 255]),
  5,
  1,
  THREE.RedFormat,
);
gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
gradient.needsUpdate = true;
function random(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function paintedTexture(kind, base) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const rand = random([...kind].reduce((n, c) => n + c.charCodeAt(0), 1));
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 512, 512);
  // Painted colour variation.
  for (let i = 0; i < 34; i++) {
    const x = rand() * 512,
      y = rand() * 512,
      w = 30 + rand() * 130,
      h = 10 + rand() * 65;
    ctx.fillStyle =
      i % 3 === 0 ? 'rgba(112,49,32,.075)' : 'rgba(255,248,212,.13)';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y - h * 0.23);
    ctx.lineTo(x + w * 0.85, y + h * 0.54);
    ctx.lineTo(x + w * 0.15, y + h);
    ctx.closePath();
    ctx.fill();
  }
  if (['crumb', 'focaccia'].includes(kind)) {
    for (let i = 0; i < (kind === 'crumb' ? 28 : 16); i++) {
      const x = 30 + rand() * 452,
        y = 30 + rand() * 452;
      ctx.fillStyle = kind === 'crumb' ? '#dfba7b' : '#c4873e';
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        4 + rand() * 8,
        3 + rand() * 6,
        rand() * 3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      if (kind === 'focaccia') {
        ctx.strokeStyle = '#5b713b';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x + 4, y - 10);
        ctx.lineTo(x + 22, y - 22);
        ctx.stroke();
        ctx.strokeStyle = '#fff0bc';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x - 7, y + 9);
        ctx.lineTo(x + 5, y + 10);
        ctx.stroke();
      }
    }
  }
  if (kind === 'mortadella') {
    for (let i = 0; i < 24; i++) {
      const x = rand() * 512,
        y = rand() * 512;
      ctx.fillStyle = i % 5 === 0 ? '#94a457' : '#ffe3cc';
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        8 + rand() * 8,
        5 + rand() * 10,
        rand() * 6,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  if (['prosciutto', 'roast-beef'].includes(kind)) {
    ctx.strokeStyle = kind === 'roast-beef' ? '#754d40' : '#ffe3d5';
    ctx.lineWidth = kind === 'roast-beef' ? 11 : 23;
    ctx.beginPath();
    ctx.ellipse(256, 256, 232, 225, -0.2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(105, 200);
    ctx.bezierCurveTo(230, 250, 260, 380, 420, 320);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (kind === 'roast-beef') {
    // Roast beef fibres.
    for (let i = 0; i < 210; i++) {
      const x = rand() * 540 - 14,
        y = rand() * 510;
      ctx.strokeStyle = ['#795047', '#dab4a2', '#bc887a', '#efcfc0'][i % 4];
      ctx.lineWidth = 0.8 + rand() * 2.4;
      ctx.globalAlpha = 0.35 + rand() * 0.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(
        x + 12,
        y + 12,
        x - 6,
        y + 30,
        x + 13,
        y + 35 + rand() * 110,
      );
      ctx.stroke();
      if (i % 5 === 0) {
        ctx.beginPath();
        ctx.moveTo(x, y + 8);
        ctx.lineTo(x + 20, y + 28);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
  if (kind === 'tamago-layers') {
    ctx.fillStyle = '#f3d778';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 7; i++) {
      const y = 30 + i * 73;
      ctx.strokeStyle = i % 2 ? '#d9a541' : '#fff0a5';
      ctx.lineWidth = i % 2 ? 7 : 12;
      ctx.beginPath();
      ctx.moveTo(-10, y);
      ctx.bezierCurveTo(120, y + 30, 360, y - 24, 525, y + 7);
      ctx.stroke();
    }
  }
  if (kind === 'tamago') {
    for (let i = 0; i < 17; i++) {
      const x = rand() * 512,
        y = rand() * 512;
      const g = ctx.createRadialGradient(x, y, 2, x, y, 20 + rand() * 55);
      g.addColorStop(0, 'rgba(186,113,35,.28)');
      g.addColorStop(1, 'rgba(186,113,35,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 85, y - 85, 170, 170);
    }
  }
  if (kind === 'cucumber') {
    ctx.fillStyle = '#dfeac1';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#7ca258';
    ctx.lineWidth = 27;
    ctx.beginPath();
    ctx.arc(256, 256, 235, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(256, 256);
      ctx.rotate((i * Math.PI * 2) / 3);
      ctx.fillStyle = '#bed494';
      ctx.beginPath();
      ctx.ellipse(75, 0, 94, 55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f8f3ce';
      for (let j = 0; j < 5; j++) {
        ctx.beginPath();
        ctx.ellipse(
          26 + j * 25,
          (j % 2 ? -1 : 1) * 15,
          15,
          6,
          j % 2 ? -0.25 : 0.25,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
      ctx.restore();
    }
  }
  if (kind === 'tomato') {
    // Heirloom flesh shifts from green shoulders through gold into a red blush.
    // Keep the colour field continuous across the rind and seed chambers.
    const heirloomGradient = (colors) => {
      const fill = ctx.createLinearGradient(55, 90, 450, 415);
      for (const [offset, color] of colors) fill.addColorStop(offset, color);
      return fill;
    };
    ctx.fillStyle = heirloomGradient([
      [0, '#779a36'], [0.25, '#c3bb35'], [0.43, '#edb63c'],
      [0.68, '#e46339'], [1, '#bf343d'],
    ]);
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = heirloomGradient([
      [0, '#afc653'], [0.25, '#e6d35c'], [0.43, '#ffd366'],
      [0.68, '#f59356'], [1, '#ed6656'],
    ]);
    ctx.beginPath();
    ctx.arc(256, 256, 216, 0, Math.PI * 2);
    ctx.fill();
    // Blend the tomato colour transitions.
    const blush = ctx.createRadialGradient(342, 344, 18, 324, 330, 204);
    blush.addColorStop(0, 'rgba(235,71,61,.3)');
    blush.addColorStop(1, 'rgba(235,71,61,0)');
    ctx.fillStyle = blush;
    ctx.fillRect(0, 0, 512, 512);
    const chambers = heirloomGradient([
      [0, '#708e36'], [0.25, '#b8ac3b'], [0.43, '#dd9f3b'],
      [0.68, '#d85538'], [1, '#b93740'],
    ]);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      ctx.save();
      ctx.translate(256, 256);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.quadraticCurveTo(130, -95, 194, -43);
      ctx.quadraticCurveTo(213, 25, 176, 69);
      ctx.quadraticCurveTo(96, 63, 20, 0);
      ctx.restore();
      ctx.fillStyle = chambers;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,231,146,.24)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.save();
      ctx.translate(256, 256);
      ctx.rotate(a);
      ctx.fillStyle = '#ffe3a0';
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.ellipse(105 + k * 22, -25 + k * 16, 11, 4, 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.fillStyle = '#ffd092';
    ctx.beginPath();
    ctx.arc(256, 256, 24, 0, Math.PI * 2);
    ctx.fill();
  }
  if (kind === 'lettuce') {
    ctx.strokeStyle = '#c4d87b';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(240, 495);
    ctx.quadraticCurveTo(290, 280, 250, 55);
    ctx.stroke();
    ctx.lineWidth = 3;
    for (let i = 1; i < 6; i++) {
      const y = 80 + i * 60;
      ctx.beginPath();
      ctx.moveTo(260, y);
      ctx.lineTo(100, y - 54);
      ctx.moveTo(260, y);
      ctx.lineTo(400, y - 64);
      ctx.stroke();
    }
  }
  if (kind === 'aubergine') {
    ctx.strokeStyle = '#625070';
    ctx.lineWidth = 29;
    ctx.beginPath();
    ctx.arc(256, 256, 245, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#a17d4b';
    ctx.lineWidth = 15;
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(80 + i * 95, 100);
      ctx.lineTo(80 + i * 95, 390);
      ctx.stroke();
    }
    ctx.fillStyle = '#f3dfa6';
    for (let i = 0; i < 10; i++) {
      ctx.beginPath();
      ctx.ellipse(
        120 + rand() * 260,
        120 + rand() * 260,
        8,
        4,
        rand() * 3,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  if (kind === 'pickles') {
    ctx.strokeStyle = '#6b8037';
    ctx.lineWidth = 36;
    ctx.beginPath();
    ctx.arc(256, 256, 238, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ced58d';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(256, 256, 163, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.fillStyle = '#e4e8b1';
      ctx.beginPath();
      ctx.ellipse(
        256 + Math.cos(a) * 100,
        256 + Math.sin(a) * 100,
        20,
        9,
        a,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  if (kind === 'tofu') {
    ctx.strokeStyle = '#b97c41';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(20, 60 + i * 95);
      ctx.lineTo(480, 95 + i * 95);
      ctx.stroke();
    }
  }
  if (kind === 'bacon') {
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = i % 2 ? '#edb59a' : '#873e32';
      ctx.lineWidth = i % 2 ? 47 : 16;
      ctx.beginPath();
      ctx.moveTo(50 + i * 120, 0);
      ctx.bezierCurveTo(130 + i * 120, 140, i * 120, 340, 80 + i * 120, 512);
      ctx.stroke();
    }
  }
  if (kind === 'pepper') {
    // Align char marks with the length of the pepper.
    for (let i = 0; i < 10; i++) {
      const x = 54 + (i % 5) * 98 + (rand() - 0.5) * 24,
        y = 16 + Math.floor(i / 5) * 265 + rand() * 45,
        length = 132 + rand() * 105,
        width = 5 + rand() * 6,
        lean = (rand() - 0.5) * 16;
      const edge = Array.from({ length: 13 }, (_, j) => {
        const t = j / 12;
        return {
          x: x + lean * t + Math.sin(t * 7 + i) * 3,
          y: y + length * t,
          width: width * Math.pow(Math.sin(t * Math.PI), 0.45) * (0.75 + rand() * 0.35),
        };
      });
      for (const [scale, color] of [
        [1.45, '#813025'],
        [1, i % 3 === 0 ? '#30201a' : '#211915'],
      ]) {
        ctx.fillStyle = color;
        ctx.beginPath();
        edge.forEach((p, j) => {
          if (j === 0) ctx.moveTo(p.x - p.width * scale, p.y);
          else ctx.lineTo(p.x - p.width * scale, p.y);
        });
        for (let j = edge.length - 1; j >= 0; j--) {
          const p = edge[j];
          ctx.lineTo(p.x + p.width * scale, p.y);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  if (['chicken', 'cod', 'falafel'].includes(kind)) {
    for (let i = 0; i < 95; i++) {
      ctx.fillStyle = i % 3 ? 'rgba(117,68,26,.25)' : 'rgba(255,223,139,.6)';
      const x = rand() * 512,
        y = rand() * 512;
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        2 + rand() * 8,
        2 + rand() * 4,
        rand() * 6,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  if (kind === 'avocado') {
    const g = ctx.createRadialGradient(256, 256, 40, 256, 256, 250);
    g.addColorStop(0, '#e3df86');
    g.addColorStop(0.7, '#bdcf68');
    g.addColorStop(1, '#6f993e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
  }
  // Halftone shading.
  ctx.fillStyle = 'rgba(90,47,47,.08)';
  for (let y = 330; y < 480; y += 7)
    for (let x = 30; x < 150 + (y - 330) * 0.6; x += 7) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function material(color, kind = 'plain') {
  const key = color + kind;
  if (!materialCache.has(key))
    materialCache.set(
      key,
      new THREE.MeshToonMaterial({
        color: 0xffffff,
        map: paintedTexture(kind, color),
        gradientMap: gradient,
        side: THREE.DoubleSide,
      }),
    );
  return materialCache.get(key);
}
function addMesh(group, geometry, color, kind = 'plain', position = [0, 0, 0]) {
  const mesh = new THREE.Mesh(geometry, material(color, kind));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function box(
  group,
  w,
  h,
  d,
  color,
  position = [0, 0, 0],
  kind = 'plain',
  radius = 0.09,
) {
  return addMesh(
    group,
    new RoundedBoxGeometry(w, h, d, 3, radius),
    color,
    kind,
    position,
  );
}
function disk(group, r, h, color, kind = 'plain', y = 0, zScale = 1) {
  const mesh = addMesh(
    group,
    new THREE.CylinderGeometry(r, r, h, 48, 1),
    color,
    'plain',
    [0, y, 0],
  );
  mesh.scale.z = zScale;
  const top = addMesh(
    group,
    new THREE.CircleGeometry(r * 0.99, 48),
    color,
    kind,
    [0, y + h / 2 + 0.002, 0],
  );
  top.rotation.x = -Math.PI / 2;
  top.scale.y = zScale;
  return mesh;
}
function breadShape() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.82, -1);
  shape.quadraticCurveTo(-1.04, -1, -1.04, -0.77);
  shape.lineTo(-1.04, 0.35);
  shape.bezierCurveTo(-1.32, 0.8, -1.05, 1.13, -0.45, 1.07);
  shape.quadraticCurveTo(0, 0.96, 0.45, 1.07);
  shape.bezierCurveTo(1.05, 1.13, 1.32, 0.8, 1.04, 0.35);
  shape.lineTo(1.04, -0.77);
  shape.quadraticCurveTo(1.04, -1, 0.82, -1);
  shape.closePath();
  return shape;
}
function extrude(group, shape, h, color, kind = 'plain', y = 0) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: h,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.025,
    bevelThickness: 0.025,
    curveSegments: 12,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, y - h / 2, 0);
  // Planar UVs keep painted patches at the same scale across the face.
  const uv = geometry.attributes.uv,
    p = geometry.attributes.position;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, p.getX(i) / 2.5 + 0.5, p.getZ(i) / 2.5 + 0.5);
  return addMesh(group, geometry, color, kind);
}

function sheet(group, spec) {
  const n = spec.id === 'roast-beef' ? 36 : 28,
    vertices = [],
    uvs = [],
    logical = [],
    indices = [];
  const count = (n + 1) ** 2;
  // A closed skin: the thickness bends with the collision tiles, including its rim.
  for (const side of [1, -1]) {
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const u = (i / n) * 2 - 1,
          v = (j / n) * 2 - 1;
        const [x, y, z] = sheetPoint(spec, u, v);
        vertices.push(x, y + (side * spec.height) / 2, z);
        logical.push(u, v);
        uvs.push(x / spec.radius / 2 + 0.5, z / spec.depth / 2 + 0.5);
        if (i < n && j < n) {
          const k = (side === 1 ? 0 : count) + j * (n + 1) + i;
          if (side === 1)
            indices.push(k, k + n + 1, k + 1, k + 1, k + n + 1, k + n + 2);
          else indices.push(k, k + 1, k + n + 1, k + 1, k + n + 2, k + n + 1);
        }
      }
  }
  const rim = [];
  for (let i = 0; i < n; i++) rim.push(i);
  for (let j = 0; j < n; j++) rim.push(j * (n + 1) + n);
  for (let i = n; i > 0; i--) rim.push(n * (n + 1) + i);
  for (let j = n; j > 0; j--) rim.push(j * (n + 1));
  for (let i = 0; i < rim.length; i++) {
    const a = rim[i],
      b = rim[(i + 1) % rim.length];
    indices.push(a, b, a + count, b, b + count, a + count);
  }
  const mainIndexCount = indices.length;
  if (spec.id === 'roast-beef') {
    const rand = random(319);
    for (let strand = 0; strand < 32; strand++) {
      const u0 = (rand() - 0.5) * 1.65,
        v0 = (rand() - 0.5) * 1.3;
      const length = 0.2 + rand() * 0.46,
        start = vertices.length / 3;
      for (let j = 0; j <= 8; j++)
        for (const side of [-1, 1]) {
          const u = u0 + Math.sin(j * 0.6 + strand) * 0.018 + side * 0.0035;
          const v = Math.min(0.96, v0 + (j / 8) * length);
          const [x, y, z] = sheetPoint(spec, u, v);
          vertices.push(x, y + spec.height / 2 + 0.004, z);
          logical.push(u, v);
          uvs.push(u / 2 + 0.5, v / 2 + 0.5);
          if (j < 8 && side === -1) {
            const k = start + j * 2;
            indices.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
          }
        }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(vertices, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = addMesh(group, geometry, spec.color, spec.id);
  if (spec.id === 'roast-beef') {
    mesh.material = [mesh.material, material('#d7b0a0')];
    geometry.addGroup(0, mainIndexCount, 0);
    geometry.addGroup(mainIndexCount, indices.length - mainIndexCount, 1);
  }
  mesh.frustumCulled = false;
  group.userData.surface = { mesh, base: new Float32Array(vertices), logical };
}

function avocadoFan(group) {
  const n = 36,
    bands = 6;
  for (const slice of avocadoSlices()) {
    const vertices = [],
      colors = [],
      indices = [];
    for (const side of [1, -1])
      for (let i = 0; i <= n; i++)
        for (let j = 0; j <= bands; j++) {
          const band = j / bands;
          const [x, , z] = avocadoPoint((i / n) * Math.PI, band);
          vertices.push(x, side * 0.06, z);
          const color = new THREE.Color('#f0edb0').lerp(
            new THREE.Color('#72a341'),
            Math.pow(band, 2.4),
          );
          if (side < 0 || j === bands)
            color.lerp(new THREE.Color('#548c32'), side < 0 ? 0.4 : 0.45);
          colors.push(color.r, color.g, color.b);
          if (i < n && j < bands) {
            const k =
              (side > 0 ? 0 : (n + 1) * (bands + 1)) + i * (bands + 1) + j;
            if (side < 0)
              indices.push(
                k,
                k + 1,
                k + bands + 1,
                k + 1,
                k + bands + 2,
                k + bands + 1,
              );
            else
              indices.push(
                k,
                k + bands + 1,
                k + 1,
                k + 1,
                k + bands + 1,
                k + bands + 2,
              );
          }
        }
    const count = (n + 1) * (bands + 1),
      rim = [];
    for (let j = 0; j < bands; j++) rim.push(j);
    for (let i = 0; i < n; i++) rim.push(i * (bands + 1) + bands);
    for (let j = bands; j > 0; j--) rim.push(n * (bands + 1) + j);
    for (let i = n; i > 0; i--) rim.push(i * (bands + 1));
    for (let i = 0; i < rim.length; i++) {
      const a = rim[i],
        b = rim[(i + 1) % rim.length];
      indices.push(a, b, a + count, b, b + count, a + count);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    if (!materialCache.has('avocado-fan'))
      materialCache.set(
        'avocado-fan',
        new THREE.MeshToonMaterial({
          vertexColors: true,
          gradientMap: gradient,
          side: THREE.DoubleSide,
        }),
      );
    const mesh = new THREE.Mesh(geometry, materialCache.get('avocado-fan'));
    mesh.position.set(...slice.position);
    mesh.rotation.y = slice.angle;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
  }
}

function roughLump(group, color, kind, radii, seed = 81) {
  const geometry = new THREE.SphereGeometry(1, 24, 14);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i),
      y = p.getY(i),
      z = p.getZ(i);
    const r =
      1 +
      0.045 * Math.sin(x * 24 + seed) * Math.sin(z * 27 + y * 16) +
      0.03 * Math.cos(z * 8 - x * 9);
    p.setXYZ(i, x * radii[0] * r, y * radii[1] * r, z * radii[2] * r);
  }
  geometry.computeVertexNormals();
  return addMesh(group, geometry, color, kind);
}

function makeFluid(group, spec) {
  const key = `fluid-${spec.id}`;
  if (!materialCache.has(key))
    materialCache.set(
      key,
      new THREE.MeshPhongMaterial({
        color: spec.color,
        shininess:
          spec.id === 'chilli-crisp' ? 110 : spec.id === 'hummus' ? 8 : 24,
        specular:
          spec.id === 'chilli-crisp'
            ? '#ffdc91'
            : spec.id === 'hummus'
              ? '#383128'
              : '#77716a',
        transparent: spec.id === 'chilli-crisp',
        opacity: spec.id === 'chilli-crisp' ? 0.68 : 1,
        depthWrite: spec.id !== 'chilli-crisp',
      }),
    );
  const mesh = new MarchingCubes(
    36,
    materialCache.get(key),
    false,
    false,
    10000,
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  group.add(mesh);
  const flecks = [];
  if (spec.flecks)
    for (let i = 0; i < (spec.flecks === 'chilli' ? 120 : 11); i++) {
      const seed = spec.flecks === 'chilli' && i % 5 === 0;
      const flake = addMesh(
        group,
        seed
          ? new THREE.SphereGeometry(0.019, 7, 4)
          : new THREE.IcosahedronGeometry(
              spec.flecks === 'chilli' ? 0.021 : 0.028,
              0,
            ),
        spec.flecks === 'chilli'
          ? seed
            ? '#f3ce7d'
            : ['#662510', '#8e2c13', '#b5421b', '#4a2319'][i % 4]
          : '#c0c77a',
      );
      flake.scale.set(
        seed ? 1.15 : 1.3 + 0.4 * Math.sin(i * 3),
        seed ? 0.25 : 0.4,
        seed ? 0.7 : 1,
      );
      flake.rotation.y = i * 2.4;
      flecks.push(flake);
    }
  group.userData.fluid = {
    mesh,
    flecks,
    points: fluidPoints(spec).map((p) => new THREE.Vector3(...p)),
  };
  updateFluid(group, spec);
}

const fluidCenter = new THREE.Vector3();
function updateFluid(group, spec, item = null) {
  const { mesh, flecks, points } = group.userData.fluid;
  if (item) {
    const parts = [...(item.seam ?? []), ...item.parts];
    points.length = parts.length;
    for (let i = 0; i < parts.length; i++)
      (points[i] ??= new THREE.Vector3()).copy(parts[i].body.position);
  }
  mesh.visible = points.length > 0;
  for (let i = 0; i < flecks.length; i++)
    flecks[i].visible =
      spec.flecks === 'chilli' ? i < points.length * 3 : points.length > 2;
  if (!points.length) return;
  fluidCenter.set(0, 0, 0);
  for (const p of points) fluidCenter.add(p);
  fluidCenter.multiplyScalar(1 / points.length);
  // Flatten kernels to join the sauce surface without adding excess height.
  const kernelWidth =
    spec.flecks === 'chilli'
      ? 2.1
      : item?.stream
        ? 1.6
        : spec.ribbon
          ? 1.35
          : 1.9;
  const verticalScale =
    spec.flecks === 'chilli' ? 0.36 : item?.stream ? 0.8 : 1 / kernelWidth;
  let half = 0.65;
  for (const p of points)
    half = Math.max(
      half,
      Math.abs(p.x - fluidCenter.x) + 0.3,
      Math.abs(p.y - fluidCenter.y) / verticalScale + 0.3,
      Math.abs(p.z - fluidCenter.z) + 0.3,
    );
  mesh.position.copy(fluidCenter);
  mesh.scale.set(half, half * verticalScale, half);
  mesh.reset();
  // Metaballs join adjacent collision particles into one continuous sauce surface.
  const strength =
    110 * ((spec.particleRadius * kernelWidth) / (2 * half)) ** 2;
  for (const p of points)
    mesh.addBall(
      (p.x - fluidCenter.x) / (2 * half) + 0.5,
      (p.y - fluidCenter.y) / (2 * half * verticalScale) + 0.5,
      (p.z - fluidCenter.z) / (2 * half) + 0.5,
      strength,
      12,
    );
  mesh.update();
  for (let i = 0; i < flecks.length; i++) {
    if (!flecks[i].visible) continue;
    flecks[i].position.copy(points[(i * 2) % points.length]);
    if (spec.flecks === 'chilli') {
      flecks[i].position.x += Math.sin(i * 2.399) * spec.particleRadius * 0.9;
      flecks[i].position.z += Math.cos(i * 4.133) * spec.particleRadius * 0.9;
    }
    const n = mesh.resolution;
    const px = Math.max(
      1,
      Math.min(
        n - 2,
        Math.round(
          ((flecks[i].position.x - fluidCenter.x) / (2 * half) + 0.5) * n,
        ),
      ),
    );
    const pz = Math.max(
      1,
      Math.min(
        n - 2,
        Math.round(
          ((flecks[i].position.z - fluidCenter.z) / (2 * half) + 0.5) * n,
        ),
      ),
    );
    for (let y = n - 3; y > 1; y--) {
      const value = mesh.field[px + y * n + pz * n * n];
      if (value < mesh.isolation) continue;
      const above = mesh.field[px + (y + 1) * n + pz * n * n];
      const fraction = (value - mesh.isolation) / (value - above);
      flecks[i].position.y =
        fluidCenter.y +
        (((y + fraction) / n) * 2 - 1) * half * verticalScale +
        (spec.flecks === 'chilli' ? 0.002 : 0.012);
      break;
    }
  }
}

export function createIngredient(id) {
  const spec = CATALOG[id],
    group = new THREE.Group();
  group.userData.id = id;
  if (spec.mode === 'sheet') {
    sheet(group, spec);
    return group;
  }
  if (spec.mode === 'fluid') {
    makeFluid(group, spec);
    return group;
  }
  if (spec.mode === 'cluster') {
    clusterParts(spec).forEach((part, i) => {
      const piece = new THREE.Group();
      piece.position.set(...part.position);
      piece.userData.partIndex = i;
      group.add(piece);
      if (id === 'falafel')
        roughLump(
          piece,
          spec.color,
          'falafel',
          [part.radius, part.radius, part.radius],
          i + 9,
        );
      else {
        const ring = addMesh(
          piece,
          new THREE.TorusGeometry(
            part.radius * 0.78,
            id === 'onion' ? 0.045 : 0.064,
            7,
            32,
          ),
          spec.color,
        );
        ring.rotation.x = -Math.PI / 2;
        const inner = addMesh(
          piece,
          new THREE.TorusGeometry(part.radius * 0.78 - 0.015, 0.015, 5, 32),
          id === 'onion' ? '#f2c5dc' : '#bdd079',
          'plain',
          [0, id === 'onion' ? 0.034 : 0.055, 0],
        );
        inner.rotation.x = -Math.PI / 2;
        if (id === 'jalapeno') {
          const glossKey = 'jalapeno-glaze';
          if (!materialCache.has(glossKey))
            materialCache.set(
              glossKey,
              new THREE.MeshPhongMaterial({
                color: '#7f923d',
                shininess: 58,
                specular: '#dce093',
              }),
            );
          ring.material = materialCache.get(glossKey);
          disk(piece, 0.058, 0.066, '#d1dc8b', 'plain', 0.004);
          for (let k = 0; k < 3; k++) {
            const a = (k * Math.PI * 2) / 3;
            const points = [0.02, 0.09, part.radius * 0.7].map(
              (r, j) =>
                new THREE.Vector3(
                  Math.cos(a + j * 0.09) * r,
                  0.027,
                  Math.sin(a + j * 0.09) * r,
                ),
            );
            addMesh(
              piece,
              new THREE.TubeGeometry(
                new THREE.CatmullRomCurve3(points),
                10,
                0.019,
                6,
                false,
              ),
              '#c9d47c',
            );
            for (let j = 0; j < 3; j++) {
              const r = 0.064 + j * 0.043,
                t = a + (j % 2 ? 0.2 : -0.17);
              const seed = addMesh(
                piece,
                new THREE.SphereGeometry(1, 7, 5),
                '#f4e2a0',
                'plain',
                [Math.cos(t) * r, 0.046, Math.sin(t) * r],
              );
              seed.scale.set(0.027, 0.01, 0.017);
              seed.rotation.y = a + 0.4;
            }
          }
        }
      }
    });
    return group;
  }
  switch (id) {
    case 'bun': {
      const profile = [
        [0, -0.19],
        [0.85, -0.19],
        [1.07, -0.13],
        [1.14, 0.06],
        [1.1, 0.18],
        [0, 0.18],
      ].map((p) => new THREE.Vector2(...p));
      addMesh(group, new THREE.LatheGeometry(profile, 48), '#dca05c', 'crust');
      const face = addMesh(
        group,
        new THREE.CircleGeometry(1.07, 48),
        '#ffe5b2',
        'crumb',
        [0, 0.19, 0],
      );
      face.rotation.x = -Math.PI / 2;
      break;
    }
    case 'top': {
      const profile = [
        [0, -0.31],
        [0.9, -0.31],
        [1.1, -0.23],
        [1.13, -0.1],
        [1.05, 0.12],
        [0.82, 0.24],
        [0.44, 0.31],
        [0, 0.32],
      ].map((p) => new THREE.Vector2(...p));
      addMesh(group, new THREE.LatheGeometry(profile, 48), '#e6a54e', 'crust');
      const rand = random(67);
      for (let i = 0; i < 30; i++) {
        const a = rand() * Math.PI * 2,
          r = Math.sqrt(rand()) * 0.91,
          x = Math.cos(a) * r,
          z = Math.sin(a) * r;
        const surfaceY =
          r < 0.44
            ? 0.32 - (r / 0.44) * 0.01
            : r < 0.82
              ? 0.31 - ((r - 0.44) / 0.38) * 0.07
              : 0.24 - ((r - 0.82) / 0.23) * 0.12;
        const seed = addMesh(
          group,
          new THREE.SphereGeometry(1, 6, 4),
          '#fff1cd',
          'plain',
          [x, surfaceY + 0.012, z],
        );
        seed.scale.set(0.025, 0.014, 0.073);
        seed.rotation.set(0, rand() * Math.PI, -x * 0.45);
      }
      break;
    }
    case 'milk-bread': {
      extrude(group, breadShape(), 0.3, '#d7944b', 'crust');
      const face = extrude(
        group,
        breadShape(),
        0.015,
        '#fff0cb',
        'crumb',
        0.165,
      );
      face.scale.set(0.91, 1, 0.91);
      break;
    }
    case 'sourdough':
      disk(group, 1.3, 0.28, '#b78349', 'crumb', 0, 0.89 / 1.3);
      {
        const face = addMesh(
          group,
          new THREE.CircleGeometry(1.24, 48),
          '#f4ddb1',
          'crumb',
          [0, 0.145, 0],
        );
        face.rotation.x = -Math.PI / 2;
        face.scale.y = 0.64;
      }
      break;
    case 'focaccia':
      addFocaccia(group, gradient);
      break;
    case 'tofu':
      box(group, 1.82, 0.26, 1.56, spec.color, [0, 0, 0], 'plain', 0.07);
      box(group, 1.72, 0.016, 1.46, spec.color, [0, 0.13, 0], 'tofu', 0.008);
      break;
    case 'brie': {
      const shape = new THREE.Shape();
      shape.moveTo(-0.85, -0.57);
      shape.lineTo(0.85, -0.38);
      shape.lineTo(0.45, 0.56);
      shape.lineTo(-0.77, 0.5);
      shape.closePath();
      extrude(group, shape, 0.27, '#f4d38e');
      extrude(group, shape, 0.025, '#fff5df', 'plain', 0.14);
      break;
    }
    case 'bacon': {
      sheet(group, spec);
      // Crisp bacon keeps its baked corrugation; it does not use the flexible skin.
      delete group.userData.surface;
      break;
    }
    case 'tamago': {
      box(group, 2.04, 0.5, 1.56, '#f4d474', [0, 0, 0], 'plain', 0.095);
      box(group, 1.96, 0.025, 1.48, '#f1cb68', [0, 0.244, 0], 'tamago', 0.012);
      for (const side of [-1, 1]) {
        const face = addMesh(
          group,
          new THREE.PlaneGeometry(1.87, 0.33),
          '#f6d875',
          'tamago-layers',
          [0, -0.005, side * 0.781],
        );
        face.rotation.y = side === 1 ? 0 : Math.PI;
        const end = addMesh(
          group,
          new THREE.PlaneGeometry(1.37, 0.33),
          '#f6d875',
          'tamago-layers',
          [side * 1.021, -0.005, 0],
        );
        end.rotation.y = (side * Math.PI) / 2;
      }
      break;
    }
    case 'chicken':
    case 'cod':
      addBatteredFood(group, spec, gradient);
      break;
    case 'avocado':
      avocadoFan(group);
      break;
    case 'cucumber': {
      const slice = addMesh(
        group,
        new THREE.CylinderGeometry(0.58, 0.58, 0.11, 48, 1),
        '#609041',
      );
      // Cylinder groups are peel, top cap, bottom cap. Both cut faces share
      // the seed pattern, including when flipped or baked into the served view.
      const flesh = material('#deebbe', 'cucumber');
      slice.material = [slice.material, flesh, flesh];
      for (let i = 0; i < 16; i++) {
        const a = (i * Math.PI) / 8;
        const ridge = addMesh(
          group,
          new THREE.SphereGeometry(0.018, 6, 4),
          '#467733',
          'plain',
          [Math.cos(a) * 0.575, 0, Math.sin(a) * 0.575],
        );
        ridge.scale.y = 2.7;
      }
      break;
    }
    case 'hash-brown': {
      addHashBrown(group, spec, gradient);
      break;
    }
    default:
      throw new Error(`Missing model for ${id}`);
  }
  return group;
}

const surfacePoint = new THREE.Vector3();
const restVertex = [0, 0, 0];
export function animateIngredient(
  group,
  item,
  dt,
  time,
  held = false,
  reduceMotion = false,
) {
  const { spec } = item;
  if (!held && item.parts) {
    if (spec.mode === 'solid') {
      group.position.copy(item.body.position);
      group.quaternion.copy(item.body.quaternion);
    } else {
      group.position.set(0, 0, 0);
      group.quaternion.identity();
    }
  }
  const surface = group.userData.surface;
  if (surface) {
    // The held sheet's bend is constant; its gentle sway is a group transform.
    // Upload that rest pose once, instead of reskinning it on every mouse frame.
    if (held && surface.heldPose === reduceMotion) return;
    surface.heldPose = held ? reduceMotion : undefined;
    item.surfaceLift = 0;
    const { base, logical, mesh } = surface,
      positions = mesh.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      restVertex[0] = base[i * 3];
      restVertex[1] = base[i * 3 + 1];
      restVertex[2] = base[i * 3 + 2];
      if (item.parts && !held)
        sampleSheet(
          item,
          logical[i * 2],
          logical[i * 2 + 1],
          restVertex,
          surfacePoint,
        );
      else {
        const edge = Math.hypot(logical[i * 2], logical[i * 2 + 1]);
        surfacePoint.set(...restVertex);
        if (!reduceMotion) surfacePoint.y -= edge * edge * 0.045 * spec.bend;
      }
      positions.setXYZ(i, surfacePoint.x, surfacePoint.y, surfacePoint.z);
    }
    positions.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
  } else if (group.userData.fluid) {
    if (item.parts && !held) updateFluid(group, spec, item);
  } else if (spec.mode === 'cluster' && item.parts && !held) {
    for (const piece of group.children) {
      const body = item.parts[piece.userData.partIndex].body;
      piece.position.copy(body.position);
      piece.quaternion.copy(body.quaternion);
    }
  } else {
    const t = item.age - item.lastImpact;
    const amount =
      !reduceMotion && t >= 0 && t < 1.2
        ? Math.sin(t * 19) *
          Math.exp(-t * 7) *
          spec.squash *
          Math.min(1, item.impact / 3)
        : 0;
    group.scale.set(1 + amount * 0.45, 1 - amount, 1 + amount * 0.45);
  }
}

export function disposeIngredient(group) {
  group.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
  });
  group.removeFromParent();
}
