import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cutGeometry } from '../src/cutting.mjs';
import {
  AnchoredSpring,
  ServingAssembly,
} from '../src/serving.mjs';
import { CATALOG } from '../src/catalog.mjs';
import { createFocacciaGeometry, focacciaTop } from '../src/focaccia.mjs';
import { createBatteredGeometry } from '../src/battered.mjs';

function area(geometry) {
  const p = geometry.attributes.position,
    a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3();
  let result = 0;
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i);
    b.fromBufferAttribute(p, i + 1);
    c.fromBufferAttribute(p, i + 2);
    result += b.sub(a).cross(c.sub(a)).length() / 2;
  }
  return result;
}

test('fried protein cuts retain coloured crust and a filled interior', () => {
  for (const id of ['chicken', 'cod']) {
    const geometry = createBatteredGeometry(CATALOG[id]);
    const halves = cutGeometry(geometry, 0.13);
    for (const { cap, skin } of halves) {
      assert.ok(area(cap) > 0.75, `${id} should have a solid meat cross-section`);
      assert.equal(skin.attributes.color.count, skin.attributes.position.count);
      for (const attribute of Object.values(skin.attributes))
        assert.ok([...attribute.array].every(Number.isFinite));
      cap.dispose();
      skin.dispose();
    }
    geometry.dispose();
  }
});

test('porous focaccia has a complete finite mesh within its sandwich footprint', () => {
  const geometry = createFocacciaGeometry();
  const bounds = geometry.boundingBox;
  assert.ok(bounds.max.x - bounds.min.x > 2.3);
  assert.ok(
    bounds.max.z - bounds.min.z > 1.9,
    'the full loaf must survive the mesh buffer limit',
  );
  assert.ok(
    bounds.min.y >= -0.241 && bounds.max.y < 0.29,
    'surface detail must stay close to the collision envelope',
  );
  assert.equal(
    geometry.groups.length,
    2,
    'crumb and glazed crust use two draw calls',
  );
  assert.ok(geometry.index.count / 3 < 60000);
  for (const attribute of Object.values(geometry.attributes))
    assert.ok([...attribute.array].every(Number.isFinite));
  geometry.dispose();
});

test('focaccia centre and offset cuts preserve open crumb chambers', () => {
  const geometry = createFocacciaGeometry();
  for (const x of [-0.31, 0, 0.27]) {
    let envelope = 0;
    for (let z = -0.97; z < 0.97; z += 0.005)
      envelope += (focacciaTop(x, z) + 0.24) * 0.005;
    const halves = cutGeometry(geometry, x);
    for (const { cap, skin } of halves) {
      const filled = area(cap);
      assert.ok(
        filled > envelope * 0.25,
        'aeration must leave connected crumb around the pockets',
      );
      assert.ok(
        filled < envelope * 0.9,
        'the cut must retain actual air pockets instead of capping them shut',
      );
      cap.dispose();
      skin.dispose();
    }
  }
  geometry.dispose();
});

test('a centre cut produces two bounded skins and complete, oppositely facing caps', () => {
  const source = new THREE.BoxGeometry(2, 0.4, 3);
  const original = source.attributes.position.array.slice();
  const halves = cutGeometry(source);
  halves.forEach(({ skin, cap }, i) => {
    assert.ok(cap.attributes.position.count > 0);
    assert.ok(Math.abs(area(cap) - 1.2) < 1e-5);
    const p = skin.attributes.position;
    for (let n = 0; n < p.count; n++)
      assert.ok(i ? p.getX(n) >= -1e-6 : p.getX(n) <= 1e-6);
    assert.equal(cap.attributes.normal.getX(0), i ? -1 : 1);
  });
  assert.deepEqual(
    source.attributes.position.array,
    original,
    'cutting must not change the build mesh',
  );
});

test('cross-section caps preserve the hole through a ring', () => {
  const ring = new THREE.TorusGeometry(0.7, 0.15, 16, 64);
  ring.rotateY(Math.PI / 2);
  const halves = cutGeometry(ring, 0.001);
  const expected = Math.PI * ((0.7 + 0.15) ** 2 - (0.7 - 0.15) ** 2);
  for (const { cap } of halves) {
    assert.ok(
      Math.abs(area(cap) - expected) < 0.015,
      `${area(cap)} should be an annulus, not a filled disc`,
    );
    const p = cap.attributes.position;
    for (let i = 0; i < p.count; i += 3) {
      const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      const z = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
      assert.ok(Math.hypot(y, z) > 0.5, 'triangles must not fill the hole');
    }
  }
});

