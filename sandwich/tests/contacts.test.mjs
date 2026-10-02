import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CATALOG, INGREDIENTS } from '../src/catalog.mjs';
import { SandwichPhysics, sampleSheet } from '../src/physics.mjs';
import { contactHeight, collisionEnvelope } from '../src/collision-surfaces.mjs';
import { createBatteredGeometry } from '../src/battered.mjs';
import { createHashBrownGeometry } from '../src/hash-brown.mjs';
import { sheetPoint } from '../src/shapes.mjs';
import { ServingAssembly } from '../src/serving.mjs';
import * as CANNON from 'cannon-es';

function advance(p, seconds) {
  for (let i = 0; i < seconds * 120; i++) p.step(1 / 120);
}

for (const id of ['chicken', 'cod', 'hash-brown']) {
  test(`${id}: every visible crust vertex is inside the collision envelope`, () => {
    const geometry = id === 'hash-brown' ? createHashBrownGeometry(CATALOG[id]) : createBatteredGeometry(CATALOG[id]);
    const a = geometry.attributes.position;
    const points = Array.from({ length: a.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(a, i));
    const shape = new CANNON.ConvexPolyhedron(collisionEnvelope(points));
    assert.ok(shape.faces.length < 60, 'keep the detailed surface economical to collide with');
    for (let f = 0; f < shape.faces.length; f++) {
      const n = shape.faceNormals[f], limit = n.dot(shape.vertices[shape.faces[f][0]]);
      for (const p of points) assert.ok(n.dot(p) <= limit + 1e-6, `${id}: exposed crust beyond collider`);
    }
    geometry.dispose();
  });
}

// Check triangle interiors as well as vertices: smooth skinning can otherwise
// cut through a convex filling between individually safe contact points.
function assertSkinClear(item, support) {
  const n = 28, vertices = [];
  item.surfaceLift = 0;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const u = i / n * 2 - 1, v = j / n * 2 - 1;
    const rest = sheetPoint(item.spec, u, v);
    rest[1] -= item.spec.height / 2;
    vertices.push(sampleSheet(item, u, v, rest, new THREE.Vector3()));
  }
  const check = (p) => {
    for (const { body } of support.parts) {
      const top = contactHeight(body, p.x, p.z, p.y, 0.0001);
      assert.ok(top <= p.y + 0.001, `${item.id} penetrates ${support.id} by ${(top - p.y).toFixed(4)}`);
    }
  };
  vertices.forEach(check);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * (n + 1) + i;
    for (const triangle of [[k, k + n + 1, k + 1], [k + 1, k + n + 1, k + n + 2]])
      check(triangle.reduce((p, index) => p.add(vertices[index]), new THREE.Vector3()).divideScalar(3));
  }
}

for (const spec of INGREDIENTS.filter((s) => s.mode === 'sheet')) {
  test(`${spec.name} covers fried chicken without exposing its crust`, () => {
    const p = new SandwichPhysics();
    const support = p.add('chicken');
    advance(p, 4);
    const layer = p.add(spec.id);
    advance(p, 2);
    assertSkinClear(layer, support);
    advance(p, 4);
    assertSkinClear(layer, support);
  });
}

for (const id of ['cod', 'hash-brown', 'tofu', 'tamago', 'brie', 'avocado', 'focaccia']) {
  test(`provolone stays outside ${id} while retaining its drape`, () => {
    const p = new SandwichPhysics();
    const support = p.add(id);
    advance(p, 4);
    const layer = p.add('provolone', 0.17);
    advance(p, 6);
    assertSkinClear(layer, support);
  });
}

test('contact queries preserve onion holes and the open chambers between jalapeño veins', () => {
  for (const id of ['onion', 'jalapeno']) {
    const p = new SandwichPhysics(), item = p.add(id);
    const body = item.parts[0].body;
    const hole = id === 'onion' ? new CANNON.Vec3() : new CANNON.Vec3(0.06, 0, 0.104);
    body.pointToWorldFrame(hole, hole);
    assert.equal(contactHeight(body, hole.x, hole.z, hole.y, 0.001), -Infinity);
    const rim = new CANNON.Vec3(id === 'onion' ? 0.44 * 0.78 : 0.29 * 0.78, 0, 0);
    body.pointToWorldFrame(rim, rim);
    assert.ok(Number.isFinite(contactHeight(body, rim.x, rim.z, rim.y, 0.001)));
  }
});

test('served wobble keeps touching layers in contact without freezing their movement', () => {
  const models = [0, 0.4].map((y) => {
    const model = new THREE.Group();
    model.add(new THREE.Mesh(new THREE.BoxGeometry(2, 0.4, 2), new THREE.MeshBasicMaterial()));
    model.position.y = y;
    return { model, spec: CATALOG.focaccia };
  });
  const assembly = new ServingAssembly(models);
  assembly.rotate(0.8, 0.6, new THREE.Quaternion());
  for (let i = 0; i < 15; i++) assembly.step(1 / 60, new THREE.Quaternion(), true);
  const face = (entry, top) => {
    const mesh = entry.group.children[0], p = mesh.geometry.attributes.position;
    const rest = mesh.userData.restPositions, points = [];
    for (let i = 0; i < p.count; i++) if (Math.abs(rest[i * 3 + 1] - (top ? 0.2 : -0.2)) < 1e-5)
      points.push(new THREE.Vector3().fromBufferAttribute(p, i).add(entry.group.position));
    return points;
  };
  const lower = face(assembly.entries[0], true), upper = face(assembly.entries[1], false);
  for (const p of lower) assert.ok(upper.some((q) => q.distanceTo(p) < 1e-6));
  assert.notEqual(assembly.entries[1].group.children[0].geometry.attributes.position.getX(0), 1);
  assembly.dispose();
});