test('off-centre cuts through a deformed thin layer retain UVs and material groups', () => {
  const source = new THREE.BoxGeometry(2, 0.055, 2, 6, 1, 6);
  const p = source.attributes.position;
  for (let i = 0; i < p.count; i++)
    p.setY(i, p.getY(i) + Math.sin(p.getX(i) * 2) * 0.1);
  source.rotateZ(0.13);
  const halves = cutGeometry(source, 0.17);
  for (const { skin, cap } of halves) {
    assert.ok(area(cap) > 0.08);
    assert.equal(skin.attributes.uv.count, skin.attributes.position.count);
    assert.ok(skin.groups.length > 1);
    assert.ok([...skin.attributes.position.array].every(Number.isFinite));
  }
});

test('served layers stay anchored with bounded flex under sustained rotation, then settle', () => {
  const sources = ['focaccia', 'provolone'].map((id, i) => {
    const model = new THREE.Mesh(
      new THREE.BoxGeometry(2, 0.4, 2), new THREE.MeshBasicMaterial(),
    );
    model.position.y = i * 0.4;
    return { model, spec: CATALOG[id] };
  });
  const assembly = new ServingAssembly(sources);
  const anchors = assembly.entries.map(({ group }) => group.position.clone());
  const camera = new THREE.Quaternion();
  const displacement = () => Math.max(...assembly.entries.flatMap(({ group }) =>
    group.children.flatMap((mesh) => Array.from(mesh.geometry.attributes.position.array,
      (value, i) => Math.abs(value - mesh.userData.restPositions[i]))),
  ));
  try {
    let moved = false;
    for (let i = 0; i < 600; i++) {
      assembly.rotate(0.4, -0.3, camera);
      assembly.step(1 / 60, camera, true);
      const bend = displacement();
      moved ||= bend > 0.001;
      assert.ok(bend < 0.1, 'flex stays small relative to the sandwich');
      assembly.entries.forEach(({ group }, index) =>
        assert.ok(group.position.equals(anchors[index]), 'layers cannot detach'));
    }
    assert.ok(moved, 'rotation must still flex the visible food');
    for (let i = 0; i < 600; i++) assembly.step(1 / 60, camera);
    assert.ok(displacement() < 0.0001, 'the visible skins return to their resting shape');
  } finally {
    assembly.dispose();
    for (const { model } of sources) {
      model.geometry.dispose();
      model.material.dispose();
    }
  }
});

test('springs have consistent decay across frame rates and respect reduced motion', () => {
  const results = [30, 60, 120].map((fps) => {
    const spring = new AnchoredSpring();
    spring.impulse(1, 0.5);
    for (let i = 0; i < fps / 2; i++) spring.step(1 / fps);
    return spring.x;
  });
  assert.ok(Math.max(...results) - Math.min(...results) < 1e-5);
  const spring = new AnchoredSpring();
  spring.impulse(3, 2);
  spring.step(0.05);
  spring.step(0.05, true);
  assert.equal(spring.x + spring.z + spring.vx + spring.vz, 0);
});

test('serving snapshots preserve original meshes and never drift through repeated full turns', () => {
  const model = new THREE.Group();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.4, 2),
    new THREE.MeshBasicMaterial(),
  );
  model.add(mesh);
  model.position.set(0.3, 0.8, -0.1);
  const before = model.position.clone(),
    geometry = mesh.geometry.attributes.position.array.slice();
  const serving = new ServingAssembly([{ model, spec: CATALOG.focaccia }]);
  const anchor = serving.entries[0].group.position.clone();
  for (let i = 0; i < 500; i++) {
    serving.rotate(0.15, 0.08, new THREE.Quaternion());
    serving.step(1 / 60, new THREE.Quaternion(), true);
  }
  assert.ok(serving.entries[0].group.position.equals(anchor));
  assert.ok(Math.abs(serving.root.quaternion.length() - 1) < 1e-8);
  assert.ok(model.position.equals(before));
  assert.deepEqual(mesh.geometry.attributes.position.array, geometry);
  serving.dispose();
  assert.deepEqual(mesh.geometry.attributes.position.array, geometry);
});

function knifeFixture(height = 1.4) {
  const model = new THREE.Group();
  model.add(new THREE.Mesh(
    new THREE.BoxGeometry(2, height, 2), new THREE.MeshBasicMaterial(),
  ));
  const serving = new ServingAssembly([{ model, spec: CATALOG['milk-bread'] }]);
  // The animation checks need a cut-face material, but no browser canvas texture.
  serving.capMaterials.set('milk-bread', new THREE.MeshBasicMaterial({ map: new THREE.Texture() }));
  return serving;
}

test('the knife starts at its visible home and saws downward even after rotating a tall stack', () => {
  for (const height of [0.4, 3.2]) {
    const serving = knifeFixture(height);
    serving.root.quaternion.setFromEuler(new THREE.Euler(0.8, -1.1, 0.9));
    serving.root.updateMatrixWorld(true);
    const home = new THREE.Vector3(0, serving.root.position.y + height / 2 + 3, 1);
    const resting = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 1.22, -Math.PI / 2));
    const localHome = serving.root.worldToLocal(home.clone());
    const localResting = serving.root.quaternion.clone().invert().multiply(resting);
    serving.toggleCut(false, localHome, localResting, 0.4);
    assert.ok(serving.knife.getWorldPosition(new THREE.Vector3()).distanceTo(home) < 1e-8);

    let previousY = Infinity;
    const sawDepths = [];
    for (let i = 1; i <= 184; i++) {
      serving.step(0.01, new THREE.Quaternion());
      const t = i / 100;
      const position = serving.knife.getWorldPosition(new THREE.Vector3());
      if (t > 0.42 && t < 1.22) {
        assert.ok(position.y < previousY, 'every cutting frame must descend');
        assert.ok(Math.abs(position.x) < 1e-8, 'the blade must stay on the cut plane');
        assert.ok(serving.root.quaternion.angleTo(new THREE.Quaternion()) < 1e-8);
        previousY = position.y;
        sawDepths.push(position.z);
        assert.equal(serving.gap, 0, 'the halves stay together until the blade clears them');
      }
      if (t === 1.21)
        assert.ok(position.y < serving.root.position.y - height / 2 - 0.15);
    }
    assert.ok(Math.min(...sawDepths) < -0.1 && Math.max(...sawDepths) > 0.1);
    assert.equal(serving.knife.visible, false);
    assert.ok(serving.knife.getWorldPosition(new THREE.Vector3()).distanceTo(home) < 1e-8);
    assert.ok(serving.knife.getWorldQuaternion(new THREE.Quaternion()).angleTo(resting) < 1e-7);
    assert.ok(serving.gap > 0.98);
    serving.toggleCut(true);
    serving.step(0.01, new THREE.Quaternion(), false, true);
    assert.equal(serving.gap, 0);
    assert.equal(serving.whole.visible, true);
    serving.dispose();
  }
});

test('reduced motion cuts immediately, and an active stroke cannot be turned or restarted', () => {
  const serving = knifeFixture();
  serving.toggleCut(true);
  serving.step(1 / 60, new THREE.Quaternion(), false, true);
  assert.equal(serving.knifeTime, -1);
  assert.equal(serving.knife.visible, false);
  assert.equal(serving.gap, 1);
  serving.toggleCut(true);
  serving.step(1 / 60, new THREE.Quaternion(), false, true);
  serving.toggleCut();
  serving.step(0.1, new THREE.Quaternion());
  const rotation = serving.root.quaternion.clone();
  const elapsed = serving.knifeTime;
  serving.rotate(0.5, 0.5, new THREE.Quaternion());
  serving.toggleCut();
  assert.equal(serving.knifeTime, elapsed);
  assert.ok(serving.root.quaternion.equals(rotation));
  assert.equal(serving.cut, true);
  serving.dispose();
});

test('a resting served sandwich stops uploading vertices and wakes for rotation, bell, and cut', () => {
  const serving = knifeFixture();
  const camera = new THREE.Quaternion();
  assert.equal(serving.step(1 / 60, camera), true);
  const position = serving.entries[0].group.children[0].geometry.attributes.position;
  const version = position.version;
  assert.equal(serving.step(1 / 60, camera), false);
  assert.equal(position.version, version);
  serving.rotate(0.3, 0.1, camera);
  assert.equal(serving.step(1 / 60, camera), true);
  for (let f = 0; f < 720; f++) serving.step(1 / 60, camera);
  assert.equal(serving.step(1 / 60, camera), false);
  serving.ring();
  assert.equal(serving.step(1 / 60, camera), true);
  serving.toggleCut(true);
  assert.equal(serving.step(1 / 60, camera, false, true), true);
  assert.equal(serving.gap, 1);
  assert.equal(serving.step(1 / 60, camera, false, true), false);
  serving.dispose();
});
